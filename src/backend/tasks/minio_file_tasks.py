"""
MinIO File processing tasks.

Queue: file_queue (medium priority)
Purpose: Handle file uploads to MinIO, thumbnail generation, and cleanup
"""

import hashlib
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import UUID

from PIL import Image
from io import BytesIO
from sqlalchemy import create_engine, delete, select, update
from sqlalchemy.orm import Session, sessionmaker

from celery_app import celery_app
from core.config import settings
from models.database_models import ChatFile, Screenshot
from services.minio_service import MinIOStorageService
from tasks.base import BaseTask
from tasks.database import get_celery_session

logger = logging.getLogger(__name__)

# Lazy-initialized shared sync engine for Celery tasks
_sync_engine = None
_SessionLocal = None


def get_sync_session():
    """Get a sync database session for Celery tasks."""
    global _sync_engine, _SessionLocal
    if _sync_engine is None:
        _sync_engine = create_engine(
            str(settings.database.url).replace('+asyncpg', '+psycopg2'),
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
        )
        _SessionLocal = sessionmaker(bind=_sync_engine)
    return _SessionLocal()


@celery_app.task(
    base=BaseTask,
    name="tasks.minio_file_tasks.upload_file_to_minio",
    queue="file_queue",
    priority=7,
    bind=True,
)
def upload_file_to_minio(
    self,
    attachment_id: int,
    local_file_path: str,
    storage_type: str,
    request_id: str,
    filename: str,
) -> dict:
    """Upload file from local temporary storage to MinIO (synchronous for Celery).

    Handles both Screenshot and ChatFile models based on storage_type:
    - storage_type="screenshots" -> Screenshot model
    - storage_type="files" -> ChatFile model
    """
    logger.info(
        f"[Task {self.request.id}] Starting MinIO upload for {storage_type} {attachment_id}"
    )

    # Determine which model to use based on storage_type
    is_chat_file = storage_type == "files"
    model_class = ChatFile if is_chat_file else Screenshot
    model_name = "ChatFile" if is_chat_file else "Screenshot"

    try:
        local_path = Path(local_file_path)
        if not local_path.exists():
            raise FileNotFoundError(f"Temporary file not found: {local_file_path}")

        with open(local_path, "rb") as f:
            content = f.read()

        file_size = len(content)
        file_hash = hashlib.sha256(content).hexdigest()

        # Get MIME type from database (sync version)
        with get_sync_session() as session:
            stmt = select(model_class).where(model_class.id == attachment_id)
            attachment = session.execute(stmt).scalar_one_or_none()

            if not attachment:
                raise ValueError(f"{model_name} {attachment_id} not found")

            mime_type = attachment.mime_type or "application/octet-stream"

        # Build object key
        request_uuid = UUID(request_id)
        object_key = MinIOStorageService.build_object_key(
            storage_type=storage_type, request_id=request_uuid, filename=filename
        )

        # Upload to MinIO using SYNC method
        MinIOStorageService.upload_file_sync(
            object_key=object_key,
            content=content,
            content_type=mime_type,
            metadata={
                "attachment_id": str(attachment_id),
                "request_id": request_id,
                "filename": filename,
                "file_hash": file_hash,
                "storage_type": storage_type,
            },
        )

        logger.info(f"MinIO upload completed for {object_key}, file_hash={file_hash}")

        # Update attachment record (sync version)
        with get_sync_session() as session:
            stmt = (
                update(model_class)
                .where(model_class.id == attachment_id)
                .values(
                    minio_object_key=object_key,
                    file_hash=file_hash,
                    upload_status="completed",
                    is_corrupted=False,
                )
            )
            session.execute(stmt)
            session.commit()
            logger.info(f"{model_name} {attachment_id} marked as completed in database")

        # Delete temporary file
        try:
            local_path.unlink()
            logger.info(f"Deleted temporary file: {local_file_path}")
        except Exception as e:
            logger.warning(f"Failed to delete temporary file: {e}")

        result_dict = {
            "status": "completed",
            "attachment_id": attachment_id,
            "object_key": object_key,
            "file_hash": file_hash,
            "task_id": str(self.request.id),
            "storage_type": storage_type,
        }

        logger.info(f"Task result: {result_dict}")
        return result_dict

    except Exception as e:
        logger.error(f"MinIO upload failed for {model_name} {attachment_id}: {e}", exc_info=True)

        try:
            with get_sync_session() as session:
                stmt = (
                    update(model_class)
                    .where(model_class.id == attachment_id)
                    .values(upload_status="failed", is_corrupted=True)
                )
                session.execute(stmt)
                session.commit()
                logger.info(f"{model_name} {attachment_id} marked as failed in database")
        except Exception as db_error:
            logger.error(f"Failed to update attachment status: {db_error}", exc_info=True)

        # Return error dict instead of raising (prevents serialization issues)
        return {
            "status": "failed",
            "attachment_id": attachment_id,
            "error": str(e),
            "task_id": str(self.request.id),
            "storage_type": storage_type,
        }


