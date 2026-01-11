"""
Active Directory sync tasks.

Queue: ad_queue (medium priority)
Purpose: Handle AD user synchronization in the background
"""

import asyncio
import logging
from datetime import datetime
from typing import List

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from celery_app import celery_app
from models.database_models import DomainUser
from schemas.user.domain_user import DomainUser as DomainUserSchema
from services.active_directory import get_domain_enabled_users
from tasks.base import BaseTask
from tasks.database import get_celery_session

logger = logging.getLogger(__name__)


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

    Uses nuclear replace pattern:
    1. Fetch all enabled users from AD
    2. Delete all existing domain_users records
    3. Bulk insert new records

    Returns:
        dict: Sync result with status, message, synced_count, and sync_timestamp
    """
    logger.info(f"[Task {self.request.id}] Starting AD sync task")

    async def _async_sync() -> dict:
        try:
            # Step 1: Fetch from AD
            logger.info("Fetching enabled users from Active Directory...")
            ad_users: List[DomainUserSchema] = await get_domain_enabled_users()

            if not ad_users:
                logger.warning("No enabled users found in Active Directory")
                return {
                    "status": "warning",
                    "success": False,
                    "message": "No enabled users found in Active Directory",
                    "synced_count": 0,
                    "sync_timestamp": datetime.utcnow().isoformat(),
                    "task_id": str(self.request.id),
                }

            logger.info(f"Fetched {len(ad_users)} users from Active Directory")

            async with get_celery_session() as session:
                # Step 2: Nuclear delete (remove all existing records)
                delete_stmt = delete(DomainUser)
                result = await session.execute(delete_stmt)
                deleted_count = result.rowcount
                logger.info(f"Deleted {deleted_count} existing domain user records")

                # Step 3: Transform AD user schemas to domain user dicts
                domain_user_dicts = [
                    {
                        "username": user.username,
                        "email": user.email,
                        "display_name": user.full_name,
                        "direct_manager_name": user.direct_manager_name,
                        "phone": user.phone_number,
                        "office": user.office,
                        "title": user.title,
                    }
                    for user in ad_users
                ]

                # Step 4: Bulk insert using PostgreSQL INSERT
                if domain_user_dicts:
                    insert_stmt = pg_insert(DomainUser).values(domain_user_dicts)
                    await session.execute(insert_stmt)

                created_count = len(domain_user_dicts)
                logger.info(f"Created {created_count} new domain user records")

                # Commit is handled by context manager

            return {
                "status": "completed",
                "success": True,
                "message": f"Successfully synced {created_count} users from AD",
                "synced_count": created_count,
                "sync_timestamp": datetime.utcnow().isoformat(),
                "task_id": str(self.request.id),
            }

        except Exception as e:
            logger.error(f"AD sync task failed: {str(e)}", exc_info=True)
            return {
                "status": "failed",
                "success": False,
                "message": f"Sync failed: {str(e)}",
                "synced_count": 0,
                "sync_timestamp": datetime.utcnow().isoformat(),
                "task_id": str(self.request.id),
            }

    # Run the async function synchronously
    try:
        result = asyncio.run(_async_sync())
        logger.info(f"AD sync task completed with result: {result}")
        return result
    except Exception as e:
        logger.error(f"AD sync task failed with exception: {e}", exc_info=True)
        return {
            "status": "failed",
            "success": False,
            "message": f"Sync failed: {str(e)}",
            "synced_count": 0,
            "sync_timestamp": datetime.utcnow().isoformat(),
            "task_id": str(self.request.id),
        }
