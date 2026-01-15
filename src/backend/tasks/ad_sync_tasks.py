"""
Active Directory sync tasks.

Queue: ad_queue (medium priority)
Purpose: Handle AD user synchronization in the background
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Tuple
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from celery_app import celery_app
from core.config import settings
from models.database_models import DomainUser, OrganizationalUnit
from schemas.user.domain_user import DomainUser as DomainUserSchema
from services.active_directory import LdapService
from tasks.base import BaseTask

logger = logging.getLogger(__name__)

# Module-level cache for session factory per worker process
# Each worker process has its own event loop, so we cache the session factory
_celery_session_factory: Tuple[async_sessionmaker, any] = None


def get_celery_session_factory():
    """
    Get or create the database session factory for the current worker process.

    Uses module-level caching to ensure we only create ONE engine per worker process.
    This prevents connection pool conflicts and "operation in progress" errors.

    Returns:
        tuple: (async_sessionmaker, engine) for the current event loop
    """
    global _celery_session_factory

    if _celery_session_factory is None:
        # Create a new engine for this worker process
        engine = create_async_engine(
            str(settings.database.url),
            echo=bool(settings.performance.enable_query_logging),
            future=True,
            pool_pre_ping=False,
            pool_size=settings.database.pool_size,
            max_overflow=settings.database.max_overflow,
            pool_timeout=settings.database.pool_timeout,
            pool_recycle=settings.database.pool_recycle,
        )

        # Create a new session factory
        session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
        _celery_session_factory = (session_factory, engine)
        logger.info("Created new Celery session factory for worker process")

    return _celery_session_factory


def run_async(coro):
    """
    Run an async coroutine in a sync context (Celery worker).

    Uses a persistent event loop per worker process instead of asyncio.run()
    which creates/closes a new loop each time (causing "Event loop is closed" errors).
    """
    try:
        # Try to get the existing event loop
        loop = asyncio.get_event_loop()
    except RuntimeError:
        # No event loop in current thread, create one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # If loop is closed, create a new one
    if loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Run the coroutine and return the result
    return loop.run_until_complete(coro)


@asynccontextmanager
async def get_celery_session(session_factory):
    """
    Async context manager for database sessions in Celery tasks.

    Usage:
        async with get_celery_session(session_factory) as session:
            result = await session.execute(query)
            await session.commit()

    Yields:
        AsyncSession: Database session with automatic cleanup
    """
    session = session_factory()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Database error in Celery task: {e}")
        raise
    finally:
        await session.close()


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

    Uses incremental UPSERT pattern:
    1. Fetch enabled OUs from database
    2. Fetch enabled users from those OUs in AD
    3. Upsert records (INSERT new, UPDATE existing)
    4. Preserves UUIDs and referential integrity

    Important:
    - Only syncs users from OUs that are enabled in Settings > Organizational Units
    - If no OUs are enabled, the sync is skipped with a warning message
    - Does NOT fall back to syncing all OUs (explicit configuration required)

    Returns:
        dict: Sync result with status, message, inserted_count, updated_count, and sync_timestamp
    """
    logger.info(f"[Task {self.request.id}] Starting AD sync task")

    async def _async_sync() -> dict:
        # Get the cached session factory for this worker process
        session_factory, engine = get_celery_session_factory()

        try:
            async with get_celery_session(session_factory) as session:
                # Step 1: Get enabled OUs from database
                ou_result = await session.execute(
                    select(OrganizationalUnit.ou_name).where(
                        OrganizationalUnit.is_enabled == True
                    )
                )
                enabled_ou_names = [row[0] for row in ou_result.fetchall()]

                if enabled_ou_names:
                    logger.info(
                        f"Found {len(enabled_ou_names)} enabled OUs in database: {enabled_ou_names}"
                    )
                else:
                    logger.warning(
                        "No enabled OUs found in database. Skipping AD sync. "
                        "Please enable OUs in Settings > Organizational Units."
                    )
                    return {
                        "status": "skipped",
                        "success": False,
                        "message": "No enabled OUs found in database. Please enable OUs in Settings > Organizational Units.",
                        "inserted_count": 0,
                        "updated_count": 0,
                        "total_count": 0,
                        "sync_timestamp": datetime.utcnow().isoformat(),
                        "task_id": str(self.request.id),
                    }

                # Step 2: Fetch from AD using enabled OUs
                logger.info("Fetching enabled users from Active Directory...")
                ldap_service = LdapService()
                ad_users: List[DomainUserSchema] = await ldap_service.get_enabled_users(
                    enabled_ou_names=enabled_ou_names
                )

                if not ad_users:
                    logger.warning("No enabled users found in Active Directory")
                    return {
                        "status": "warning",
                        "success": False,
                        "message": "No enabled users found in Active Directory",
                        "inserted_count": 0,
                        "updated_count": 0,
                        "total_count": 0,
                        "sync_timestamp": datetime.utcnow().isoformat(),
                        "task_id": str(self.request.id),
                    }

                logger.info(f"Fetched {len(ad_users)} users from Active Directory")

                # Step 3: Get existing usernames to track inserts vs updates
                existing_usernames_result = await session.execute(
                    select(DomainUser.username)
                )
                existing_usernames = {row[0] for row in existing_usernames_result.fetchall()}
                logger.info(f"Found {len(existing_usernames)} existing domain users in database")

                # Step 4: Transform AD user schemas to domain user dicts
                domain_user_dicts = [
                    {
                        "id": uuid4(),  # Only used for new inserts, ignored on conflict
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

                # Step 5: Bulk UPSERT using PostgreSQL INSERT ... ON CONFLICT
                if domain_user_dicts:
                    insert_stmt = pg_insert(DomainUser).values(domain_user_dicts)

                    # On conflict with username (unique), update all fields except id and created_at
                    upsert_stmt = insert_stmt.on_conflict_do_update(
                        index_elements=["username"],  # Conflict target (unique constraint)
                        set_={
                            "email": insert_stmt.excluded.email,
                            "display_name": insert_stmt.excluded.display_name,
                            "direct_manager_name": insert_stmt.excluded.direct_manager_name,
                            "phone": insert_stmt.excluded.phone,
                            "office": insert_stmt.excluded.office,
                            "title": insert_stmt.excluded.title,
                            "updated_at": datetime.utcnow(),  # Explicitly update timestamp
                        }
                    )

                    await session.execute(upsert_stmt)

                # Step 6: Calculate insert vs update counts
                new_usernames = {user.username for user in ad_users}
                inserted_count = len(new_usernames - existing_usernames)
                updated_count = len(new_usernames & existing_usernames)
                total_count = len(domain_user_dicts)

                logger.info(
                    f"Upsert completed: {inserted_count} inserted, "
                    f"{updated_count} updated, {total_count} total"
                )

            return {
                "status": "completed",
                "success": True,
                "message": f"Successfully synced {total_count} users from AD ({inserted_count} new, {updated_count} updated)",
                "inserted_count": inserted_count,
                "updated_count": updated_count,
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
                "inserted_count": 0,
                "updated_count": 0,
                "total_count": 0,
                "sync_timestamp": datetime.utcnow().isoformat(),
                "task_id": str(self.request.id),
            }

    # Run the async function using the run_async helper
    # This reuses the worker's event loop instead of creating a new one each time
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
