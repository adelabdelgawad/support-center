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
from models.database_models import OrganizationalUnit
from repositories.organizational_unit_repository import OrganizationalUnitRepository
from schemas.organizational_unit import (
    OrganizationalUnitCreate,
    OrganizationalUnitListResponse,
    OrganizationalUnitRead,
    OrganizationalUnitUpdate,
    DiscoverOUsResponse,
)
from services.active_directory import LdapService

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
            await OrganizationalUnitRepository.get_all_with_stats(db)
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
        existing = await OrganizationalUnitRepository.find_by_ou_name(
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
        ou = await OrganizationalUnitRepository.get_by_id(db, ou_id)
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
        ou = await OrganizationalUnitRepository.get_by_id(db, ou_id)
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
        ou = await OrganizationalUnitRepository.toggle_enabled(db, ou_id, is_enabled)
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
        """
        ldap_service = LdapService()

        try:
            # Fetch OUs from AD
            ad_ous = await ldap_service.fetch_child_ous()
            logger.info(f"Discovered {len(ad_ous)} OUs from Active Directory")

            # Get existing OU names from database
            existing_ous = await OrganizationalUnitRepository.get_all(db)
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

        except Exception as e:
            logger.error(f"Failed to discover OUs from AD: {e}", exc_info=True)
            raise

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
        return await OrganizationalUnitRepository.get_all(db, enabled_only=True)
