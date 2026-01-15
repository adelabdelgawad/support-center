"""
Scheduler Manager - APScheduler integration with leader election.

This module provides the core scheduling functionality:
- APScheduler integration with background scheduler
- Database-driven job configuration
- Leader election for distributed deployments
- Job dispatching to Celery workers
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import AsyncSessionLocal
from models.database_models import ScheduledJob, SchedulerInstance
from services.scheduler_service import scheduler_service

logger = logging.getLogger(__name__)


def _to_naive_utc(dt: datetime) -> datetime:
    """Convert timezone-aware datetime to naive UTC for database storage.

    Args:
        dt: Timezone-aware datetime from APScheduler

    Returns:
        Naive datetime in UTC (timezone info removed)
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Already naive, assume UTC
        return dt
    # Convert to UTC and remove timezone info
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


class SchedulerManager:
    """
    Manages APScheduler instance with leader election.

    Features:
    - Background scheduler with job store in memory
    - Leader election via database heartbeats
    - Automatic job dispatching to Celery
    - Graceful shutdown handling
    """

    def __init__(self, check_interval_seconds: int = 60):
        """Initialize the scheduler manager.

        Args:
            check_interval_seconds: How often to check leader status (default 60s)
        """
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.instance_id: Optional[UUID] = None
        self.is_leader = False
        self.check_interval_seconds = check_interval_seconds
        self._shutdown_event = asyncio.Event()
        self._leader_check_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start the scheduler and register instance.

        1. Create scheduler instance
        2. Register in database
        3. Start leader election
        4. Start background scheduler if leader
        """
        logger.info("Starting scheduler manager...")

        # Create APScheduler
        self.scheduler = AsyncIOScheduler()

        # Register this instance
        async with AsyncSessionLocal() as db:
            self.instance_id = await scheduler_service.register_scheduler_instance(db)

        # Start leader election loop
        self._leader_check_task = asyncio.create_task(self._leader_election_loop())

        logger.info(f"Scheduler manager started (instance: {self.instance_id})")

    async def stop(self) -> None:
        """Stop the scheduler and cleanup.

        1. Stop leader election loop
        2. Shutdown scheduler if running
        3. Cleanup stale instance record
        """
        logger.info("Stopping scheduler manager...")

        # Signal shutdown
        self._shutdown_event.set()

        # Cancel leader check task
        if self._leader_check_task:
            self._leader_check_task.cancel()
            try:
                await self._leader_check_task
            except asyncio.CancelledError:
                pass

        # Shutdown scheduler if running
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("Scheduler shutdown complete")

        logger.info("Scheduler manager stopped")

    async def _leader_election_loop(self) -> None:
        """
        Leader election loop running in background.

        Every check_interval_seconds:
        1. Update heartbeat
        2. Try to acquire leadership if no active leader
        3. If leader, sync jobs from database to scheduler
        4. If follower, ensure scheduler is stopped
        """
        while not self._shutdown_event.is_set():
            try:
                async with AsyncSessionLocal() as db:
                    # Update heartbeat
                    await scheduler_service.update_instance_heartbeat(
                        db=db,
                        instance_id=self.instance_id,
                    )

                    # Try to acquire leadership
                    is_leader = await scheduler_service.acquire_leader_lock(
                        db=db,
                        instance_id=self.instance_id,
                    )

                    if is_leader and not self.is_leader:
                        # Became leader - start scheduler and sync jobs
                        logger.info(f"Instance {self.instance_id} became leader")
                        self.is_leader = True
                        await self._on_become_leader()

                    elif not is_leader and self.is_leader:
                        # Lost leadership - stop scheduler
                        logger.info(f"Instance {self.instance_id} lost leadership")
                        self.is_leader = False
                        await self._on_lose_leader()

                    elif is_leader and self.is_leader:
                        # Still leader - sync jobs periodically
                        await self._sync_jobs_from_database(db)

                # Wait for next check interval or shutdown
                try:
                    await asyncio.wait_for(
                        self._shutdown_event.wait(),
                        timeout=self.check_interval_seconds,
                    )
                except asyncio.TimeoutError:
                    # Normal timeout, continue loop
                    pass

            except Exception as e:
                logger.error(f"Leader election loop error: {e}", exc_info=True)
                # Wait before retry
                await asyncio.sleep(5)

    async def _on_become_leader(self) -> None:
        """Actions when this instance becomes leader."""
        # Start scheduler if not running
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("APScheduler started")

        # Sync jobs from database
        async with AsyncSessionLocal() as db:
            await self._sync_jobs_from_database(db)

        # Cleanup stale instances
        async with AsyncSessionLocal() as db:
            await scheduler_service.cleanup_stale_instances(db=db)

    async def _on_lose_leader(self) -> None:
        """Actions when this instance loses leadership."""
        # Stop scheduler
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("APScheduler stopped (lost leadership)")

    async def _sync_jobs_from_database(self, db: AsyncSession) -> None:
        """
        Sync enabled jobs from database to APScheduler.

        For each enabled job:
        1. Check if job exists in scheduler
        2. If not, add job with appropriate trigger
        3. If exists, update if schedule changed

        Jobs are dispatched to Celery via scheduler_tasks.execute_scheduled_job
        """
        if not self.scheduler or not self.scheduler.running:
            return

        # Get all enabled jobs
        result = await db.execute(
            select(ScheduledJob).where(
                ScheduledJob.is_enabled == True,
                ScheduledJob.is_paused == False,
            )
        )
        jobs = result.scalars().all()

        # Get existing jobs in scheduler
        existing_job_ids = {job.id for job in self.scheduler.get_jobs()}

        for job in jobs:
            job_key = str(job.id)

            # Calculate next run time based on schedule config
            next_run_time = await self._calculate_next_run_time(job)

            if job_key not in existing_job_ids:
                # Add new job
                await self._add_job_to_scheduler(job)
            else:
                # Update existing job if needed
                scheduled_job = self.scheduler.get_job(job_key)
                if scheduled_job:
                    # Update job's trigger if needed
                    await self._update_scheduled_job(job)

        logger.debug(f"Synced {len(jobs)} jobs from database")

    async def _add_job_to_scheduler(self, job: ScheduledJob) -> None:
        """Add a job to the scheduler.

        Args:
            job: ScheduledJob model instance
        """
        job_key = str(job.id)
        trigger = await self._create_trigger(job)

        if trigger is None:
            logger.warning(f"Cannot add job {job.id}: invalid schedule config")
            return

        # Add job to scheduler
        self.scheduler.add_job(
            func=_dispatch_scheduled_job,
            trigger=trigger,
            id=job_key,
            args=[str(job.id)],
            kwargs={},
            name=job.name,
            misfire_grace_time=300,  # 5 minutes
            replace_existing=True,
        )

        # Update next_run_time in database
        scheduled_job = self.scheduler.get_job(job_key)
        if scheduled_job and scheduled_job.next_run_time:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    select(ScheduledJob).where(ScheduledJob.id == job.id)
                )
                # Update next_run_time (convert aware datetime to naive UTC)
                from sqlalchemy import update

                await db.execute(
                    update(ScheduledJob)
                    .where(ScheduledJob.id == job.id)
                    .values(next_run_time=_to_naive_utc(scheduled_job.next_run_time))
                )
                await db.commit()

        logger.info(f"Added job {job.id} ({job.name}) to scheduler")

    async def _update_scheduled_job(self, job: ScheduledJob) -> None:
        """Update an existing scheduled job.

        Args:
            job: ScheduledJob model instance
        """
        job_key = str(job.id)
        trigger = await self._create_trigger(job)

        if trigger is None:
            return

        # Reschedule job with new trigger
        self.scheduler.reschedule_job(job_key, trigger=trigger)

        logger.debug(f"Updated job {job.id} in scheduler")

    async def _create_trigger(self, job: ScheduledJob):
        """
        Create APScheduler trigger from job configuration.

        Args:
            job: ScheduledJob with schedule_config

        Returns:
            IntervalTrigger or CronTrigger, or None if invalid
        """
        config = job.schedule_config
        job_type = job.job_type.name  # "interval" or "cron"

        try:
            if job_type == "interval":
                # Interval trigger: {seconds, minutes, hours}
                return IntervalTrigger(
                    seconds=config.get("seconds"),
                    minutes=config.get("minutes"),
                    hours=config.get("hours"),
                )

            elif job_type == "cron":
                # Cron trigger: {second, minute, hour, day, day_of_week, month}
                return CronTrigger(
                    second=config.get("second", "0"),
                    minute=config.get("minute", "*"),
                    hour=config.get("hour", "*"),
                    day=config.get("day", "*"),
                    day_of_week=config.get("day_of_week", "*"),
                    month=config.get("month", "*"),
                )

            else:
                logger.warning(f"Unknown job type: {job_type}")
                return None

        except Exception as e:
            logger.error(f"Failed to create trigger for job {job.id}: {e}")
            return None

    async def _calculate_next_run_time(self, job: ScheduledJob) -> Optional[datetime]:
        """Calculate next run time for a job.

        Args:
            job: ScheduledJob instance

        Returns:
            Next run datetime or None
        """
        trigger = await self._create_trigger(job)
        if trigger is None:
            return None

        # Get next fire time from now (use timezone-aware datetime)
        next_time = trigger.get_next_fire_time(None, datetime.now(timezone.utc))
        return next_time


async def _dispatch_scheduled_job(job_id: str) -> None:
    """
    Dispatch a scheduled job to Celery.

    This function is called by APScheduler when a job is due.
    It creates an execution record and dispatches to Celery.

    Args:
        job_id: Scheduled job ID (UUID string)
    """
    logger.info(f"Dispatching job {job_id} to Celery")

    from tasks.scheduler_tasks import execute_scheduled_job
    from models.database_models import ScheduledJobExecution
    from uuid import uuid4

    async with AsyncSessionLocal() as db:
        # Get job
        result = await db.execute(
            select(ScheduledJob).where(ScheduledJob.id == UUID(job_id))
        )
        job = result.scalar_one_or_none()

        if not job:
            logger.error(f"Job {job_id} not found for dispatch")
            return

        # Create execution record
        execution = ScheduledJobExecution(
            job_id=UUID(job_id),
            status="pending",
            triggered_by="scheduler",
        )
        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        # Get scheduler instance for tracking
        leader_result = await db.execute(
            select(SchedulerInstance).where(SchedulerInstance.is_leader == True)
        )
        leader = leader_result.scalar_one_or_none()
        if leader:
            execution.scheduler_instance_id = leader.id
            await db.commit()

    # Dispatch to Celery
    execute_scheduled_job.apply_async(
        args=[job_id, str(execution.id), "scheduler"],
        queue=job.task_function.queue or "celery",
    )

    logger.info(f"Job {job_id} dispatched as execution {execution.id}")


# Global scheduler manager instance
scheduler_manager: Optional[SchedulerManager] = None


def get_scheduler_manager() -> SchedulerManager:
    """Get or create the global scheduler manager instance."""
    global scheduler_manager
    if scheduler_manager is None:
        scheduler_manager = SchedulerManager()
    return scheduler_manager
