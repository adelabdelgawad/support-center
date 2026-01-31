"""
Chat file service for handling file uploads with MinIO + Celery integration.

Chat files are non-image attachments stored separately from screenshots.
"""

import logging
import uuid
from pathlib import Path
from typing import BinaryIO, List, Optional
from uuid import UUID

import magic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import ChatFile, ServiceRequest
from api.services.minio_service import MinIOStorageService

# Module-level logger
logger = logging.getLogger(__name__)

# Allowed file extensions for chat attachments (non-image)
ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "log", "csv", "json", "xml",
    "zip", "rar", "7z", "tar", "gz",
    "mp3", "mp4", "wav", "avi", "mov",
}

# Max file size: 50MB
MAX_FILE_SIZE_MB = 50


class ChatFileService:
    """Service for managing chat file uploads."""

    @staticmethod
    def is_image_mime_type(mime_type: str) -> bool:
        """Check if a MIME type represents an image."""
        return mime_type.startswith("image/")

    @staticmethod
    @transactional_database_operation("upload_chat_file")
    @log_database_operation("chat file upload", level="debug")
    async def upload_file(
        db: AsyncSession,
        request_id: UUID,
        user_id: UUID,
        file: BinaryIO,
        filename: str,
    ) -> ChatFile:
        """
        Upload a chat file - saves locally and dispatches Celery task for MinIO.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User UUID uploading the file
            file: File object
            filename: Original filename

        Returns:
            Created ChatFile record (upload_status='pending')

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
        file_size = len(content)

        # Check file size
        max_size = MAX_FILE_SIZE_MB * 1024 * 1024
        if file_size > max_size:
            raise ValueError(
                f"File size exceeds maximum of {MAX_FILE_SIZE_MB} MB"
            )

        # Validate extension
        ext = Path(filename).suffix.lower().lstrip(".")
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                f"File type not allowed. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        # Detect MIME type server-side (don't trust client)
        mime = magic.Magic(mime=True)
        mime_type = mime.from_buffer(content)

        # Block images - they should go through screenshot service
        if ChatFileService.is_image_mime_type(mime_type):
            raise ValueError(
                "Image files should be uploaded via screenshot endpoint"
            )

        # Generate unique stored filename
        stored_filename = f"{uuid.uuid4()}.{ext}"

        # Create temp directory if not exists
        temp_dir = Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)

        # Save to temporary local storage
        temp_file_path = temp_dir / f"chatfile_{stored_filename}"

        with open(temp_file_path, "wb") as f:
            f.write(content)
        logger.info(f"Chat file saved to temporary storage: {temp_file_path}")

        # Create ChatFile record with pending status
        chat_file = ChatFile(
            request_id=request_id,
            uploaded_by=user_id,
            original_filename=filename,
            stored_filename=stored_filename,
            file_size=file_size,
            mime_type=mime_type,
            minio_object_key=None,  # Will be set by Celery task
            bucket_name="servicecatalog-files",
            file_hash=None,  # Will be calculated by Celery task
            upload_status="pending",
            is_corrupted=False,
            temp_local_path=str(temp_file_path),
        )

        db.add(chat_file)
        await db.commit()
        await db.refresh(chat_file)

        logger.info(
            f"✅ Chat file created - ID: {chat_file.id}, "
            f"Filename: {filename}, Size: {file_size} bytes"
        )

        # Dispatch Celery task for MinIO upload
        task = upload_file_to_minio.delay(
            attachment_id=chat_file.id,
            local_file_path=str(temp_file_path),
            storage_type="files",
            request_id=str(request_id),
            filename=stored_filename,
        )

        # Store task ID
        chat_file.celery_task_id = task.id
        await db.commit()
        await db.refresh(chat_file)

        logger.info(
            f"Dispatched MinIO upload task {task.id} for chat file {chat_file.id}"
        )

        return chat_file

    @staticmethod
    @safe_database_query("get_chat_file")
    @log_database_operation("chat file retrieval", level="debug")
    async def get_file(
        db: AsyncSession, file_id: int
    ) -> Optional[ChatFile]:
        """
        Get chat file by ID.

        Args:
            db: Database session
            file_id: Chat file ID

        Returns:
            ChatFile or None
        """
        stmt = select(ChatFile).where(ChatFile.id == file_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("get_chat_file_by_filename")
    @log_database_operation("chat file retrieval by filename", level="debug")
    async def get_file_by_filename(
        db: AsyncSession, stored_filename: str
    ) -> Optional[ChatFile]:
        """
        Get chat file by stored filename.

        Args:
            db: Database session
            stored_filename: Unique stored filename

        Returns:
            ChatFile or None
        """
        stmt = select(ChatFile).where(ChatFile.stored_filename == stored_filename)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("get_request_files", default_return=[])
    @log_database_operation("request chat files retrieval", level="debug")
    async def get_request_files(
        db: AsyncSession, request_id: UUID
    ) -> List[ChatFile]:
        """
        Get all chat files for a request.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            List of chat files
        """
        stmt = (
            select(ChatFile)
            .where(ChatFile.request_id == request_id)
            .order_by(ChatFile.created_at.desc())
        )

        result = await db.execute(stmt)
        files = result.scalars().all()

        return list(files)

    @staticmethod
    @log_database_operation("chat file download from MinIO", level="debug")
    async def download_file(chat_file: ChatFile) -> Optional[bytes]:
        """
        Download chat file from MinIO storage or temporary local storage.

        Args:
            chat_file: ChatFile object

        Returns:
            File bytes or None if not found
        """
        # If upload is still pending, try to read from temp storage
        if chat_file.upload_status == "pending":
            if chat_file.temp_local_path:
                temp_path = Path(chat_file.temp_local_path)
                if temp_path.exists():
                    try:
                        with open(temp_path, "rb") as f:
                            content = f.read()
                        logger.info(
                            f"Read chat file from temp storage: {temp_path}"
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
                    f"No temp_local_path stored for chat file {chat_file.id}"
                )

        # Otherwise, download from MinIO
        if not chat_file.minio_object_key:
            logger.warning(
                f"No MinIO object key for chat file {chat_file.id}"
            )
            return None

        try:
            # Download from MinIO
            content = await MinIOStorageService.download_file(
                chat_file.minio_object_key
            )

            if content:
                logger.info(
                    f"Downloaded chat file from MinIO: {chat_file.minio_object_key}"
                )
            else:
                logger.warning(
                    f"Chat file not found in MinIO: {chat_file.minio_object_key}"
                )

            return content

        except Exception as e:
            logger.error(f"Failed to download chat file from MinIO: {e}")
            return None

    @staticmethod
    @transactional_database_operation("delete_chat_file")
    @log_database_operation("chat file deletion", level="debug")
    async def delete_file(db: AsyncSession, file_id: int) -> bool:
        """
        Delete a chat file and its stored files.

        Args:
            db: Database session
            file_id: Chat file ID

        Returns:
            True if deleted, False if not found
        """
        chat_file = await ChatFileService.get_file(db, file_id)
        if not chat_file:
            return False

        # Delete from MinIO if uploaded
        if chat_file.minio_object_key:
            try:
                await MinIOStorageService.delete_file(chat_file.minio_object_key)
                logger.info(f"Deleted chat file from MinIO: {chat_file.minio_object_key}")
            except Exception as e:
                logger.warning(f"Failed to delete from MinIO: {e}")

        # Delete temp file if exists
        if chat_file.temp_local_path:
            temp_path = Path(chat_file.temp_local_path)
            if temp_path.exists():
                try:
                    temp_path.unlink()
                    logger.info(f"Deleted temp file: {temp_path}")
                except Exception as e:
                    logger.warning(f"Failed to delete temp file: {e}")

        # Delete database record
        await db.delete(chat_file)
        await db.commit()

        logger.info(f"Deleted chat file record: {file_id}")
        return True
