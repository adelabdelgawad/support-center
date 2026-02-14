"""
Business Unit Region repository with specialized queries.
"""

from typing import List, Tuple

from db import BusinessUnitRegion
from repositories.base_repository import BaseRepository
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class BusinessUnitRegionRepository(BaseRepository[BusinessUnitRegion]):
    model = BusinessUnitRegion

    @classmethod
    async def find_all_with_counts(
        cls,
        db: AsyncSession,
        name: str = None,
        is_active: bool = None,
    ) -> Tuple[List[BusinessUnitRegion], int, int, int]:
        """
        List business unit regions with filtering and counts.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status

        Returns:
            Tuple of (list of regions, total, active_count, inactive_count)
        """
        # Build main query
        stmt = select(BusinessUnitRegion).where(
            BusinessUnitRegion.is_deleted.is_(False)
        )

        # Build total count query - ALWAYS get total counts from database (no filters)
        total_count_stmt = select(
            func.count(BusinessUnitRegion.id).label("total"),
            func.count(case((BusinessUnitRegion.is_active.is_(True), 1))).label(
                "active_count"
            ),
            func.count(case((BusinessUnitRegion.is_active.is_(False), 1))).label(
                "inactive_count"
            ),
        ).where(BusinessUnitRegion.is_deleted.is_(False))

        # Get total counts (unfiltered)
        total_count_result = await db.execute(total_count_stmt)
        total_counts = total_count_result.one()
        total = total_counts.total or 0
        active_count = total_counts.active_count or 0
        inactive_count = total_counts.inactive_count or 0

        # Apply filters to main query only
        if name:
            name_filter = BusinessUnitRegion.name.ilike(f"%{name}%")
            stmt = stmt.where(name_filter)

        if is_active is not None:
            stmt = stmt.where(BusinessUnitRegion.is_active == is_active)

        # Apply ordering
        stmt = stmt.order_by(BusinessUnitRegion.name)

        # Execute query
        result = await db.execute(stmt)
        regions = result.scalars().all()

        return regions, total, active_count, inactive_count
