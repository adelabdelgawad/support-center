"""
Active Directory sync tasks.

Queue: ad_queue (medium priority)
Purpose: Handle AD user synchronization in the background
"""

import asyncio
import logging
from datetime import datetime
from typing import List
from uuid import uuid4

from sqlalchemy import select, delete

from celery_app import celery_app
from db.models import DomainUser, OrganizationalUnit
from api.schemas.domain_user import DomainUser as DomainUserSchema
from api.services.active_directory import get_ldap_service
from tasks.base import BaseTask
from tasks.database import get_celery_session

logger = logging.getLogger(__name__)


def run_async(coro):
    """
    Run an async coroutine in a sync context (Celery worker).

    Creates a fresh event loop each time to avoid stale connection state
    from previous task executions on the same worker process.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    base=BaseTask,
    name="tasks.ad_sync_tasks.sync_domain_users_task",
    queue="ad_queue",
    priority=5,
    bind=True,
)
def sync_domain_users_task(self) -> dict:
    """
    Synchronize domain users from Active Directory.

    Simple replace strategy:
    1. Fetch enabled OUs from database
    2. Fetch enabled users from those OUs in AD
    3. Delete all existing domain_users
    4. Bulk insert the fetched users

    Returns:
        dict: Sync result with status, message, and sync_timestamp
    """
    logger.info(f"[Task {self.request.id}] Starting AD sync task")

    async def _async_sync() -> dict:
        try:
            async with get_celery_session() as session:
                # Step 1: Get enabled OUs from database
                ou_result = await session.execute(
                    select(OrganizationalUnit.ou_dn).where(
                        OrganizationalUnit.is_enabled,
                        OrganizationalUnit.ou_dn.isnot(None),
                    )
                )
                enabled_ou_dns = [row[0] for row in ou_result.fetchall()]

                if not enabled_ou_dns:
                    logger.warning("No enabled OUs found in database. Skipping AD sync.")
                    return {
                        "status": "skipped",
                        "success": False,
                        "message": "No enabled OUs found in database. Please enable OUs in Settings > Organizational Units.",
                        "total_count": 0,
                        "sync_timestamp": datetime.utcnow().isoformat(),
                        "task_id": str(self.request.id),
                    }

                logger.info(f"Found {len(enabled_ou_dns)} enabled OUs in database")

                # Step 2: Fetch enabled users from AD
                logger.info("Fetching enabled users from Active Directory...")
                ldap_service = await get_ldap_service(session)
                ad_users: List[DomainUserSchema] = await ldap_service.get_enabled_users(
                    enabled_ou_dns=enabled_ou_dns
                )

                if not ad_users:
                    logger.warning("No enabled users found in Active Directory")
                    return {
                        "status": "warning",
                        "success": False,
                        "message": "No enabled users found in Active Directory",
                        "total_count": 0,
                        "sync_timestamp": datetime.utcnow().isoformat(),
                        "task_id": str(self.request.id),
                    }

                logger.info(f"Fetched {len(ad_users)} users from Active Directory")

                # Step 3: Delete all existing domain users
                delete_result = await session.execute(delete(DomainUser))
                deleted_count = delete_result.rowcount
                logger.info(f"Deleted {deleted_count} existing domain users")

                # Step 4: Bulk insert fetched users
                domain_users = [
                    DomainUser(
                        id=uuid4(),
                        username=user.username,
                        email=user.email,
                        display_name=user.full_name,
                        direct_manager_name=user.direct_manager_name,
                        phone=user.phone_number,
                        office=user.office,
                        title=user.title,
                    )
                    for user in ad_users
                ]
                session.add_all(domain_users)

                total_count = len(domain_users)
                logger.info(f"Inserted {total_count} domain users")

            return {
                "status": "completed",
                "success": True,
                "message": f"Successfully synced {total_count} users from AD (replaced {deleted_count})",
                "total_count": total_count,
                "sync_timestamp": datetime.utcnow().isoformat(),
                "task_id": str(self.request.id),
            }

        except Exception as e:
            logger.error(f"AD sync task failed: {str(e)}", exc_info=True)
            return {
                "status": "failed",
                "success": False,
                "message": f"Sync failed: {str(e)}",
                "total_count": 0,
                "sync_timestamp": datetime.utcnow().isoformat(),
                "task_id": str(self.request.id),
            }

    # Run the async function in a fresh event loop
    try:
        result = run_async(_async_sync())
        logger.info(f"AD sync task completed with result: {result}")
        return result
    except Exception as e:
        logger.error(f"AD sync task failed with exception: {e}", exc_info=True)
        return {
            "status": "failed",
            "success": False,
            "message": f"Sync failed: {str(e)}",
            "inserted_count": 0,
            "updated_count": 0,
            "total_count": 0,
            "sync_timestamp": datetime.utcnow().isoformat(),
            "task_id": str(self.request.id),
        }
