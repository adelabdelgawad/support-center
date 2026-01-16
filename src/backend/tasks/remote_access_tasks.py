"""
Remote Access tasks.

Queue: default celery queue (low priority)
Purpose: Remote access related background tasks
"""

import asyncio
import logging
from datetime import datetime, timedelta

from celery_app import celery_app
from core.database import get_async_session_context
from repositories.remote_access_repository import RemoteAccessRepository

logger = logging.getLogger(__name__)

# Sessions without heartbeat for this duration are considered orphaned
ORPHAN_THRESHOLD_MINUTES = 5


@celery_app.task(name="cleanup_orphaned_remote_sessions")
def cleanup_orphaned_remote_sessions():
    """
    Periodic task to clean up orphaned remote access sessions.

    A session is considered orphaned if:
    1. Status is "active"
    2. last_heartbeat is NULL and created_at > ORPHAN_THRESHOLD_MINUTES ago
    3. OR last_heartbeat < ORPHAN_THRESHOLD_MINUTES ago

    Runs every minute via Celery beat.
    """
    try:
        asyncio.run(_cleanup_orphaned_sessions_async())
    except Exception as e:
        logger.error(f"Error in cleanup_orphaned_remote_sessions: {str(e)}", exc_info=True)


async def _cleanup_orphaned_sessions_async():
    """Async implementation of orphaned session cleanup."""
    threshold = datetime.utcnow() - timedelta(minutes=ORPHAN_THRESHOLD_MINUTES)

    async with get_async_session_context() as db:
        try:
            orphaned = await RemoteAccessRepository.get_orphaned_sessions(db, threshold)

            if not orphaned:
                logger.debug("No orphaned remote sessions found")
                return

            logger.info(f"Found {len(orphaned)} orphaned remote sessions to clean up")

            for session in orphaned:
                logger.info(
                    f"Cleaning up orphaned session {session.id} "
                    f"(agent: {session.agent.username}, "
                    f"requester: {session.requester.username}, "
                    f"last_heartbeat: {session.last_heartbeat}, "
                    f"created_at: {session.created_at})"
                )
                await RemoteAccessRepository.end_session(
                    db, session.id, "orphaned_cleanup"
                )

            await db.commit()
            logger.info(f"✅ Cleaned up {len(orphaned)} orphaned remote sessions")

        except Exception as e:
            logger.error(f"Error cleaning up orphaned sessions: {str(e)}", exc_info=True)
            await db.rollback()
            raise
