"""
Business Unit repository with specialized queries.
"""

import ipaddress
import logging
from typing import List, Optional, Tuple

from db import BusinessUnit
from repositories.base_repository import BaseRepository
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class BusinessUnitRepository(BaseRepository[BusinessUnit]):
    model = BusinessUnit

    @classmethod
    async def list_with_counts(
        cls,
        db: AsyncSession,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        region_id: Optional[int] = None,
    ) -> Tuple[List[BusinessUnit], int, int, int]:
        """
        List business units with filtering and counts.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status
            region_id: Filter by region ID

        Returns:
            Tuple of (list of business units, total, active_count, inactive_count)
        """
        # Build main query
        stmt = select(BusinessUnit).where(BusinessUnit.is_deleted.is_(False))

        # Build total count query - ALWAYS get total counts from database (no filters)
        total_count_stmt = select(
            func.count(BusinessUnit.id).label("total"),
            func.count(case((BusinessUnit.is_active.is_(True), 1))).label(
                "active_count"
            ),
            func.count(case((BusinessUnit.is_active.is_(False), 1))).label(
                "inactive_count"
            ),
        ).where(BusinessUnit.is_deleted.is_(False))

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

        # Apply ordering
        stmt = stmt.order_by(BusinessUnit.name)

        # Execute query
        result = await db.execute(stmt)
        business_units = result.scalars().all()

        return business_units, total, active_count, inactive_count

    @classmethod
    async def find_by_ip(
        cls,
        db: AsyncSession,
        ip_address: str,
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
            (BusinessUnit.network.isnot(None)) & (BusinessUnit.is_deleted.is_(False))
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
                logger.warning(
                    f"Invalid network CIDR for business unit {bu.id}: {bu.network} - {e}"
                )
                continue

        return None

    @classmethod
    async def find_by_ids(
        cls,
        db: AsyncSession,
        ids: List[int],
    ) -> List[BusinessUnit]:
        """
        Find multiple business units by IDs.

        Args:
            db: Database session
            ids: List of business unit IDs

        Returns:
            List of business units
        """
        if not ids:
            return []

        stmt = select(BusinessUnit).where(BusinessUnit.id.in_(ids))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def bulk_update_status(
        cls,
        db: AsyncSession,
        ids: List[int],
        status: str,
    ) -> List[BusinessUnit]:
        """
        Bulk update business units active/inactive status.

        Args:
            db: Database session
            ids: List of business unit IDs to update
            status: Target status ("active" or "inactive")

        Returns:
            List of updated business units
        """
        is_active = status.lower() == "active"

        # Use find_by_ids method
        business_units = await cls.find_by_ids(db, ids)

        for bu in business_units:
            bu.is_active = is_active

        await db.commit()

        return list(business_units)
