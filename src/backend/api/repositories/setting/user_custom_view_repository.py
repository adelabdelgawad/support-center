"""
Repository for UserCustomView database operations.
"""

from uuid import UUID
from typing import Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from db.models import UserCustomView
from api.repositories.base_repository import BaseRepository


class UserCustomViewRepository(BaseRepository[UserCustomView]):
    model = UserCustomView

    @classmethod
    async def find_by_user(
        cls, db: AsyncSession, user_id: UUID
    ) -> Optional[UserCustomView]:
        """
        Find a user's custom view by user ID.

        Args:
            db: Database session
            user_id: User ID (UUID)

        Returns:
            UserCustomView or None if not found
        """
        query = select(UserCustomView).where(UserCustomView.user_id == user_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
