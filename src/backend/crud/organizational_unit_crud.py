"""
Organizational Unit CRUD for database operations.
"""

from typing import List, Optional, Tuple
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import OrganizationalUnit
from crud.base_repository import BaseCRUD


class OrganizationalUnitCRUD(BaseCRUD[OrganizationalUnit]):
    """CRUD for OrganizationalUnit database operations."""

    model = OrganizationalUnit

    @classmethod
    async def find_by_ou_name(
        cls, db: AsyncSession, ou_name: str
    ) -> Optional[OrganizationalUnit]:
        """Find organizational unit by OU name."""
        stmt = select(OrganizationalUnit).where(
            OrganizationalUnit.ou_name == ou_name
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def get_all(
        cls, db: AsyncSession, *, enabled_only: bool = False
    ) -> List[OrganizationalUnit]:
        """
        Get all organizational units.

        Args:
            db: Database session
            enabled_only: If True, only return enabled OUs

        Returns:
            List of organizational units
        """
        stmt = select(OrganizationalUnit)

        if enabled_only:
            stmt = stmt.where(OrganizationalUnit.is_enabled)

        stmt = stmt.order_by(OrganizationalUnit.ou_name.asc())

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_all_with_stats(
        cls, db: AsyncSession
    ) -> Tuple[List[OrganizationalUnit], int, int]:
        """
        Get all organizational units with statistics.

        Returns:
            Tuple of (OUs list, enabled count, disabled count)
        """
        # Get all OUs
        ous = await cls.get_all(db, enabled_only=False)

        # Count enabled/disabled
        enabled_count = sum(1 for ou in ous if ou.is_enabled)
        disabled_count = len(ous) - enabled_count

        return ous, enabled_count, disabled_count

    @classmethod
    async def toggle_enabled(
        cls, db: AsyncSession, ou_id: int, is_enabled: bool
    ) -> Optional[OrganizationalUnit]:
        """
        Toggle organizational unit enabled status.

        Args:
            db: Database session
            ou_id: OU ID
            is_enabled: New enabled status

        Returns:
            Updated OU or None if not found
        """
        ou = await cls.get_by_id(db, ou_id)
        if not ou:
            return None

        ou.is_enabled = is_enabled
        ou.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(ou)

        return ou

    @classmethod
    async def update_sync_stats(
        cls,
        db: AsyncSession,
        ou_id: int,
        user_count: int,
        last_synced_at: datetime,
    ) -> Optional[OrganizationalUnit]:
        """
        Update organizational unit sync statistics.

        Args:
            db: Database session
            ou_id: OU ID
            user_count: Number of users synced
            last_synced_at: Sync timestamp

        Returns:
            Updated OU or None if not found
        """
        ou = await cls.get_by_id(db, ou_id)
        if not ou:
            return None

        ou.user_count = user_count
        ou.last_synced_at = last_synced_at
        ou.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(ou)

        return ou

    @classmethod
    async def bulk_create_or_update(
        cls, db: AsyncSession, ou_list: List[dict]
    ) -> int:
        """
        Bulk create or update organizational units.

        Args:
            db: Database session
            ou_list: List of OU dicts with ou_name and ou_dn

        Returns:
            Number of created/updated records
        """
        created_count = 0

        for ou_data in ou_list:
            ou_name = ou_data.get("ou_name")
            existing_ou = await cls.find_by_ou_name(db, ou_name)

            if existing_ou:
                # Update DN if changed
                if ou_data.get("ou_dn") and existing_ou.ou_dn != ou_data["ou_dn"]:
                    existing_ou.ou_dn = ou_data["ou_dn"]
                    existing_ou.updated_at = datetime.utcnow()
            else:
                # Create new OU
                new_ou = OrganizationalUnit(**ou_data)
                db.add(new_ou)
                created_count += 1

        await db.commit()
        return created_count
