"""
Maintenance tasks for scheduled background jobs.

These are wrapper functions that provide a simple async function interface
for the scheduler to call service layer methods. Each wrapper:
1. Obtains a database session via get_celery_session()
2. Instantiates the required service
3. Calls the service method with proper dependency injection
4. Returns the result

This pattern keeps the scheduler execution simple (only passes task_args)
while maintaining service layer encapsulation.

Queue: celery (default)
Purpose: System maintenance and cleanup operations
"""

import logging
from typing import Dict, Any

from tasks.database import get_celery_session
from api.services.auth_service import AuthenticationService
from api.services.desktop_session_service import DesktopSessionService
from api.services.deployment_job_service import DeploymentJobService
from api.services.scheduler_service import SchedulerService

logger = logging.getLogger(__name__)


async def cleanup_expired_sessions_task(retention_days: int = 7) -> Dict[str, Any]:
    """
    Cleanup expired authentication sessions and tokens.

    Wrapper for AuthenticationService.cleanup_all_expired_sessions()

    Args:
        retention_days: Number of days to retain expired sessions (default: 7)

    Returns:
        dict: Cleanup statistics with keys:
            - tokens_deleted: Number of expired tokens removed
            - sessions_deleted: Number of expired sessions removed
            - total_deleted: Total records deleted

    Raises:
        Exception: If cleanup operation fails
    """
    logger.info(f"Starting cleanup of expired sessions (retention_days={retention_days})")

    async with get_celery_session() as db:
        service = AuthenticationService()
        result = await service.cleanup_all_expired_sessions(db, retention_days)

        logger.info(
            f"Cleanup completed: {result.get('total_deleted', 0)} total records deleted "
            f"(tokens: {result.get('tokens_deleted', 0)}, sessions: {result.get('sessions_deleted', 0)})"
        )

        return result


async def cleanup_stale_desktop_sessions_task(timeout_minutes: int = 2) -> Dict[str, Any]:
    """
    Mark stale desktop sessions as inactive.

    Wrapper for DesktopSessionService.cleanup_stale_sessions()

    Args:
        timeout_minutes: Inactivity timeout in minutes (default: 2)

    Returns:
        dict: Cleanup statistics with keys:
            - sessions_marked_inactive: Number of sessions marked as inactive
            - timestamp: UTC timestamp of cleanup operation

    Raises:
        Exception: If cleanup operation fails
    """
    from datetime import datetime

    logger.info(f"Starting cleanup of stale desktop sessions (timeout_minutes={timeout_minutes})")

    async with get_celery_session() as db:
        service = DesktopSessionService()
        # cleanup_stale_sessions returns an int (count of sessions cleaned)
        count = await service.cleanup_stale_sessions(db, timeout_minutes)

        logger.info(f"Desktop session cleanup completed: {count} sessions marked inactive")

        return {
            "sessions_marked_inactive": count,
            "timestamp": datetime.utcnow().isoformat(),
        }


async def cleanup_stale_deployment_jobs_task(timeout_minutes: int = 60) -> Dict[str, Any]:
    """
    Cleanup stale deployment jobs stuck in IN_PROGRESS status.

    Wrapper for DeploymentJobService.cleanup_stale_jobs()

    Args:
        timeout_minutes: Minutes before a job is considered stale (default: 60)

    Returns:
        dict: Cleanup statistics with keys:
            - jobs_cleaned: Number of stale jobs cleaned up
            - timestamp: UTC timestamp of cleanup operation

    Raises:
        Exception: If cleanup operation fails
    """
    logger.info(f"Starting cleanup of stale deployment jobs (timeout_minutes={timeout_minutes})")

    async with get_celery_session() as db:
        service = DeploymentJobService()
        result = await service.cleanup_stale_jobs(db, timeout_minutes=timeout_minutes)

        logger.info(
            f"Deployment job cleanup completed: {result.get('jobs_cleaned', 0)} stale jobs cleaned"
        )

        return result


async def cleanup_old_job_executions_task(retention_days: int = 90) -> Dict[str, Any]:
    """
    Cleanup old scheduler job execution records.

    Wrapper for SchedulerService.cleanup_old_executions()

    Args:
        retention_days: Number of days to retain execution records (default: 90)

    Returns:
        dict: Cleanup statistics with keys:
            - executions_deleted: Number of old execution records deleted
            - cutoff_date: ISO timestamp of cutoff date used
            - timestamp: UTC timestamp of cleanup operation

    Raises:
        Exception: If cleanup operation fails
    """
    logger.info(f"Starting cleanup of old job executions (retention_days={retention_days})")

    async with get_celery_session() as db:
        service = SchedulerService()
        result = await service.cleanup_old_executions(db, retention_days)

        logger.info(
            f"Job execution cleanup completed: {result.get('executions_deleted', 0)} old records deleted "
            f"(cutoff: {result.get('cutoff_date', 'N/A')})"
        )

        return result


async def timeout_stale_job_executions_task(timeout_minutes: int = 5) -> Dict[str, Any]:
    """
    Mark stale job executions (stuck in running/pending) as timed out.

    This task should be scheduled to run every 1 minute to check for executions
    that have exceeded their job's timeout_seconds (default: 300 seconds = 5 minutes).
    Uses job-level timeout settings instead of a fixed timeout for all jobs.

    Wrapper for SchedulerService.timeout_stale_executions()

    Args:
        timeout_minutes: Default minutes before an execution is considered stale (default: 5)
                         This is used as fallback when job.timeout_seconds is None

    Returns:
        dict: Cleanup statistics with keys:
            - executions_timed_out: Number of executions marked as timed out
            - timestamp: UTC timestamp of cleanup operation

    Raises:
        Exception: If timeout operation fails
    """
    from datetime import datetime

    logger.info(f"Starting timeout of stale job executions (default timeout_minutes={timeout_minutes})")

    async with get_celery_session() as db:
        service = SchedulerService()
        result = await service.timeout_stale_executions(db, timeout_minutes)

        logger.info(
            f"Stale execution timeout completed: {result.get('executions_timed_out', 0)} executions marked as timeout"
        )

        return {
            "executions_timed_out": result.get("executions_timed_out", 0),
            "timestamp": datetime.utcnow().isoformat(),
        }
