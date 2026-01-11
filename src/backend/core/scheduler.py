"""
Background task scheduler for periodic jobs.
Uses APScheduler to trigger Celery tasks for domain user sync and WhatsApp batch sending.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from core.database import get_session
from services.domain_user_service import DomainUserService
from services.desktop_session_service import DesktopSessionService

from services.auth_service import auth_service

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


async def sync_domain_users_job():
    """
    Background job to sync domain users from Active Directory.
    Runs every hour via APScheduler.
    """
    logger.info("Starting scheduled domain user sync job...")

    try:
        # Get database session
        async for db in get_session():
            try:
                result = await DomainUserService.sync_from_ad(db)

                if result.success:
                    logger.info(
                        f"Scheduled sync completed successfully: {result.message}"
                    )
                else:
                    logger.error(f"Scheduled sync failed: {result.message}")
            finally:
                break  # Only use first session

    except Exception as e:
        logger.error(
            f"Scheduled domain user sync job failed: {str(e)}", exc_info=True
        )



# WhatsApp batch sending is now EVENT-DRIVEN (not periodic)
# Triggered automatically by:
# - ChatService when messages arrive (debounced)
# - RequestService when out-of-shift requests are created
# No periodic scheduler needed anymore


async def cleanup_expired_tokens_job():
    """
    Background job to clean up expired and revoked auth tokens and refresh sessions.
    Runs daily via APScheduler.

    Removes items that are:
    - Auth tokens: Expired or revoked AND older than 7 days
    - Refresh sessions: Expired or revoked AND older than 7 days

    7-day retention period keeps old items for audit trail.
    """
    logger.info("Starting scheduled session cleanup job (tokens + refresh sessions)...")

    try:
        # Get database session
        async for db in get_session():
            try:
                result = await auth_service.cleanup_all_expired_sessions(
                    db=db, retention_days=7
                )

                logger.info(
                    f"Scheduled session cleanup completed successfully: "
                    f"Total deleted: {result['total_deleted']} | "
                    f"Auth tokens: {result['auth_tokens']['total_deleted']} | "
                    f"Refresh sessions: {result['refresh_sessions']['total_deleted']}"
                )
            finally:
                break  # Only use first session

    except Exception as e:
        logger.error(
            f"Scheduled session cleanup job failed: {str(e)}", exc_info=True
        )


async def cleanup_stale_desktop_sessions_job():
    """
    Background job to clean up stale desktop sessions (no heartbeat for > 2 minutes).
    Runs every 1 minute via APScheduler.

    Desktop sessions are expected to send heartbeat every 30 seconds.
    Sessions without heartbeat for 2+ minutes are marked as inactive.
    This provides responsive presence updates while tolerating brief network issues.
    """
    logger.debug("Running stale desktop session cleanup...")

    try:
        # Get database session
        async for db in get_session():
            try:
                count = await DesktopSessionService.cleanup_stale_sessions(
                    db=db, timeout_minutes=2
                )

                if count > 0:
                    logger.info(
                        f"Stale desktop session cleanup completed: {count} sessions marked inactive"
                    )
                else:
                    logger.debug("Stale desktop session cleanup: no stale sessions found")
            finally:
                break  # Only use first session

    except Exception as e:
        logger.error(
            f"Scheduled stale desktop session cleanup job failed: {str(e)}", exc_info=True
        )


def start_scheduler():
    """Start the background scheduler with all jobs."""
    logger.info("Starting APScheduler for background tasks...")

    scheduler = AsyncIOScheduler()

    # Domain user sync (every hour)
    scheduler.add_job(
        sync_domain_users_job,
        trigger=IntervalTrigger(hours=1),
        id="sync_domain_users",
        replace_existing=True,
        max_instances=1,
        name="Domain User Sync from AD",
    )

    # WhatsApp batch sending is now EVENT-DRIVEN (removed periodic job)
    # Automatically triggered by chat messages and request creation

    # Session cleanup job (daily - auth tokens + refresh sessions)
    scheduler.add_job(
        cleanup_expired_tokens_job,
        trigger=IntervalTrigger(hours=24),
        id="session_cleanup",
        replace_existing=True,
        max_instances=1,
        name="Session Cleanup (Auth Tokens + Refresh Sessions)",
    )

    # Desktop session cleanup (every 1 minute - stale sessions marked after 2 min)
    scheduler.add_job(
        cleanup_stale_desktop_sessions_job,
        trigger=IntervalTrigger(minutes=1),
        id="desktop_session_cleanup",
        replace_existing=True,
        max_instances=1,
        name="Stale Desktop Session Cleanup",
    )

    scheduler.start()
    logger.info(
        "APScheduler started with jobs: "
        "domain user sync (1h), "
        "session cleanup (24h), "
        "desktop session cleanup (1m)"
    )



def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("APScheduler shut down successfully")