@celery_app.task(
    base=BaseTask,
    name="tasks.minio_file_tasks.upload_thumbnail_to_minio",
    queue="file_queue",
    priority=5,
    bind=True,
)
def upload_thumbnail_to_minio(
    self,
    attachment_id: int,
    local_thumbnail_path: str,
    storage_type: str,
    request_id: str,
    filename: str,
) -> dict:
    """Upload thumbnail from local storage to MinIO."""
    import asyncio

    logger.info(
        f"[Task {self.request.id}] Starting thumbnail upload for attachment {attachment_id}"
    )

    async def _async_upload_thumbnail() -> dict:
        try:
            local_path = Path(local_thumbnail_path)
            if not local_path.exists():
                raise FileNotFoundError(f"Temporary thumbnail not found: {local_thumbnail_path}")

            with open(local_path, "rb") as f:
                content = f.read()

            # Build object key
            request_uuid = UUID(request_id)
            thumbnail_key = MinIOStorageService.build_object_key(
                storage_type=storage_type, request_id=request_uuid, filename=filename
            )

            # Upload to MinIO
            upload_result = await MinIOStorageService.upload_file(
                object_key=thumbnail_key,
                content=content,
                content_type="image/jpeg",
                metadata={
                    "attachment_id": str(attachment_id),
                    "request_id": request_id,
                    "is_thumbnail": "true",
                },
            )

            logger.info(f"Thumbnail uploaded to MinIO: {thumbnail_key}")

            # Update attachment record
            async with get_celery_session() as session:
                stmt = (
                    update(Screenshot)
                    .where(Screenshot.id == attachment_id)
                    .values(minio_thumbnail_key=thumbnail_key)
                )
                await session.execute(stmt)
                # Commit is handled by context manager
                logger.info(f"Screenshot {attachment_id} thumbnail key updated in database")

            # Delete temporary thumbnail
            try:
                local_path.unlink()
                logger.info(f"Deleted temporary thumbnail: {local_thumbnail_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temporary thumbnail: {e}")

            result_dict = {
                "status": "completed",
                "attachment_id": attachment_id,
                "thumbnail_key": thumbnail_key,
                "task_id": str(self.request.id),
            }

            logger.info(f"Thumbnail task result: {result_dict}")
            return result_dict

        except Exception as e:
            logger.error(f"Thumbnail upload failed for attachment {attachment_id}: {e}", exc_info=True)
            raise

    # Run the async function synchronously
    try:
        result = asyncio.run(_async_upload_thumbnail())
        logger.info(f"Thumbnail task completed successfully with result: {result}")
        return result
    except Exception as e:
        logger.error(f"Thumbnail task failed with exception: {e}", exc_info=True)
        return {
            "status": "failed",
            "attachment_id": attachment_id,
            "error": str(e),
            "task_id": str(self.request.id),
        }


@celery_app.task(
    base=BaseTask,
    name="tasks.minio_file_tasks.generate_thumbnail",
    queue="file_queue",
    priority=4,
    bind=True,
)
def generate_thumbnail(
    self, attachment_id: int, object_key: str, thumbnail_size: tuple = (200, 200)
) -> dict:
    """Generate thumbnail for an existing image in MinIO."""
    import asyncio

    logger.info(f"[Task {self.request.id}] Generating thumbnail for attachment {attachment_id}")

    async def _async_generate_thumbnail():
        try:
            content = await MinIOStorageService.download_file(object_key)

            if not content:
                raise FileNotFoundError(f"Original file not found in MinIO: {object_key}")

            # Generate thumbnail using PIL
            with Image.open(BytesIO(content)) as img:
                img.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)

                # Convert RGBA to RGB
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                    img = background

                buffer = BytesIO()
                img.save(buffer, format="JPEG", quality=85, optimize=True)
                thumbnail_content = buffer.getvalue()

            # Build thumbnail object key
            parts = object_key.split("/")
            filename_with_uuid = parts[-1]
            storage_type = parts[0]
            uuid_part = filename_with_uuid.split("_")[0]
            request_uuid = UUID(uuid_part)
            thumbnail_filename = f"thumb_{filename_with_uuid}"

            thumbnail_key = MinIOStorageService.build_object_key(
                storage_type=storage_type, request_id=request_uuid, filename=thumbnail_filename
            )

            # Upload thumbnail
            await MinIOStorageService.upload_file(
                object_key=thumbnail_key,
                content=thumbnail_content,
                content_type="image/jpeg",
                metadata={
                    "attachment_id": str(attachment_id),
                    "is_thumbnail": "true",
                    "original_key": object_key,
                },
            )

            # Update attachment record
            async with get_celery_session() as session:
                stmt = (
                    update(Screenshot)
                    .where(Screenshot.id == attachment_id)
                    .values(minio_thumbnail_key=thumbnail_key)
                )
                await session.execute(stmt)
                # Commit is handled by context manager

            return {
                "status": "completed",
                "attachment_id": attachment_id,
                "thumbnail_key": thumbnail_key,
                "task_id": self.request.id,
            }

        except Exception as e:
            logger.error(f"Thumbnail generation failed for attachment {attachment_id}: {e}")
            raise

    # Run the async function synchronously
    return asyncio.run(_async_generate_thumbnail())


