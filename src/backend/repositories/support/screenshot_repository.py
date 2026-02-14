"""
Screenshot repository for managing Screenshot model.

This repository handles all database operations for screenshot uploads.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Screenshot, ServiceRequest
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
