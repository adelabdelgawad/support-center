"""
Domain User service for AD synchronization.
"""

import logging
from datetime import datetime
from typing import List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from crud import domain_user_crud
from api.schemas.domain_user import DomainUser as DomainUserSchema
from api.schemas.domain_user import DomainUserRead, DomainUserSyncResponse
from api.services.active_directory import get_domain_enabled_users

logger = logging.getLogger(__name__)


class DomainUserService:
    """Service for managing domain users with AD synchronization."""

    @staticmethod
    @transactional_database_operation("sync_from_ad")
    @log_database_operation("domain user sync from AD", level="info")
    async def sync_from_ad(db: AsyncSession) -> DomainUserSyncResponse:
        """
        Synchronize domain users from Active Directory.

        Uses nuclear replace pattern:
        1. Fetch all enabled users from AD
        2. Delete all existing domain_users records
        3. Bulk insert new records

        Args:
            db: Database session

        Returns:
            Sync response with count and status
        """
        try:
            # Step 1: Fetch from AD
            logger.info("Fetching enabled users from Active Directory...")
            ad_users: List[DomainUserSchema] = await get_domain_enabled_users()

            if not ad_users:
                logger.warning("No enabled users found in Active Directory")
                return DomainUserSyncResponse(
                    success=False,
                    message="No enabled users found in Active Directory",
                    synced_count=0,
                    sync_timestamp=datetime.utcnow(),
                )

            logger.info(f"Fetched {len(ad_users)} users from Active Directory")

            # Step 2: Nuclear delete (remove all existing records)
            deleted_count = await domain_user_crud.delete_all(db)
            logger.info(f"Deleted {deleted_count} existing domain user records")

            # Step 3: Transform AD user schemas to domain user dicts
            domain_user_dicts = [
                {
                    "username": user.username,
                    "email": user.email,
                    "display_name": user.full_name,  # Map full_name to display_name
                    "direct_manager_name": user.direct_manager_name,
                    "phone": user.phone_number,  # Map phone_number to phone
                    "office": user.office,
                    "title": user.title,
                }
                for user in ad_users
            ]

            # Step 4: Bulk insert
            created_count = await domain_user_crud.bulk_create(
                db, domain_user_dicts, commit=True
            )
            logger.info(f"Created {created_count} new domain user records")

            return DomainUserSyncResponse(
                success=True,
                message=f"Successfully synced {created_count} users from AD",
                synced_count=created_count,
                sync_timestamp=datetime.utcnow(),
            )

        except Exception as e:
            logger.error(f"Domain user sync failed: {str(e)}", exc_info=True)
            return DomainUserSyncResponse(
                success=False,
                message=f"Sync failed: {str(e)}",
                synced_count=0,
                sync_timestamp=datetime.utcnow(),
            )

    @staticmethod
    @safe_database_query("get_paginated_users", default_return=([], 0))
    @log_database_operation("domain user listing", level="debug")
    async def get_paginated_users(
        db: AsyncSession,
        *,
        search: str | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[DomainUserRead], int]:
        """
        Get paginated domain users with search.

        Args:
            db: Database session
            search: Search term for username, email, display_name
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (list of domain users, total count)
        """
        users, total = await domain_user_crud.search_users(
            db, search_term=search, page=page, per_page=per_page
        )

        # Convert to read schemas
        items = [DomainUserRead.model_validate(user) for user in users]

        return items, total