@celery_app.task(
    base=BaseTask,
    name="tasks.minio_file_tasks.delete_file_from_minio",
    queue="file_queue",
    priority=3,
    bind=True,
)
def delete_file_from_minio(
    self, attachment_id: int, object_key: str, thumbnail_key: Optional[str] = None
) -> dict:
    """Delete file (and optional thumbnail) from MinIO."""
    import asyncio

    logger.info(f"[Task {self.request.id}] Deleting file from MinIO for attachment {attachment_id}")

    async def _async_delete():
        results = {"attachment_id": attachment_id, "task_id": self.request.id}

        try:
            deleted = await MinIOStorageService.delete_file(object_key)
            results["main_file_deleted"] = deleted

            if thumbnail_key:
                deleted_thumb = await MinIOStorageService.delete_file(thumbnail_key)
                results["thumbnail_deleted"] = deleted_thumb

            return results

        except Exception as e:
            logger.error(f"File deletion failed for attachment {attachment_id}: {e}")
            raise

    # Run the async function synchronously
    return asyncio.run(_async_delete())


@celery_app.task(
    base=BaseTask,
    name="tasks.minio_file_tasks.cleanup_expired_files",
    queue="file_queue",
    priority=2,
)
def cleanup_expired_files(max_age_hours: int = 24) -> dict:
    """Clean up attachments with failed upload status and orphaned temp files."""
    import asyncio

    logger.info(f"Starting cleanup of failed uploads older than {max_age_hours} hours")

    async def _async_cleanup():
        async with get_celery_session() as session:
            cutoff_time = datetime.now() - timedelta(hours=max_age_hours)

            stmt = select(Screenshot).where(
                Screenshot.upload_status == "failed", Screenshot.created_at < cutoff_time
            )
            result = await session.execute(stmt)
            failed_attachments = result.scalars().all()

            deleted_count = 0
            temp_files_cleaned = 0

            for attachment in failed_attachments:
                if attachment.temp_local_path:
                    try:
                        Path(attachment.temp_local_path).unlink(missing_ok=True)
                        temp_files_cleaned += 1
                    except Exception as e:
                        logger.warning(f"Failed to delete temp file: {e}")

                await session.delete(attachment)
                deleted_count += 1

            await session.commit()

            logger.info(f"Cleaned up {deleted_count} failed uploads, {temp_files_cleaned} temp files")

            return {"deleted_attachments": deleted_count, "temp_files_cleaned": temp_files_cleaned}

    # Run the async function synchronously
    return asyncio.run(_async_cleanup())


@celery_app.task(
    base=BaseTask,
    name="tasks.minio_file_tasks.retry_pending_uploads",
    queue="file_queue",
    priority=3,
)
def retry_pending_uploads(max_age_minutes: int = 30) -> dict:
    """Mark stuck pending uploads as failed."""
    import asyncio

    logger.info(f"Checking for stuck pending uploads older than {max_age_minutes} minutes")

    async def _async_retry():
        async with get_celery_session() as session:
            cutoff_time = datetime.now() - timedelta(minutes=max_age_minutes)

            stmt = select(Screenshot).where(
                Screenshot.upload_status == "pending", Screenshot.created_at < cutoff_time
            )
            result = await session.execute(stmt)
            stuck_attachments = result.scalars().all()

            failed_count = 0

            for attachment in stuck_attachments:
                stmt = (
                    update(Screenshot)
                    .where(Screenshot.id == attachment.id)
                    .values(upload_status="failed", is_corrupted=True)
                )
                await session.execute(stmt)
                failed_count += 1

            await session.commit()

            logger.info(f"Processed {len(stuck_attachments)} stuck uploads: {failed_count} marked failed")

            return {"total_stuck": len(stuck_attachments), "marked_failed": failed_count}

    # Run the async function synchronously
    return asyncio.run(_async_retry())
