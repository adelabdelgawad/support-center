"""
File service with MinIO object storage, Celery async uploads, compression and optimization.
Enhanced with centralized logging and error handling.

REFACTORED:
- Replaced SMB with MinIO object storage
- Integrated Celery for async file operations
- Database-driven file extension validation
- SHA256 integrity validation
"""

import hashlib
import io
import logging
import uuid
from pathlib import Path
from typing import BinaryIO, Optional
from uuid import UUID

import magic
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import Screenshot, ServiceRequest
from api.services.minio_service import MinIOStorageService
# Note: task imports are done lazily to avoid circular imports

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class FileService:
    """Service for managing file uploads with MinIO storage and Celery async operations."""

    @staticmethod
    @log_database_operation("image compression", level="debug")
    def _compress_image(
        image_bytes: bytes, quality: int = 85
    ) -> tuple[bytes, int]:
        """
        Compress an image in memory.

        Args:
            image_bytes: Input image bytes
            quality: JPEG quality (1-100)

        Returns:
            Tuple of (compressed bytes, compressed size)
        """
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                # Convert RGBA to RGB if necessary
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(
                        img,
                        mask=img.split()[-1] if img.mode == "RGBA" else None,
                    )
                    img = background

                # Save to buffer with compression
                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=quality, optimize=True)

                compressed_bytes = buffer.getvalue()
                return compressed_bytes, len(compressed_bytes)
        except Exception as e:
            logger.warning(f"Image compression failed: {e}, using original")
            # If compression fails, return original
            return image_bytes, len(image_bytes)

    @staticmethod
    @log_database_operation("thumbnail creation", level="debug")
    def _create_thumbnail(
        image_bytes: bytes, size: tuple = (200, 200)
    ) -> Optional[bytes]:
        """
        Create a thumbnail for an image in memory.

        Args:
            image_bytes: Input image bytes
            size: Thumbnail size (width, height)

        Returns:
            Thumbnail bytes or None if failed
        """
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                img.thumbnail(size, Image.Resampling.LANCZOS)

                # Convert RGBA to RGB if necessary
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(
                        img,
                        mask=img.split()[-1] if img.mode == "RGBA" else None,
                    )
                    img = background

                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=85, optimize=True)
                return buffer.getvalue()
        except Exception as e:
            logger.warning(f"Thumbnail creation failed: {e}")
            return None

    @staticmethod
    @transactional_database_operation("upload_file")
    @log_database_operation("file upload", level="debug")
    async def upload_file(
        db: AsyncSession,
        request_id: UUID,
        user_id: int,
        file: BinaryIO,
        filename: str,
    ) -> Screenshot:
        """
        Upload and process a file - saves locally and dispatches Celery task for MinIO.

        Args:
            db: Database session
            request_id: Request ID
            user_id: User ID uploading the file
            file: File object
            filename: Original filename

        Returns:
            Created attachment record (upload_status='pending')
        """
        # Lazy import to avoid circular dependency
        from tasks.minio_file_tasks import upload_file_to_minio, upload_thumbnail_to_minio

        # Verify request exists
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        result = await db.execute(stmt)
        request = result.scalar_one_or_none()

        if not request:
            raise ValueError("Service request not found")

        # Read file content into memory
        content = file.read()
        original_size = len(content)

        # Check file size
        max_size_bytes = settings.minio.max_file_size_mb * 1024 * 1024
        if original_size > max_size_bytes:
            raise ValueError(
                f"File size exceeds maximum of {settings.minio.max_file_size_mb} MB"
            )

        # Check if file extension is allowed (database-driven validation)
        ext = Path(filename).suffix.lower().lstrip(".")
        allowed_extensions = await FileService.get_allowed_extensions(db, is_image_only=False)
        if ext not in allowed_extensions:
            raise ValueError(
                f"File extension .{ext} is not allowed. Allowed extensions: {', '.join(allowed_extensions)}"
            )

        # Detect MIME type from bytes
        mime = magic.Magic(mime=True)
        mime_type = mime.from_buffer(content)

        # Initialize variables
        final_content = content
        file_size = original_size

        # Generate unique filename for storage
        unique_filename = f"{uuid.uuid4()}.{ext}"

        # Create temp directory if not exists
        temp_dir = Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)

        # Generate temporary filenames
        temp_main_path = temp_dir / f"main_{unique_filename}"
        temp_thumb_path = temp_dir / f"thumb_{unique_filename}" if mime_type.startswith("image/") else None

        # Compress images and create thumbnail
        if mime_type.startswith("image/"):
            # Compress image
            compressed_bytes, compressed_size_val = (
                FileService._compress_image(content, quality=85)
            )

            # Only use compressed version if it's smaller
            if compressed_size_val < original_size:
                final_content = compressed_bytes
                file_size = compressed_size_val
                logger.info(
                    f"Image compressed from {original_size} to {compressed_size_val} bytes"
                )

            # Create thumbnail and save locally
            thumbnail_bytes = FileService._create_thumbnail(final_content)
            if thumbnail_bytes and temp_thumb_path:
                with open(temp_thumb_path, "wb") as f:
                    f.write(thumbnail_bytes)
                logger.info(f"Thumbnail saved locally: {temp_thumb_path}")

        # Save main file to temporary local storage
        with open(temp_main_path, "wb") as f:
            f.write(final_content)
        logger.info(f"File saved to temporary storage: {temp_main_path}")

        # Create attachment record with pending status
        attachment = Screenshot(
            request_id=request_id,
            chat_message_id=None,  # Not linked to chat message (for general attachments)
            uploaded_by=user_id,
            filename=filename,
            file_size=file_size,
            mime_type=mime_type,
            minio_object_key=None,  # Will be set by Celery task
            bucket_name=settings.minio.bucket_name,
            file_hash=None,  # Will be calculated by Celery task
            upload_status="pending",
            is_corrupted=False,
        )

        db.add(attachment)
        await db.commit()
        await db.refresh(attachment)

        # Dispatch Celery task for MinIO upload
        task = upload_file_to_minio.delay(
            attachment_id=attachment.id,
            local_file_path=str(temp_main_path),
            storage_type="attachments",
            request_id=str(request_id),
            filename=unique_filename,
        )

        # Store task ID
        attachment.celery_task_id = task.id
        await db.commit()
        await db.refresh(attachment)

        logger.info(f"Dispatched MinIO upload task {task.id} for attachment {attachment.id}")

        # Dispatch thumbnail upload if exists (best effort)
        if temp_thumb_path and temp_thumb_path.exists():
            thumb_task = upload_thumbnail_to_minio.delay(
                attachment_id=attachment.id,
                local_thumbnail_path=str(temp_thumb_path),
                storage_type="attachments",
                request_id=str(request_id),
                filename=f"thumb_{unique_filename}",
            )
            logger.info(f"Dispatched thumbnail upload task {thumb_task.id}")

        return attachment

    @staticmethod
    @safe_database_query("get_attachment")
    @log_database_operation("attachment retrieval", level="debug")
    async def get_attachment(
        db: AsyncSession, attachment_id: int
    ) -> Optional[Screenshot]:
        """
        Get an attachment by ID.

        Args:
            db: Database session
            attachment_id: Screenshot ID

        Returns:
            Screenshot or None
        """
        stmt = select(Screenshot).where(Screenshot.id == attachment_id)
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()

        return attachment

    @staticmethod
    @safe_database_query("get_request_attachments", default_return=[])
    @log_database_operation("request attachments retrieval", level="debug")
    async def get_request_attachments(
        db: AsyncSession, request_id: UUID
    ) -> list[Screenshot]:
        """
        Get all attachments for a request.

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            List of attachments
        """
        stmt = (
            select(Screenshot)
            .where(Screenshot.request_id == request_id)
            .order_by(Screenshot.created_at.desc())
        )

        result = await db.execute(stmt)
        attachments = result.scalars().all()

        return attachments

    @staticmethod
    async def get_presigned_download_url(
        attachment: Screenshot,
        thumbnail: bool = False,
        expiry_seconds: Optional[int] = None,
    ) -> Optional[str]:
        """
        Generate presigned URL for file download.

        Args:
            attachment: Screenshot object
            thumbnail: Get thumbnail URL instead of main file
            expiry_seconds: URL expiry time (default: from config)

        Returns:
            Presigned download URL or None if file not available
        """
        object_key = attachment.minio_thumbnail_key if thumbnail else attachment.minio_object_key

        if not object_key:
            logger.warning(
                f"No MinIO object key found for attachment {attachment.id} (thumbnail={thumbnail})"
            )
            return None

        # Check upload status
        if attachment.upload_status != "completed":
            logger.warning(
                f"Screenshot {attachment.id} upload not completed (status: {attachment.upload_status})"
            )
            return None

        expiry = expiry_seconds or settings.minio.presigned_url_expiry_download

        try:
            url = MinIOStorageService.generate_presigned_url(object_key, expiry)
            return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for attachment {attachment.id}: {e}")
            return None

    @staticmethod
    @log_database_operation("file download from MinIO", level="debug")
    async def download_file_from_minio(
        attachment: Screenshot, thumbnail: bool = False, db: Optional[AsyncSession] = None
    ) -> Optional[bytes]:
        """
        Download file content from MinIO storage with integrity validation.

        Args:
            attachment: Screenshot object
            thumbnail: Download thumbnail instead of full file
            db: Database session (optional, for corruption flagging)

        Returns:
            File bytes or None if not found or corrupted
        """
        try:
            object_key = attachment.minio_thumbnail_key if thumbnail else attachment.minio_object_key

            if not object_key:
                logger.warning(
                    f"No MinIO object key found for attachment {attachment.id}"
                )
                return None

            # Check upload status
            if attachment.upload_status != "completed":
                logger.warning(
                    f"Screenshot {attachment.id} upload not completed (status: {attachment.upload_status})"
                )
                return None

            # Download from MinIO
            content = await MinIOStorageService.download_file(object_key)

            if not content:
                logger.warning(f"File not found in MinIO: {object_key}")
                return None

            logger.info(
                f"Downloaded file from MinIO: {object_key} ({len(content)} bytes)"
            )

            # Validate file hash (only for full files, not thumbnails)
            if not thumbnail and attachment.file_hash and db:
                calculated_hash = hashlib.sha256(content).hexdigest()

                if calculated_hash != attachment.file_hash:
                    logger.error(
                        f"File corruption detected for attachment {attachment.id}: "
                        f"expected {attachment.file_hash}, got {calculated_hash}"
                    )

                    # Mark file as corrupted in database
                    stmt = (
                        update(Screenshot)
                        .where(Screenshot.id == attachment.id)
                        .values(is_corrupted=True)
                    )
                    await db.execute(stmt)
                    await db.commit()

                    logger.warning(f"Screenshot {attachment.id} flagged as corrupted")
                    return None  # Don't return corrupted files

            return content

        except Exception as e:
            logger.error(f"Failed to download file from MinIO: {e}")
            return None

    @staticmethod
    @transactional_database_operation("delete_attachment")
    @log_database_operation("attachment deletion", level="debug")
    async def delete_attachment(db: AsyncSession, attachment_id: int) -> bool:
        """
        Delete an attachment and its files from MinIO storage.

        Args:
            db: Database session
            attachment_id: Screenshot ID

        Returns:
            True if deleted, False if not found
        """
        # Lazy import to avoid circular dependency
        from tasks.minio_file_tasks import delete_file_from_minio

        stmt = select(Screenshot).where(Screenshot.id == attachment_id)
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()

        if not attachment:
            return False

        # Dispatch Celery task to delete from MinIO
        if attachment.minio_object_key:
            try:
                delete_file_from_minio.delay(
                    attachment_id=attachment.id,
                    object_key=attachment.minio_object_key,
                    thumbnail_key=attachment.minio_thumbnail_key,
                )
                logger.info(f"Dispatched MinIO deletion task for attachment {attachment.id}")
            except Exception as e:
                logger.warning(f"Failed to dispatch deletion task: {e}")
                # Continue even if task dispatch fails

        # Delete temp file if exists
        if hasattr(attachment, 'temp_local_path') and attachment.temp_local_path:
            try:
                Path(attachment.temp_local_path).unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")

        # Delete database record
        await db.delete(attachment)
        await db.commit()

        return True

    @staticmethod
    @log_database_operation("screenshot upload", level="debug")
    async def upload_screenshot(
        db: AsyncSession,
        request_id: UUID,
        file: BinaryIO,
        filename: str
    ) -> str:
        """
        Upload screenshot - saves locally and dispatches Celery task for MinIO.

        Args:
            db: Database session
            request_id: Service request ID
            file: File object
            filename: Original filename

        Returns:
            Expected MinIO path (format: screenshots/{year}/{month}/{request_id}_{filename})

        Raises:
            ValueError: If validation fails
        """
        # Read file content
        content = file.read()
        original_size = len(content)

        # Check file size
        max_size = settings.minio.max_file_size_mb * 1024 * 1024
        if original_size > max_size:
            raise ValueError(
                f"Screenshot size exceeds maximum of {settings.minio.max_file_size_mb} MB"
            )

        # Validate file extension (only images) - database-driven validation
        ext = Path(filename).suffix.lower().lstrip(".")
        allowed_image_exts = await FileService.get_allowed_extensions(db, is_image_only=True)
        if ext not in allowed_image_exts:
            raise ValueError(
                f"Screenshot must be an image file. Allowed extensions: {', '.join(allowed_image_exts)}"
            )

        # Detect MIME type
        mime = magic.Magic(mime=True)
        mime_type = mime.from_buffer(content)

        if not mime_type.startswith("image/"):
            raise ValueError("Uploaded file is not a valid image")

        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}.{ext}"

        # Compress screenshot
        final_content = content
        compressed_bytes, compressed_size = FileService._compress_image(
            content, quality=85
        )

        # Use compressed version if smaller
        if compressed_size < original_size:
            final_content = compressed_bytes
            logger.info(
                f"Screenshot compressed from {original_size} to {compressed_size} bytes"
            )

        # Create temp directory if not exists
        temp_dir = Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)

        # Save to temporary local storage
        temp_screenshot_path = temp_dir / f"screenshot_{unique_filename}"

        with open(temp_screenshot_path, "wb") as f:
            f.write(final_content)
        logger.info(f"Screenshot saved to temporary storage: {temp_screenshot_path}")

        # Build expected MinIO object key
        object_key = MinIOStorageService.build_object_key(
            storage_type="screenshots",
            request_id=request_id,
            filename=unique_filename
        )

        # Dispatch Celery task for MinIO upload (no attachment record for screenshots)
        # Screenshots are standalone files, not tracked in attachments table
        from tasks.minio_file_tasks import upload_file_to_minio

        task = upload_file_to_minio.delay(
            attachment_id=0,  # No attachment ID for screenshots
            local_file_path=str(temp_screenshot_path),
            storage_type="screenshots",
            request_id=str(request_id),
            filename=unique_filename,
        )
        logger.info(f"Dispatched MinIO upload task {task.id} for screenshot")

        # Return expected object key (actual path format)
        return object_key

    @staticmethod
    @log_database_operation("screenshot download from MinIO", level="debug")
    async def download_screenshot(screenshot_path: str) -> Optional[bytes]:
        """
        Download screenshot from MinIO storage.

        Args:
            screenshot_path: MinIO object key (e.g., screenshots/2025/12/uuid_filename.jpg)

        Returns:
            File bytes or None if not found
        """
        try:
            content = await MinIOStorageService.download_file(screenshot_path)

            if content:
                logger.info(f"Downloaded screenshot from MinIO: {screenshot_path}")
            else:
                logger.warning(f"Screenshot not found in MinIO: {screenshot_path}")

            return content

        except Exception as e:
            logger.error(f"Failed to download screenshot from MinIO: {e}")
            return None

    @staticmethod
    @transactional_database_operation("upload_chat_attachment")
    @log_database_operation("chat attachment upload", level="debug")
    async def upload_chat_attachment(
        db: AsyncSession,
        request_id: UUID,
        user_id: int,
        file: BinaryIO,
        filename: str,
    ) -> Screenshot:
        """
        Upload a file as a chat attachment - saves locally and dispatches Celery task.

        This creates the Screenshot record but doesn't link it to a ChatMessage.
        The ChatAttachmentService.link_attachments_to_message() method should
        be called separately to create the link.

        Args:
            db: Database session
            request_id: Service request ID (for organizing files)
            user_id: User ID uploading the file
            file: File object
            filename: Original filename

        Returns:
            Created attachment record (upload_status='pending')

        Raises:
            ValueError: If validation fails
        """
        # Lazy import to avoid circular dependency
        from tasks.minio_file_tasks import upload_file_to_minio

        # Read file content
        content = file.read()
        file_size = len(content)

        # Validate file size against chat-specific limit
        max_size = settings.chat_attachments.max_chat_attachment_size
        if file_size > max_size:
            raise ValueError(
                f"File size ({file_size} bytes) exceeds maximum for chat "
                f"attachments ({max_size} bytes / {max_size // 1_048_576}MB)"
            )

        # Validate extension (reuse existing logic)
        ext = Path(filename).suffix.lower().lstrip(".")
        allowed_extensions = await FileService.get_allowed_extensions(
            db, is_image_only=False
        )
        if ext not in allowed_extensions:
            raise ValueError(
                f"File extension .{ext} is not allowed. "
                f"Allowed: {', '.join(allowed_extensions)}"
            )

        # Detect MIME type
        mime = magic.Magic(mime=True)
        mime_type = mime.from_buffer(content)

        # Initialize variables
        final_content = content
        final_size = file_size

        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}.{ext}"

        # Process images (compression)
        if mime_type.startswith("image/"):
            compressed_bytes, compressed_size = FileService._compress_image(content, quality=85)
            if compressed_size < file_size:
                final_content = compressed_bytes
                final_size = compressed_size
                logger.info(
                    f"Chat attachment image compressed from {file_size} to {compressed_size} bytes"
                )

        # Create temp directory if not exists
        temp_dir = Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)

        # Save to temporary local storage
        temp_chat_path = temp_dir / f"chat_{unique_filename}"

        with open(temp_chat_path, "wb") as f:
            f.write(final_content)
        logger.info(f"Chat attachment saved to temporary storage: {temp_chat_path}")

        # Create attachment record (NO chat_message_id yet - will be linked later)
        logger.info(f"📝 Creating attachment record for {filename}")
        attachment = Screenshot(
            request_id=request_id,  # Link to service request for organization
            chat_message_id=None,  # Will be set when linking to message
            uploaded_by=user_id,
            filename=filename,
            file_size=final_size,
            mime_type=mime_type,
            minio_object_key=None,  # Will be set by Celery task
            bucket_name=settings.minio.bucket_name,
            file_hash=None,  # Will be calculated by Celery task
            upload_status="pending",
            is_corrupted=False,
        )

        logger.info("💾 Saving attachment to database...")
        db.add(attachment)
        await db.commit()
        await db.refresh(attachment)

        # Verify the attachment was saved by querying it back
        verify_stmt = select(Screenshot).where(Screenshot.id == attachment.id)
        verify_result = await db.execute(verify_stmt)
        verified_attachment = verify_result.scalar_one_or_none()

        if verified_attachment:
            logger.info(
                f"✅ Chat attachment saved successfully - "
                f"ID: {attachment.id}, Filename: {filename}, Size: {final_size} bytes, "
                f"upload_status: {attachment.upload_status}, chat_message_id: {attachment.chat_message_id}"
            )
        else:
            logger.error(f"❌ Failed to verify attachment in database - ID: {attachment.id}")

        # Dispatch Celery task for MinIO upload
        task = upload_file_to_minio.delay(
            attachment_id=attachment.id,
            local_file_path=str(temp_chat_path),
            storage_type="chat_attachments",
            request_id=str(request_id),
            filename=unique_filename,
        )

        # Store task ID
        attachment.celery_task_id = task.id
        await db.commit()
        await db.refresh(attachment)

        logger.info(f"Dispatched MinIO upload task {task.id} for chat attachment {attachment.id}")

        return attachment
