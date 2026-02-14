"""
Priority repository with specialized queries.
"""

from typing import List

from db import Priority
from api.repositories.base_repository import BaseRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class PriorityRepository(BaseRepository[Priority]):
    model = Priority

    @classmethod
    async def find_all_ordered(
        cls,
        db: AsyncSession,
        active_only: bool = True,
    ) -> List[Priority]:
        """
        List all priorities ordered by ID.

        Args:
            db: Database session
            active_only: Only return active priorities

        Returns:
            List of priorities
        """
        stmt = select(Priority).order_by(Priority.id)

        if active_only:
            stmt = stmt.where(Priority.is_active)

        result = await db.execute(stmt)
        priorities = result.scalars().all()

        return priorities
