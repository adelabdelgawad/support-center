"""
Chat file repository for managing ChatFile model.

This repository handles all database operations for chat file uploads.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import ChatFile, ServiceRequest
from api.repositories.base_repository import BaseRepository


class ChatFileRepository(BaseRepository[ChatFile]):
    """Repository for ChatFile operations."""

    model = ChatFile

    @classmethod
    async def find_by_id(cls, db: AsyncSession, file_id: int) -> Optional[ChatFile]:
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

    @classmethod
    async def find_by_filename(
        cls, db: AsyncSession, stored_filename: str
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

    @classmethod
    async def find_by_request(
        cls, db: AsyncSession, request_id: UUID
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
        cls, db: AsyncSession, file_id: int, task_id: str
    ) -> Optional[ChatFile]:
        """
        Update chat file with Celery task ID.

        Args:
            db: Database session
            file_id: Chat file ID
            task_id: Celery task ID

        Returns:
            Updated ChatFile or None
        """
        stmt = select(ChatFile).where(ChatFile.id == file_id)
        result = await db.execute(stmt)
        chat_file = result.scalar_one_or_none()

        if not chat_file:
            return None

        chat_file.celery_task_id = task_id
        await db.commit()
        await db.refresh(chat_file)

        return chat_file
