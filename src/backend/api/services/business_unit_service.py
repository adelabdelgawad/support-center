"""
Business Unit Service for managing business units and IP-based network detection.

This service provides business logic for CRUD operations on business units,
including IP-based automatic business unit identification.
"""

import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import BusinessUnit
from repositories.setting.business_unit_repository import BusinessUnitRepository

logger = logging.getLogger(__name__)


class BusinessUnitService:
    """Service for managing business units."""

    @staticmethod
    @safe_database_query("list_business_units", default_return=([], 0, 0, 0))
    @log_database_operation("list business units", level="debug")
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
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (list of business units, total, active_count, inactive_count)
        """
        # Get all business units with counts (no pagination in repository)
        business_units, total, active_count, inactive_count = await BusinessUnitRepository.list_with_counts(
            db, name=name, is_active=is_active, region_id=region_id
        )

        # Apply pagination
        offset = (page - 1) * per_page
        paginated_units = list(business_units)[offset:offset + per_page]

        return paginated_units, total, active_count, inactive_count

    @staticmethod
    @safe_database_query("get_business_unit")
    @log_database_operation("get business unit by ID", level="debug")
    async def get_business_unit(
        db: AsyncSession, business_unit_id: int
    ) -> Optional[BusinessUnit]:
        """
        Get a business unit by ID.

        Args:
            db: Database session
            business_unit_id: Business unit ID

        Returns:
            BusinessUnit or None
        """
        return await BusinessUnitRepository.find_by_id(db, business_unit_id)

    @staticmethod
    @safe_database_query("get_business_unit_by_ip")
    @log_database_operation("get business unit by IP", level="debug")
    async def get_business_unit_by_ip(
        db: AsyncSession, ip_address: str
    ) -> Optional[BusinessUnit]:
        """
        Find a business unit by matching IP address to network CIDR.

        Args:
            db: Database session
            ip_address: IP address to match

        Returns:
            Matching business unit or None
        """
        return await BusinessUnitRepository.find_by_ip(db, ip_address)

    @staticmethod
    @transactional_database_operation("create_business_unit")
    @log_database_operation("create business unit", level="info")
    async def create_business_unit(
        db: AsyncSession,
        name: str,
        description: Optional[str] = None,
        network: Optional[str] = None,
        business_unit_region_id: Optional[int] = None,
        is_active: bool = True,
        working_hours: Optional[dict] = None,
        created_by: Optional[UUID] = None,
    ) -> BusinessUnit:
        """
        Create a new business unit.

        Args:
            db: Database session
            name: Business unit name (must be unique)
            description: Optional description
            network: Optional network CIDR (e.g., 10.23.0.0/16)
            business_unit_region_id: Region ID (optional)
            is_active: Active status (default: true)
            working_hours: JSON working hours configuration (optional)
            created_by: User ID who created this

        Returns:
            Created BusinessUnit
        """
        business_unit = BusinessUnit(
            name=name,
            description=description,
            network=network,
            business_unit_region_id=business_unit_region_id,
            is_active=is_active,
            working_hours=working_hours,
            created_by=created_by,
        )
        db.add(business_unit)
        await db.commit()
        await db.refresh(business_unit)
        return business_unit

    @staticmethod
    @transactional_database_operation("update_business_unit")
    @log_database_operation("update business unit", level="info")
    async def update_business_unit(
        db: AsyncSession,
        business_unit_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        network: Optional[str] = None,
        business_unit_region_id: Optional[int] = None,
        is_active: Optional[bool] = None,
        working_hours: Optional[dict] = None,
        updated_by: Optional[UUID] = None,
    ) -> BusinessUnit:
        """
        Update a business unit.

        All fields are optional. Only provided fields will be updated.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            name: Optional new name
            description: Optional new description
            network: Optional new network CIDR
            business_unit_region_id: Optional new region ID
            is_active: Optional active status
            working_hours: Optional working hours configuration
            updated_by: User ID who updated this

        Returns:
            Updated BusinessUnit

        Raises:
            ValueError: If business unit not found
        """
        business_unit = await BusinessUnitRepository.find_by_id(db, business_unit_id)
        if not business_unit:
            raise ValueError(f"Business unit {business_unit_id} not found")

        if name is not None:
            business_unit.name = name
        if description is not None:
            business_unit.description = description
        if network is not None:
            business_unit.network = network
        if business_unit_region_id is not None:
            business_unit.business_unit_region_id = business_unit_region_id
        if is_active is not None:
            business_unit.is_active = is_active
        if working_hours is not None:
            business_unit.working_hours = working_hours
        if updated_by is not None:
            business_unit.updated_by = updated_by

        business_unit.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(business_unit)
        return business_unit

    @staticmethod
    @transactional_database_operation("toggle_business_unit_status")
    @log_database_operation("toggle business unit status", level="info")
    async def toggle_business_unit_status(
        db: AsyncSession,
        business_unit_id: int,
        updated_by: Optional[UUID] = None,
    ) -> BusinessUnit:
        """
        Toggle business unit active/inactive status.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            updated_by: User ID who updated this

        Returns:
            Updated BusinessUnit

        Raises:
            ValueError: If business unit not found
        """
        business_unit = await BusinessUnitRepository.find_by_id(db, business_unit_id)
        if not business_unit:
            raise ValueError(f"Business unit {business_unit_id} not found")

        business_unit.is_active = not business_unit.is_active
        business_unit.updated_at = datetime.utcnow()
        if updated_by is not None:
            business_unit.updated_by = updated_by

        await db.commit()
        await db.refresh(business_unit)
        return business_unit

    @staticmethod
    @transactional_database_operation("update_business_unit_working_hours")
    @log_database_operation("update business unit working hours", level="info")
    async def update_working_hours(
        db: AsyncSession,
        business_unit_id: int,
        working_hours: dict,
        updated_by: Optional[UUID] = None,
    ) -> BusinessUnit:
        """
        Update working hours for a business unit.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            working_hours: JSON working hours configuration
            updated_by: User ID who updated this

        Returns:
            Updated BusinessUnit

        Raises:
            ValueError: If business unit not found
        """
        business_unit = await BusinessUnitRepository.find_by_id(db, business_unit_id)
        if not business_unit:
            raise ValueError(f"Business unit {business_unit_id} not found")

        business_unit.working_hours = working_hours
        business_unit.updated_at = datetime.utcnow()
        if updated_by is not None:
            business_unit.updated_by = updated_by

        await db.commit()
        await db.refresh(business_unit)
        return business_unit

    @staticmethod
    @transactional_database_operation("bulk_update_business_units_status")
    @log_database_operation("bulk update business units status", level="info")
    async def bulk_update_status(
        db: AsyncSession,
        business_unit_ids: List[int],
        is_active: bool,
        updated_by: Optional[UUID] = None,
    ) -> List[BusinessUnit]:
        """
        Bulk update business units active/inactive status.

        Args:
            db: Database session
            business_unit_ids: List of BU IDs to update
            is_active: Target status (true/false)
            updated_by: User ID who updated this

        Returns:
            List of updated business units
        """
        if not business_unit_ids:
            return []

        # Use repository to fetch business units
        business_units = await BusinessUnitRepository.find_by_ids(db, business_unit_ids)

        for bu in business_units:
            bu.is_active = is_active
            bu.updated_at = datetime.utcnow()
            if updated_by is not None:
                bu.updated_by = updated_by

        await db.commit()

        return list(business_units)

    @staticmethod
    @transactional_database_operation("delete_business_unit")
    @log_database_operation("delete business unit (soft delete)", level="warning")
    async def delete_business_unit(
        db: AsyncSession, business_unit_id: int
    ) -> bool:
        """
        Delete a business unit (soft delete).

        Args:
            db: Database session
            business_unit_id: Business unit ID

        Returns:
            True if deleted, False if not found
        """
        business_unit = await BusinessUnitRepository.find_by_id(db, business_unit_id)
        if not business_unit:
            return False

        business_unit.is_deleted = True
        business_unit.updated_at = datetime.utcnow()

        await db.commit()
        return True
