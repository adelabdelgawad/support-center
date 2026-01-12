"""
Screenshot service for handling screenshot uploads with MinIO + Celery integration.

Screenshots are stored as Attachments with storage_type='screenshot'.
"""

import io
import logging
import secrets
import uuid
from pathlib import Path
from typing import BinaryIO, List, Optional
from uuid import UUID

import magic
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.async_utils import run_blocking
from core.config import settings
from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import Screenshot, ServiceRequest
from services.minio_service import MinIOStorageService

# Note: task imports are done lazily to avoid circular imports

# Module-level logger
logger = logging.getLogger(__name__)


class ScreenshotService:
    """Service for managing screenshot uploads."""

    @staticmethod
    @log_database_operation("screenshot compression", level="debug")
    async def _compress_screenshot(
        image_bytes: bytes, quality: int = 85, max_size: tuple = (1920, 1080)
    ) -> tuple[bytes, int]:
        """
        Compress and resize screenshot.

        Args:
            image_bytes: Input image bytes
            quality: JPEG quality (1-100)
            max_size: Maximum dimensions (width, height)

        Returns:
            Tuple of (compressed bytes, compressed size)
        """
        try:
            # Open image (blocking PIL operation)
            img = await run_blocking(Image.open, io.BytesIO(image_bytes))

            try:
                # Resize if larger than max_size
                if img.width > max_size[0] or img.height > max_size[1]:
                    await run_blocking(img.thumbnail, max_size, Image.Resampling.LANCZOS)
                    logger.info(
                        f"Screenshot resized from original to {img.width}x{img.height}"
                    )

                # Convert RGBA to RGB
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = await run_blocking(img.convert, "RGBA")
                    background.paste(
                        img,
                        mask=img.split()[-1] if img.mode == "RGBA" else None,
                    )
                    img = background

                # Save with compression (blocking)
                buffer = io.BytesIO()
                await run_blocking(img.save, buffer, format="JPEG", quality=quality, optimize=True)

                compressed_bytes = buffer.getvalue()
                return compressed_bytes, len(compressed_bytes)
            finally:
                await run_blocking(img.close)
        except Exception as e:
            logger.warning(
                f"Screenshot compression failed: {e}, using original"
            )
            return image_bytes, len(image_bytes)

    @staticmethod
    @transactional_database_operation("upload_screenshot")
    @log_database_operation("screenshot upload", level="debug")
    async def upload_screenshot(
        db: AsyncSession,
        request_id: UUID,
        user_id: UUID,
        file: BinaryIO,
        filename: str,
    ) -> Screenshot:
        """
        Upload screenshot - saves locally and dispatches Celery task for MinIO.

        Creates an Screenshot record with storage_type='screenshot'.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User UUID uploading the screenshot
            file: File object
            filename: Original filename

        Returns:
            Created attachment record (upload_status='pending')

        Raises:
            ValueError: If validation fails
        """
        # Lazy import to avoid circular dependency
        from tasks.minio_file_tasks import upload_file_to_minio

        # Verify request exists
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        result = await db.execute(stmt)
        request = result.scalar_one_or_none()

        if not request:
            raise ValueError("Service request not found")

        # Read file content
        content = file.read()
        original_size = len(content)

        # Check file size
        max_size = settings.minio.max_file_size_mb * 1024 * 1024
        if original_size > max_size:
            raise ValueError(
                f"Screenshot size exceeds maximum of {settings.minio.max_file_size_mb} MB"
            )

        # Validate extension (only images)
        ext = Path(filename).suffix.lower().lstrip(".")
        allowed_image_exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp"]
        if ext not in allowed_image_exts:
            raise ValueError(
                f"Screenshot must be an image file. Allowed: {', '.join(allowed_image_exts)}"
            )

        # Detect MIME type
        mime = magic.Magic(mime=True)
        mime_type = mime.from_buffer(content)

        if not mime_type.startswith("image/"):
            raise ValueError("Uploaded file is not a valid image")

        # Compress and resize screenshot (now async)
        compressed_bytes, compressed_size = (
            await ScreenshotService._compress_screenshot(
                content, quality=85, max_size=(1920, 1080)
            )
        )

        final_content = compressed_bytes
        file_size = compressed_size

        logger.info(
            f"Screenshot compressed from {original_size} to {compressed_size} bytes"
        )

        # Generate unique filename for storage and DB
        # Add random prefix/suffix to ensure uniqueness even with same original filename
        random_prefix = secrets.token_hex(4)  # 8 hex chars
        random_suffix = secrets.token_hex(4)  # 8 hex chars
        original_name = Path(filename).stem  # Filename without extension
        unique_filename = f"{random_prefix}_{original_name}_{random_suffix}.jpg"

        # Create temp directory if not exists
        temp_dir = Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)

        # Save to temporary local storage (wrap blocking file I/O)
        temp_screenshot_path = temp_dir / f"screenshot_{unique_filename}"

        # Use aiofiles for async file write, or wrap blocking call
        # For simplicity, wrap the blocking file write
        def _write_file():
            with open(temp_screenshot_path, "wb") as f:
                f.write(final_content)

        await run_blocking(_write_file)
        logger.info(
            f"Screenshot saved to temporary storage: {temp_screenshot_path}"
        )

        # Create attachment record with pending status
        attachment = Screenshot(
            request_id=request_id,
            chat_message_id=None,  # Can be linked to chat message later
            uploaded_by=user_id,
            filename=unique_filename,  # Use unique filename to avoid duplicates
            file_size=file_size,
            mime_type="image/jpeg",  # Always JPEG after compression
            minio_object_key=None,  # Will be set by Celery task
            bucket_name=settings.minio.bucket_name,
            file_hash=None,  # Will be calculated by Celery task
            upload_status="pending",
            is_corrupted=False,
            temp_local_path=str(
                temp_screenshot_path
            ),  # Store temp path for cleanup/retrieval
        )

        db.add(attachment)
        await db.commit()
        await db.refresh(attachment)

        logger.info(
            f"✅ Screenshot attachment created - ID: {attachment.id}, "
            f"Filename: {filename}, Size: {file_size} bytes"
        )

        # Dispatch Celery task for MinIO upload
        task = upload_file_to_minio.delay(
            attachment_id=attachment.id,
            local_file_path=str(temp_screenshot_path),
            storage_type="screenshots",
            request_id=str(request_id),
            filename=unique_filename,
        )

        # Store task ID
        attachment.celery_task_id = task.id
        await db.commit()
        await db.refresh(attachment)

        logger.info(
            f"Dispatched MinIO upload task {task.id} for screenshot {attachment.id}"
        )

        return attachment

    @staticmethod
    @safe_database_query("get_screenshot")
    @log_database_operation("screenshot retrieval", level="debug")
    async def get_screenshot(
        db: AsyncSession, screenshot_id: int
    ) -> Optional[Screenshot]:
        """
        Get screenshot by ID.

        Args:
            db: Database session
            screenshot_id: Screenshot attachment ID

        Returns:
            Screenshot or None
        """
        stmt = select(Screenshot).where(
            Screenshot.id == screenshot_id,
            # Optional: verify it's a screenshot by checking MIME type
            # Screenshot.mime_type.like("image/%")
        )
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()

        return attachment

    @staticmethod
    @safe_database_query("get_request_screenshots", default_return=[])
    @log_database_operation("request screenshots retrieval", level="debug")
    async def get_request_screenshots(
        db: AsyncSession, request_id: UUID
    ) -> list[Screenshot]:
        """
        Get all screenshots for a request.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            List of screenshot attachments
        """
        stmt = (
            select(Screenshot)
            .where(
                Screenshot.request_id == request_id,
                Screenshot.mime_type.like("image/%"),
                # Filter by screenshot path or metadata
            )
            .order_by(Screenshot.created_at.desc())
        )

        result = await db.execute(stmt)
        screenshots = result.scalars().all()

        return screenshots

    @staticmethod
    @log_database_operation("screenshot download from MinIO", level="debug")
    async def download_screenshot(attachment: Screenshot) -> Optional[bytes]:
        """
        Download screenshot from MinIO storage or temporary local storage.

        Args:
            attachment: Screenshot object

        Returns:
            File bytes or None if not found
        """
        # If upload is still pending, try to read from temp storage
        if attachment.upload_status == "pending":
            if attachment.temp_local_path:
                temp_path = Path(attachment.temp_local_path)
                if temp_path.exists():
                    try:
                        # Wrap blocking file read
                        def _read_file():
                            with open(temp_path, "rb") as f:
                                return f.read()

                        content = await run_blocking(_read_file)
                        logger.info(
                            f"Read screenshot from temp storage: {temp_path}"
                        )
                        return content
                    except Exception as e:
                        logger.warning(
                            f"Failed to read from temp storage {temp_path}: {e}"
                        )
                else:
                    logger.warning(f"Temp file not found: {temp_path}")
            else:
                logger.warning(
                    f"No temp_local_path stored for screenshot {attachment.id}"
                )

        # Otherwise, download from MinIO
        if not attachment.minio_object_key:
            logger.warning(
                f"No MinIO object key for screenshot {attachment.id}"
            )
            return None

        try:
            # Download from MinIO
            content = await MinIOStorageService.download_file(
                attachment.minio_object_key
            )

            if content:
                logger.info(
                    f"Downloaded screenshot from MinIO: {attachment.minio_object_key}"
                )
            else:
                logger.warning(
                    f"Screenshot not found in MinIO: {attachment.minio_object_key}"
                )

            return content

        except Exception as e:
            logger.error(f"Failed to download screenshot from MinIO: {e}")
            return None

    # ==================================================================================
    # SCREENSHOT LINKING METHODS (for sharing parent screenshots with sub-tasks)
    # ==================================================================================

    @staticmethod
    @safe_database_query
    async def link_screenshot(
        db: AsyncSession,
        request_id: UUID,
        screenshot_id: int,
        technician_id: UUID,
    ):
        """
        Link a screenshot from parent task to sub-task.

        Args:
            db: Database session
            request_id: Sub-task ID to link screenshot to
            screenshot_id: Screenshot ID to link
            technician_id: ID of technician creating the link

        Returns:
            RequestScreenshotLink instance

        Raises:
            ValueError: If validation fails
        """
        from sqlmodel import select

        from models.database_models import (
            RequestScreenshotLink,
            Screenshot,
            ServiceRequest,
        )

        # 1. Validate request exists
        request_query = select(ServiceRequest).where(
            ServiceRequest.id == request_id
        )
        request_result = await db.execute(request_query)
        request = request_result.scalar_one_or_none()

        if not request:
            raise ValueError(f"Request {request_id} not found")

        # 2. Validate request is a sub-task (has parent_task_id)
        if not request.parent_task_id:
            raise ValueError("Can only link screenshots to sub-tasks")

        # 3. Validate screenshot exists and belongs to parent task
        screenshot_query = select(Screenshot).where(
            Screenshot.id == screenshot_id
        )
        screenshot_result = await db.execute(screenshot_query)
        screenshot = screenshot_result.scalar_one_or_none()

        if not screenshot:
            raise ValueError(f"Screenshot {screenshot_id} not found")

        if screenshot.request_id != request.parent_task_id:
            raise ValueError("Screenshot must belong to parent task")

        # 4. Check if link already exists
        existing_query = select(RequestScreenshotLink).where(
            RequestScreenshotLink.request_id == request_id,
            RequestScreenshotLink.screenshot_id == screenshot_id,
        )
        existing_result = await db.execute(existing_query)
        existing = existing_result.scalar_one_or_none()

        if existing:
            raise ValueError("Screenshot already linked to this request")

        # 5. Create link
        link = RequestScreenshotLink(
            request_id=request_id,
            screenshot_id=screenshot_id,
            linked_by=technician_id,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)

        return link

    @staticmethod
    @safe_database_query
    async def unlink_screenshot(
        db: AsyncSession, request_id: UUID, screenshot_id: int
    ) -> None:
        """
        Remove screenshot link from sub-task.

        Args:
            db: Database session
            request_id: Request ID
            screenshot_id: Screenshot ID

        Raises:
            ValueError: If link not found
        """
        from sqlmodel import select

        from models.database_models import RequestScreenshotLink

        query = select(RequestScreenshotLink).where(
            RequestScreenshotLink.request_id == request_id,
            RequestScreenshotLink.screenshot_id == screenshot_id,
        )
        result = await db.execute(query)
        link = result.scalar_one_or_none()

        if not link:
            raise ValueError("Screenshot link not found")

        await db.delete(link)
        await db.commit()

    @staticmethod
    @safe_database_query
    async def get_all_screenshots_for_request(
        db: AsyncSession, request_id: UUID
    ) -> List[Screenshot]:
        """
        Get all screenshots for a request (owned + linked from parent).

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            List of Screenshot instances
        """
        from sqlmodel import select

        from models.database_models import RequestScreenshotLink, Screenshot

        # Get owned screenshots
        owned_query = select(Screenshot).where(
            Screenshot.request_id == request_id
        )
        owned_result = await db.execute(owned_query)
        owned = list(owned_result.scalars().all())

        # Get linked screenshots
        linked_query = (
            select(Screenshot)
            .join(
                RequestScreenshotLink,
                RequestScreenshotLink.screenshot_id == Screenshot.id,
            )
            .where(RequestScreenshotLink.request_id == request_id)
        )
        linked_result = await db.execute(linked_query)
        linked = list(linked_result.scalars().all())

        # Combine and deduplicate by ID
        all_screenshots = owned + linked
        unique_screenshots = {s.id: s for s in all_screenshots}.values()

        return list(unique_screenshots)
