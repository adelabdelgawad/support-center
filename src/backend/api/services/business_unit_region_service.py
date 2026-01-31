"""
Business Unit Region service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
import logging
from datetime import datetime
from typing import List, Optional, Tuple

from core.decorators import (log_database_operation, safe_database_query,
                             transactional_database_operation)
from db import BusinessUnitRegion
from api.schemas.business_unit_region import (BusinessUnitRegionCreate,
                                           BusinessUnitRegionUpdate)
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class BusinessUnitRegionService:
    """Service for managing business unit regions."""

    @staticmethod
    @safe_database_query("list_business_unit_regions", default_return=([], 0, 0, 0))
    @log_database_operation("business unit region listing", level="debug")
    async def list_business_unit_regions(
        db: AsyncSession,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[BusinessUnitRegion], int, int, int]:
        """
        List business unit regions with filtering and pagination.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of regions, total, active_count, inactive_count)
        """
        # Build main query
        stmt = select(BusinessUnitRegion).where(not BusinessUnitRegion.is_deleted)

        # Build total count query - ALWAYS get total counts from database (no filters)
        total_count_stmt = select(
            func.count(BusinessUnitRegion.id).label("total"),
            func.count(case((BusinessUnitRegion.is_active.is_(True), 1))).label("active_count"),
            func.count(case((BusinessUnitRegion.is_active.is_(False), 1))).label("inactive_count"),
        ).where(not BusinessUnitRegion.is_deleted)

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

        # Apply pagination
        stmt = (
            stmt.order_by(BusinessUnitRegion.name)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        regions = result.scalars().all()

        return regions, total, active_count, inactive_count

    @staticmethod
    @safe_database_query("get_business_unit_region")
    @log_database_operation("business unit region retrieval", level="debug")
    async def get_business_unit_region(
        db: AsyncSession,
        region_id: int
    ) -> Optional[BusinessUnitRegion]:
        """
        Get a business unit region by ID.

        Args:
            db: Database session
            region_id: Region ID

        Returns:
            Business unit region or None
        """
        stmt = select(BusinessUnitRegion).where(BusinessUnitRegion.id == region_id)
        result = await db.execute(stmt)
        region = result.scalar_one_or_none()

        return region

    @staticmethod
    @transactional_database_operation("create_business_unit_region")
    @log_database_operation("business unit region creation", level="debug")
    async def create_business_unit_region(
        db: AsyncSession,
        region_data: BusinessUnitRegionCreate,
        created_by: Optional[int] = None
    ) -> BusinessUnitRegion:
        """
        Create a new business unit region.

        Args:
            db: Database session
            region_data: Region creation data
            created_by: ID of user creating the region

        Returns:
            Created business unit region
        """
        region = BusinessUnitRegion(**region_data.model_dump(), created_by=created_by)
        db.add(region)
        await db.commit()
        await db.refresh(region)

        return region

    @staticmethod
    @transactional_database_operation("update_business_unit_region")
    @log_database_operation("business unit region update", level="debug")
    async def update_business_unit_region(
        db: AsyncSession,
        region_id: int,
        update_data: BusinessUnitRegionUpdate,
        updated_by: Optional[int] = None,
    ) -> Optional[BusinessUnitRegion]:
        """
        Update a business unit region.

        Args:
            db: Database session
            region_id: Region ID
            update_data: Update data
            updated_by: ID of user updating the region

        Returns:
            Updated business unit region or None
        """
        stmt = select(BusinessUnitRegion).where(BusinessUnitRegion.id == region_id)
        result = await db.execute(stmt)
        region = result.scalar_one_or_none()

        if not region:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(region, field, value)

        region.updated_at = datetime.utcnow()
        region.updated_by = updated_by

        await db.commit()
        await db.refresh(region)

        return region

    @staticmethod
    @transactional_database_operation("toggle_business_unit_region_status")
    @log_database_operation("business unit region status toggle", level="debug")
    async def toggle_business_unit_region_status(
        db: AsyncSession,
        region_id: int,
        updated_by: Optional[int] = None,
    ) -> Optional[BusinessUnitRegion]:
        """
        Toggle business unit region active status.

        Args:
            db: Database session
            region_id: Region ID
            updated_by: ID of user toggling the status

        Returns:
            Updated region or None
        """
        stmt = select(BusinessUnitRegion).where(BusinessUnitRegion.id == region_id)
        result = await db.execute(stmt)
        region = result.scalar_one_or_none()

        if not region:
            return None

        region.is_active = not region.is_active
        region.updated_at = datetime.utcnow()
        region.updated_by = updated_by

        await db.commit()
        await db.refresh(region)

        return region

    @staticmethod
    @transactional_database_operation("bulk_update_business_unit_regions_status")
    @log_database_operation("business unit regions bulk status update", level="debug")
    async def bulk_update_business_unit_regions_status(
        db: AsyncSession,
        region_ids: List[int],
        is_active: bool,
        updated_by: Optional[int] = None,
    ) -> List[BusinessUnitRegion]:
        """
        Bulk update business unit regions status.

        Args:
            db: Database session
            region_ids: List of region IDs to update
            is_active: New status
            updated_by: ID of user performing the update

        Returns:
            List of updated regions
        """
        stmt = select(BusinessUnitRegion).where(BusinessUnitRegion.id.in_(region_ids))
        result = await db.execute(stmt)
        regions = result.scalars().all()

        for region in regions:
            region.is_active = is_active
            region.updated_at = datetime.utcnow()
            region.updated_by = updated_by

        await db.commit()
        # No need for N+1 refresh loop - objects are already in memory with latest state

        return regions

    @staticmethod
    @transactional_database_operation("delete_business_unit_region")
    @log_database_operation("business unit region deletion", level="debug")
    async def delete_business_unit_region(
        db: AsyncSession,
        region_id: int
    ) -> bool:
        """
        Delete a business unit region (soft delete).

        Args:
            db: Database session
            region_id: Region ID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(BusinessUnitRegion).where(BusinessUnitRegion.id == region_id)
        result = await db.execute(stmt)
        region = result.scalar_one_or_none()

        if not region:
            return False

        region.is_deleted = True
        region.updated_at = datetime.utcnow()

        await db.commit()

        return True
