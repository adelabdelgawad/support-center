"""
Role repository with specialized queries.
"""

from typing import List, Tuple

from db import Role
from repositories.base_repository import BaseRepository
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class RoleRepository(BaseRepository[Role]):
    model = Role

    @classmethod
    async def find_with_user_counts(
        cls,
        db: AsyncSession,
    ) -> Tuple[List[Role], int, int, int]:
        """
        Find all roles with user counts.

        Note: This method provides the base query structure.
        The service layer is responsible for building response DTOs
        with page_paths and total_users.

        Args:
            db: Database session

        Returns:
            Tuple of (list of roles, total, active_count, inactive_count)
        """
        # Build query
        stmt = select(Role).order_by(Role.name)

        # Build count query
        count_stmt = select(
            func.count(Role.id).label("total"),
            func.count(case((Role.is_active.is_(True), 1))).label("active_count"),
            func.count(case((Role.is_active.is_(False), 1))).label("inactive_count"),
        )

        # Get counts
        count_result = await db.execute(count_stmt)
        counts = count_result.one()
        total = counts.total or 0
        active_count = counts.active_count or 0
        inactive_count = counts.inactive_count or 0

        # Execute query
        result = await db.execute(stmt)
        roles = result.scalars().all()

        return list(roles), total, active_count, inactive_count

    @classmethod
    async def find_all_active(
        cls,
        db: AsyncSession,
    ) -> List[Role]:
        """
        Find all active roles.

        Args:
            db: Database session

        Returns:
            List of active roles
        """
        stmt = select(Role).where(Role.is_active).order_by(Role.name)

        result = await db.execute(stmt)
        roles = result.scalars().all()

        return list(roles)
