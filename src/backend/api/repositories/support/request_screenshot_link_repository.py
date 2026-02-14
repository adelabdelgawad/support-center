"""
RequestScreenshotLink repository for managing screenshot links between requests.

This repository handles all database operations for linking screenshots
from parent tasks to sub-tasks.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import RequestScreenshotLink
from api.repositories.base_repository import BaseRepository


class RequestScreenshotLinkRepository(BaseRepository[RequestScreenshotLink]):
    """Repository for RequestScreenshotLink operations."""

    model = RequestScreenshotLink

    @classmethod
    async def find_existing_link(
        cls, db: AsyncSession, request_id: int, screenshot_id: int
    ) -> Optional[RequestScreenshotLink]:
        """
        Find existing link between request and screenshot.

        Args:
            db: Database session
            request_id: Request ID
            screenshot_id: Screenshot ID

        Returns:
            RequestScreenshotLink or None
        """
        stmt = select(RequestScreenshotLink).where(
            RequestScreenshotLink.request_id == request_id,  # type: ignore[arg-type]
            RequestScreenshotLink.screenshot_id == screenshot_id,  # type: ignore[arg-type]
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def create_link(
        cls,
        db: AsyncSession,
        request_id: int,
        screenshot_id: int,
        linked_by: UUID,
    ) -> RequestScreenshotLink:
        """
        Create a new screenshot link.

        Args:
            db: Database session
            request_id: Request ID
            screenshot_id: Screenshot ID
            linked_by: User ID who created the link

        Returns:
            Created RequestScreenshotLink
        """
        link = RequestScreenshotLink(
            request_id=request_id,
            screenshot_id=screenshot_id,
            linked_by=linked_by,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)
        return link

    @classmethod
    async def delete_link(
        cls, db: AsyncSession, request_id: int, screenshot_id: int
    ) -> None:
        """
        Delete screenshot link.

        Args:
            db: Database session
            request_id: Request ID
            screenshot_id: Screenshot ID

        Raises:
            ValueError: If link not found
        """
        link = await cls.find_existing_link(db, request_id, screenshot_id)
        if not link:
            raise ValueError("Screenshot link not found")

        await db.delete(link)
        await db.commit()
