"""
Deployment job management tasks.

Handles:
- Monitoring stale deployment jobs
- Marking timed-out jobs as failed
- Resetting device states for failed jobs
"""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from celery_app import celery_app
from core.config import settings
from models import Device, DeploymentJob
from models.model_enum import DeviceLifecycleState, DeploymentJobStatus

logger = logging.getLogger(__name__)


def get_task_session_factory():
    """
    Create a fresh async session factory for Celery tasks.

    This is needed because asyncpg connections are not fork-safe.
    Each task execution gets its own engine and session.
    """
    engine = create_async_engine(
        str(settings.database.url),
        pool_size=2,
        max_overflow=0,
        pool_pre_ping=True,
    )
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    ), engine

# Timeout settings (in minutes)
JOB_CLAIM_TIMEOUT_MINUTES = 5  # Time for worker to claim a queued job
JOB_EXECUTION_TIMEOUT_MINUTES = 5  # Time for worker to complete a claimed job

# Task schedule interval (in seconds)
TASK_INTERVAL_SECONDS = 30


async def _cleanup_stale_jobs(db: AsyncSession) -> dict:
    """
    Clean up stale deployment jobs.

    - Queued jobs not claimed within 5 minutes → failed
    - In-progress jobs not completed within 5 minutes → failed

    Returns:
        dict with counts of jobs processed
    """
    now = datetime.utcnow()
    claim_timeout = now - timedelta(minutes=JOB_CLAIM_TIMEOUT_MINUTES)
    execution_timeout = now - timedelta(minutes=JOB_EXECUTION_TIMEOUT_MINUTES)

    results = {
        "stale_queued": 0,
        "stale_in_progress": 0,
        "devices_reset": 0,
    }

    # Find stale queued jobs (unclaimed for too long)
    stale_queued_stmt = select(DeploymentJob).where(
        DeploymentJob.status == DeploymentJobStatus.QUEUED.value,
        DeploymentJob.created_at < claim_timeout,
    )
    stale_queued_result = await db.execute(stale_queued_stmt)
    stale_queued_jobs = list(stale_queued_result.scalars().all())

    for job in stale_queued_jobs:
        job.status = DeploymentJobStatus.FAILED.value
        job.completed_at = now
        job.error_message = f"Job timed out: No deployment worker claimed the job within {JOB_CLAIM_TIMEOUT_MINUTES} minutes. Ensure the deployment worker service is running."
        results["stale_queued"] += 1

        logger.warning(
            f"Marked job {job.id} as failed: unclaimed for {JOB_CLAIM_TIMEOUT_MINUTES}+ minutes"
        )

        # Reset device states for targets in this job
        devices_reset = await _reset_device_states(db, job)
        results["devices_reset"] += devices_reset

    # Find stale in-progress jobs (execution taking too long)
    stale_progress_stmt = select(DeploymentJob).where(
        DeploymentJob.status == DeploymentJobStatus.IN_PROGRESS.value,
        DeploymentJob.claimed_at < execution_timeout,
    )
    stale_progress_result = await db.execute(stale_progress_stmt)
    stale_progress_jobs = list(stale_progress_result.scalars().all())

    for job in stale_progress_jobs:
        job.status = DeploymentJobStatus.FAILED.value
        job.completed_at = now
        job.error_message = f"Job timed out: Deployment worker did not complete the job within {JOB_EXECUTION_TIMEOUT_MINUTES} minutes. The worker may have crashed or lost connectivity."
        results["stale_in_progress"] += 1

        logger.warning(
            f"Marked job {job.id} as failed: in_progress for {JOB_EXECUTION_TIMEOUT_MINUTES}+ minutes"
        )

        # Reset device states for targets in this job
        devices_reset = await _reset_device_states(db, job)
        results["devices_reset"] += devices_reset

    if results["stale_queued"] > 0 or results["stale_in_progress"] > 0:
        await db.commit()
        logger.info(
            f"Cleaned up stale jobs: {results['stale_queued']} queued, "
            f"{results['stale_in_progress']} in_progress, "
            f"{results['devices_reset']} devices reset"
        )

    return results


async def _reset_device_states(db: AsyncSession, job: DeploymentJob) -> int:
    """
    Reset device lifecycle states for failed job targets.

    Devices in 'install_pending' state are reset to 'discovered'.

    Args:
        db: Database session
        job: The failed deployment job

    Returns:
        Number of devices reset
    """
    reset_count = 0

    # Extract target machine IDs from job payload
    payload = job.payload or {}
    targets = payload.get("targets", [])

    for target in targets:
        # Handle both old format (device_id) and new format (machineId)
        machine_id = target.get("machineId") or target.get("device_id")
        if not machine_id:
            continue

        try:
            # Find and reset device
            device_stmt = select(Device).where(
                Device.id == machine_id,
                Device.lifecycle_state == DeviceLifecycleState.INSTALL_PENDING.value,
            )
            device_result = await db.execute(device_stmt)
            device = device_result.scalar_one_or_none()

            if device:
                device.lifecycle_state = DeviceLifecycleState.DISCOVERED.value
                reset_count += 1
                logger.info(
                    f"Reset device {device.hostname} ({device.id}) to 'discovered' state"
                )
        except Exception as e:
            logger.error(f"Failed to reset device {machine_id}: {e}")

    return reset_count


def run_async(coro):
    """Run async function in sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="tasks.deployment_tasks.cleanup_stale_deployment_jobs",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def cleanup_stale_deployment_jobs(self):
    """
    Celery task to clean up stale deployment jobs.

    Runs periodically to:
    - Mark queued jobs as failed if not claimed within 5 minutes
    - Mark in-progress jobs as failed if not completed within 5 minutes
    - Reset device states for failed jobs
    """
    async def _run():
        # Create fresh session factory for this task (fork-safe)
        session_factory, engine = get_task_session_factory()
        try:
            async with session_factory() as db:
                try:
                    results = await _cleanup_stale_jobs(db)
                    return results
                except Exception as e:
                    logger.error(f"Error cleaning up stale jobs: {e}")
                    await db.rollback()
                    raise
        finally:
            # Dispose engine to clean up connections
            await engine.dispose()

    try:
        return run_async(_run())
    except Exception as e:
        logger.error(f"Cleanup stale jobs task failed: {e}")
        raise self.retry(exc=e)


# Celery Beat schedule for periodic execution
celery_app.conf.beat_schedule = celery_app.conf.get("beat_schedule", {})
celery_app.conf.beat_schedule["cleanup-stale-deployment-jobs"] = {
    "task": "tasks.deployment_tasks.cleanup_stale_deployment_jobs",
    "schedule": TASK_INTERVAL_SECONDS,  # Run every 30 seconds
    "options": {"queue": "celery"},
}
