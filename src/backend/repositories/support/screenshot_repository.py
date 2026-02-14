"""
Screenshot repository for managing Screenshot model.

This repository handles all database operations for screenshot uploads.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Screenshot, ServiceRequest
from db.models import RequestScreenshotLink
from repositories.base_repository import BaseRepository


class ScreenshotRepository(BaseRepository[Screenshot]):
    """Repository for Screenshot operations."""

    model = Screenshot

    @classmethod
    async def find_by_id(
        cls, db: AsyncSession, screenshot_id: int
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
            Screenshot.mime_type.like("image/%"),
        )
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()

        return attachment

    @classmethod
    async def find_by_id_simple(
        cls, db: AsyncSession, screenshot_id: int
    ) -> Optional[Screenshot]:
        """
        Get screenshot by ID without mime type filter.

        Args:
            db: Database session
            screenshot_id: Screenshot attachment ID

        Returns:
            Screenshot or None
        """
        stmt = select(Screenshot).where(Screenshot.id == screenshot_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_request(
        cls, db: AsyncSession, request_id: UUID
    ) -> List[Screenshot]:
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
            )
            .order_by(Screenshot.created_at.desc())
        )

        result = await db.execute(stmt)
        screenshots = result.scalars().all()

        return screenshots

    @classmethod
    async def find_by_filename(
        cls, db: AsyncSession, filename: str
    ) -> Optional[Screenshot]:
        """
        Get screenshot by filename (most recent if duplicates exist).

        Args:
            db: Database session
            filename: Screenshot filename

        Returns:
            Screenshot or None
        """
        stmt = (
            select(Screenshot)
            .where(Screenshot.filename == filename)
            .order_by(Screenshot.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def verify_request_exists(cls, db: AsyncSession, request_id: UUID) -> bool:
        """
        Verify request exists.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            True if request exists
        """
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @classmethod
    async def get_request(
        cls, db: AsyncSession, request_id: UUID
    ) -> Optional[ServiceRequest]:
        """
        Get service request by ID.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            ServiceRequest or None
        """
        stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def update_celery_task_id(
        cls, db: AsyncSession, screenshot_id: int, task_id: str
    ) -> Optional[Screenshot]:
        """
        Update screenshot with Celery task ID.

        Args:
            db: Database session
            screenshot_id: Screenshot ID
            task_id: Celery task ID

        Returns:
            Updated Screenshot or None
        """
        stmt = select(Screenshot).where(Screenshot.id == screenshot_id)
        result = await db.execute(stmt)
        attachment = result.scalar_one_or_none()

        if not attachment:
            return None

        attachment.celery_task_id = task_id
        await db.commit()
        await db.refresh(attachment)

        return attachment

    @classmethod
    async def get_owned_screenshots(
        cls, db: AsyncSession, request_id: UUID
    ) -> List[Screenshot]:
        """
        Get owned screenshots for a request.

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            List of Screenshot instances
        """
        stmt = select(Screenshot).where(Screenshot.request_id == request_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_linked_screenshots(
        cls, db: AsyncSession, request_id: UUID
    ) -> List[Screenshot]:
        """
        Get linked screenshots for a request (from parent).

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            List of Screenshot instances
        """
        stmt = (
            select(Screenshot)
            .join(
                RequestScreenshotLink,
                RequestScreenshotLink.screenshot_id == Screenshot.id,
            )
            .where(RequestScreenshotLink.request_id == request_id)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def create_screenshot(
        cls,
        db: AsyncSession,
        request_id: UUID,
        user_id: UUID,
        filename: str,
        file_size: int,
        mime_type: str,
        bucket_name: str,
        temp_local_path: str,
    ) -> Screenshot:
        """
        Create a new screenshot record.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User ID uploading the screenshot
            filename: Screenshot filename
            file_size: File size in bytes
            mime_type: MIME type
            bucket_name: MinIO bucket name
            temp_local_path: Temporary local path

        Returns:
            Created Screenshot instance
        """
        attachment = Screenshot(
            request_id=request_id,
            chat_message_id=None,
            uploaded_by=user_id,
            filename=filename,
            file_size=file_size,
            mime_type=mime_type,
            minio_object_key=None,
            bucket_name=bucket_name,
            file_hash=None,
            upload_status="pending",
            is_corrupted=False,
            temp_local_path=temp_local_path,
        )

        db.add(attachment)
        await db.commit()
        await db.refresh(attachment)

        return attachment
