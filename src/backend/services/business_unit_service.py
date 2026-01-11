"""
Business Unit service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
import ipaddress
import logging
from datetime import datetime
from typing import List, Optional, Tuple

from core.decorators import (log_database_operation, safe_database_query,
                             transactional_database_operation)
from models import BusinessUnit
from schemas.business_unit import BusinessUnitCreate, BusinessUnitUpdate
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class BusinessUnitService:
    """Service for managing business units."""

    @staticmethod
    @safe_database_query("list_business_units", default_return=([], 0, 0, 0))
    @log_database_operation("business unit listing", level="debug")
    async def list_business_units(
        db: AsyncSession,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        region_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[BusinessUnit], int, int, int]:
        """
        List business units with filtering and pagination.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status
            region_id: Filter by region ID
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of business units, total, active_count, inactive_count)
        """
        # Build main query
        stmt = select(BusinessUnit).where(BusinessUnit.is_deleted == False)

        # Build total count query - ALWAYS get total counts from database (no filters)
        total_count_stmt = select(
            func.count(BusinessUnit.id).label("total"),
            func.count(case((BusinessUnit.is_active.is_(True), 1))).label("active_count"),
            func.count(case((BusinessUnit.is_active.is_(False), 1))).label("inactive_count"),
        ).where(BusinessUnit.is_deleted == False)

        # Get total counts (unfiltered)
        total_count_result = await db.execute(total_count_stmt)
        total_counts = total_count_result.one()
        total = total_counts.total or 0
        active_count = total_counts.active_count or 0
        inactive_count = total_counts.inactive_count or 0

        # Apply filters to main query only
        if name:
            name_filter = BusinessUnit.name.ilike(f"%{name}%")
            stmt = stmt.where(name_filter)

        if is_active is not None:
            stmt = stmt.where(BusinessUnit.is_active == is_active)

        if region_id is not None:
            stmt = stmt.where(BusinessUnit.business_unit_region_id == region_id)

        # Apply pagination
        stmt = (
            stmt.order_by(BusinessUnit.name)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        business_units = result.scalars().all()

        return business_units, total, active_count, inactive_count

    @staticmethod
    @safe_database_query("get_business_unit")
    @log_database_operation("business unit retrieval", level="debug")
    async def get_business_unit(
        db: AsyncSession,
        business_unit_id: int
    ) -> Optional[BusinessUnit]:
        """
        Get a business unit by ID.

        Args:
            db: Database session
            business_unit_id: Business unit ID

        Returns:
            Business unit or None
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        return business_unit

    @staticmethod
    @transactional_database_operation("create_business_unit")
    @log_database_operation("business unit creation", level="debug")
    async def create_business_unit(
        db: AsyncSession,
        business_unit_data: BusinessUnitCreate,
        created_by: Optional[int] = None
    ) -> BusinessUnit:
        """
        Create a new business unit.

        Args:
            db: Database session
            business_unit_data: Business unit creation data
            created_by: ID of user creating the business unit

        Returns:
            Created business unit
        """
        business_unit = BusinessUnit(**business_unit_data.model_dump(), created_by=created_by)
        db.add(business_unit)
        await db.commit()
        await db.refresh(business_unit)

        return business_unit

    @staticmethod
    @transactional_database_operation("update_business_unit")
    @log_database_operation("business unit update", level="debug")
    async def update_business_unit(
        db: AsyncSession,
        business_unit_id: int,
        update_data: BusinessUnitUpdate,
        updated_by: Optional[int] = None,
    ) -> Optional[BusinessUnit]:
        """
        Update a business unit.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            update_data: Update data
            updated_by: ID of user updating the business unit

        Returns:
            Updated business unit or None
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(business_unit, field, value)

        business_unit.updated_at = datetime.utcnow()
        business_unit.updated_by = updated_by

        await db.commit()
        await db.refresh(business_unit)

        return business_unit

    @staticmethod
    @transactional_database_operation("update_business_unit_working_hours")
    @log_database_operation("business unit working hours update", level="debug")
    async def update_business_unit_working_hours(
        db: AsyncSession,
        business_unit_id: int,
        working_hours: Optional[dict],
        updated_by: Optional[int] = None,
    ) -> Optional[BusinessUnit]:
        """
        Update working hours for a business unit.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            working_hours: Working hours data
            updated_by: ID of user updating the working hours

        Returns:
            Updated business unit or None
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            return None

        business_unit.working_hours = working_hours
        business_unit.updated_at = datetime.utcnow()
        business_unit.updated_by = updated_by

        await db.commit()
        await db.refresh(business_unit)

        return business_unit

    @staticmethod
    @transactional_database_operation("toggle_business_unit_status")
    @log_database_operation("business unit status toggle", level="debug")
    async def toggle_business_unit_status(
        db: AsyncSession,
        business_unit_id: int,
        updated_by: Optional[int] = None,
    ) -> Optional[BusinessUnit]:
        """
        Toggle business unit active status.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            updated_by: ID of user toggling the status

        Returns:
            Updated business unit or None
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            return None

        business_unit.is_active = not business_unit.is_active
        business_unit.updated_at = datetime.utcnow()
        business_unit.updated_by = updated_by

        await db.commit()
        await db.refresh(business_unit)

        return business_unit

    @staticmethod
    @transactional_database_operation("bulk_update_business_units_status")
    @log_database_operation("business units bulk status update", level="debug")
    async def bulk_update_business_units_status(
        db: AsyncSession,
        business_unit_ids: List[int],
        is_active: bool,
        updated_by: Optional[int] = None,
    ) -> List[BusinessUnit]:
        """
        Bulk update business units status.

        Args:
            db: Database session
            business_unit_ids: List of business unit IDs to update
            is_active: New status
            updated_by: ID of user performing the update

        Returns:
            List of updated business units
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id.in_(business_unit_ids))
        result = await db.execute(stmt)
        business_units = result.scalars().all()

        for bu in business_units:
            bu.is_active = is_active
            bu.updated_at = datetime.utcnow()
            bu.updated_by = updated_by

        await db.commit()
        for bu in business_units:
            await db.refresh(bu)

        return business_units

    @staticmethod
    @transactional_database_operation("delete_business_unit")
    @log_database_operation("business unit deletion", level="debug")
    async def delete_business_unit(
        db: AsyncSession,
        business_unit_id: int
    ) -> bool:
        """
        Delete a business unit (soft delete).

        Args:
            db: Database session
            business_unit_id: Business unit ID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id == business_unit_id)
        result = await db.execute(stmt)
        business_unit = result.scalar_one_or_none()

        if not business_unit:
            return False

        business_unit.is_deleted = True
        business_unit.updated_at = datetime.utcnow()

        await db.commit()

        return True

    @staticmethod
    @safe_database_query("get_business_unit_by_ip", default_return=None)
    @log_database_operation("business unit IP matching", level="debug")
    async def get_business_unit_by_ip(
        db: AsyncSession,
        ip_address: str
    ) -> Optional[BusinessUnit]:
        """
        Find a business unit by matching IP address to network CIDR.

        Args:
            db: Database session
            ip_address: IP address to match

        Returns:
            Matching business unit or None
        """
        if not ip_address:
            return None

        try:
            ip_obj = ipaddress.ip_address(ip_address)
        except ValueError:
            logger.warning(f"Invalid IP address format: {ip_address}")
            return None

        # Get all business units with network defined and not deleted
        stmt = select(BusinessUnit).where(
            (BusinessUnit.network.isnot(None)) & (BusinessUnit.is_deleted == False)
        )
        result = await db.execute(stmt)
        business_units = result.scalars().all()

        # Match IP to network
        for bu in business_units:
            try:
                network = ipaddress.ip_network(bu.network, strict=False)
                if ip_obj in network:
                    return bu
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid network CIDR for business unit {bu.id}: {bu.network} - {e}")
                continue

        return None
