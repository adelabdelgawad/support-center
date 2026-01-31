"""
Organizational Unit service for OU management.
"""

import logging
from datetime import datetime
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db.models import OrganizationalUnit
from crud.organizational_unit_crud import OrganizationalUnitCRUD
from api.schemas.organizational_unit import (
    OrganizationalUnitCreate,
    OrganizationalUnitListResponse,
    OrganizationalUnitRead,
    OrganizationalUnitUpdate,
    DiscoverOUsResponse,
)
from api.services.active_directory import LdapService

logger = logging.getLogger(__name__)


class OrganizationalUnitService:
    """Service for managing organizational units."""

    @staticmethod
    @safe_database_query("get_all_ous", default_return=OrganizationalUnitListResponse(
        organizational_units=[],
        total=0,
        enabled_count=0,
        disabled_count=0,
    ))
    @log_database_operation("get all organizational units", level="debug")
    async def get_all_ous(db: AsyncSession) -> OrganizationalUnitListResponse:
        """
        Get all organizational units with statistics.

        Args:
            db: Database session

        Returns:
            List response with OUs and statistics
        """
        ous, enabled_count, disabled_count = (
            await OrganizationalUnitCRUD.get_all_with_stats(db)
        )

        # Convert to read schemas
        items = [OrganizationalUnitRead.model_validate(ou) for ou in ous]

        return OrganizationalUnitListResponse(
            organizational_units=items,
            total=len(items),
            enabled_count=enabled_count,
            disabled_count=disabled_count,
        )

    @staticmethod
    @transactional_database_operation("create_ou")
    @log_database_operation("create organizational unit", level="info")
    async def create_ou(
        db: AsyncSession, ou_data: OrganizationalUnitCreate
    ) -> OrganizationalUnitRead:
        """
        Create a new organizational unit.

        Args:
            db: Database session
            ou_data: OU creation data

        Returns:
            Created OU
        """
        # Check if OU already exists
        existing = await OrganizationalUnitCRUD.find_by_ou_name(
            db, ou_data.ou_name
        )
        if existing:
            raise ValueError(f"OU with name '{ou_data.ou_name}' already exists")

        # Create new OU
        ou = OrganizationalUnit(**ou_data.model_dump())
        db.add(ou)
        await db.commit()
        await db.refresh(ou)

        logger.info(f"Created organizational unit: {ou.ou_name}")
        return OrganizationalUnitRead.model_validate(ou)

    @staticmethod
    @transactional_database_operation("update_ou")
    @log_database_operation("update organizational unit", level="info")
    async def update_ou(
        db: AsyncSession, ou_id: int, ou_data: OrganizationalUnitUpdate
    ) -> OrganizationalUnitRead:
        """
        Update an organizational unit.

        Args:
            db: Database session
            ou_id: OU ID
            ou_data: Update data

        Returns:
            Updated OU

        Raises:
            ValueError: If OU not found
        """
        ou = await OrganizationalUnitCRUD.get_by_id(db, ou_id)
        if not ou:
            raise ValueError(f"OU with ID {ou_id} not found")

        # Update fields
        update_data = ou_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(ou, field, value)

        ou.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(ou)

        logger.info(f"Updated organizational unit: {ou.ou_name}")
        return OrganizationalUnitRead.model_validate(ou)

    @staticmethod
    @transactional_database_operation("delete_ou")
    @log_database_operation("delete organizational unit", level="info")
    async def delete_ou(db: AsyncSession, ou_id: int) -> bool:
        """
        Delete an organizational unit.

        Args:
            db: Database session
            ou_id: OU ID

        Returns:
            True if deleted, False if not found
        """
        ou = await OrganizationalUnitCRUD.get_by_id(db, ou_id)
        if not ou:
            return False

        await db.delete(ou)
        await db.commit()

        logger.info(f"Deleted organizational unit: {ou.ou_name}")
        return True

    @staticmethod
    @transactional_database_operation("toggle_ou_enabled")
    @log_database_operation("toggle OU enabled status", level="info")
    async def toggle_ou_enabled(
        db: AsyncSession, ou_id: int, is_enabled: bool
    ) -> OrganizationalUnitRead:
        """
        Toggle organizational unit enabled status.

        Args:
            db: Database session
            ou_id: OU ID
            is_enabled: New enabled status

        Returns:
            Updated OU

        Raises:
            ValueError: If OU not found
        """
        ou = await OrganizationalUnitCRUD.toggle_enabled(db, ou_id, is_enabled)
        if not ou:
            raise ValueError(f"OU with ID {ou_id} not found")

        logger.info(
            f"Toggled OU '{ou.ou_name}' enabled status to: {is_enabled}"
        )
        return OrganizationalUnitRead.model_validate(ou)

    @staticmethod
    @log_database_operation("discover OUs from AD", level="info")
    async def discover_ous_from_ad(db: AsyncSession) -> List[DiscoverOUsResponse]:
        """
        Discover organizational units from Active Directory.

        Fetches all OUs from AD and marks which ones already exist in the database.

        Args:
            db: Database session

        Returns:
            List of discovered OUs with existing status

        Raises:
            ValueError: If no active AD configuration is found
        """
        # Import here to avoid circular dependency
        from crud import active_directory_config_crud as ad_crud

        # Check if there's an active AD configuration
        active_config = await ad_crud.get_active_config(db)
        if not active_config:
            raise ValueError(
                "No active AD configuration found. Please configure and activate an Active Directory server first."
            )

        # Initialize LDAP service with database config
        ldap_service = LdapService(ad_config=active_config)

        try:
            # Fetch OUs from AD
            ad_ous = await ldap_service.fetch_child_ous()
            logger.info(f"Discovered {len(ad_ous)} OUs from Active Directory")

            # Get existing OU names from database
            existing_ous = await OrganizationalUnitCRUD.get_all(db)
            existing_names = {ou.ou_name for ou in existing_ous}

            # Build response
            discovered = []
            for ou_dn, ou_name in ad_ous:
                discovered.append(
                    DiscoverOUsResponse(
                        ou_name=ou_name,
                        ou_dn=ou_dn,
                        already_exists=ou_name in existing_names,
                    )
                )

            return discovered

        except ValueError:
            # Re-raise ValueError (no active config) as-is
            raise
        except Exception as e:
            logger.error(f"Failed to discover OUs from AD: {e}", exc_info=True)
            raise

    @staticmethod
    @transactional_database_operation("sync_ous")
    @log_database_operation("sync organizational units", level="info")
    async def sync_ous(
        db: AsyncSession,
        added: list,
        removed: list[str],
    ) -> dict:
        """
        Bulk sync OUs: create added ones and delete removed ones.

        Args:
            db: Database session
            added: List of dicts with ou_name and ou_dn to create
            removed: List of ou_name strings to delete

        Returns:
            Dict with created_count and deleted_count
        """
        created_count = 0
        deleted_count = 0

        # Create new OUs
        for ou_item in added:
            existing = await OrganizationalUnitCRUD.find_by_ou_name(db, ou_item.ou_name)
            if not existing:
                ou = OrganizationalUnit(
                    ou_name=ou_item.ou_name,
                    ou_dn=ou_item.ou_dn,
                    is_enabled=True,
                )
                db.add(ou)
                created_count += 1
                logger.info(f"Sync: created OU '{ou_item.ou_name}'")

        # Delete removed OUs
        for ou_name in removed:
            existing = await OrganizationalUnitCRUD.find_by_ou_name(db, ou_name)
            if existing:
                await db.delete(existing)
                deleted_count += 1
                logger.info(f"Sync: deleted OU '{ou_name}'")

        await db.commit()

        logger.info(f"OU sync complete: {created_count} created, {deleted_count} deleted")
        return {"created_count": created_count, "deleted_count": deleted_count}

    @staticmethod
    @safe_database_query("get_enabled_ous", default_return=[])
    @log_database_operation("get enabled OUs", level="debug")
    async def get_enabled_ous(db: AsyncSession) -> List[OrganizationalUnit]:
        """
        Get all enabled organizational units for AD sync.

        Args:
            db: Database session

        Returns:
            List of enabled OUs
        """
        return await OrganizationalUnitCRUD.get_all(db, enabled_only=True)
