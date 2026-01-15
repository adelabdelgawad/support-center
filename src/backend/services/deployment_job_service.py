"""
DeploymentJob service for the Deployment Control Plane.

Handles job creation, claiming, and result reporting.
Jobs are immutable after creation - payload cannot be modified.
"""
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import DeploymentJob, Device
from models.model_enum import DeploymentJobStatus, DeviceLifecycleState
from schemas.deployment_job import DeploymentJobCreate, DeploymentJobResult

logger = logging.getLogger(__name__)


class DeploymentJobService:
    """Service for managing deployment jobs."""

    @staticmethod
    @safe_database_query("list_jobs", default_return=[])
    @log_database_operation("job listing", level="debug")
    async def list_jobs(
        db: AsyncSession,
        status: Optional[str] = None,
        job_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[DeploymentJob]:
        """
        List deployment jobs with optional filtering.

        Args:
            db: Database session
            status: Filter by job status
            job_type: Filter by job type
            limit: Maximum results to return
            offset: Skip first N results

        Returns:
            List of deployment jobs
        """
        stmt = select(DeploymentJob).order_by(DeploymentJob.created_at.desc())

        if status:
            stmt = stmt.where(DeploymentJob.status == status)

        if job_type:
            stmt = stmt.where(DeploymentJob.job_type == job_type)

        stmt = stmt.offset(offset).limit(limit)
        result = await db.execute(stmt)
        jobs = result.scalars().all()

        return list(jobs)

    @staticmethod
    @safe_database_query("count_jobs", default_return=0)
    async def count_jobs(
        db: AsyncSession,
        status: Optional[str] = None,
        job_type: Optional[str] = None,
    ) -> int:
        """Count jobs with optional filtering."""
        from sqlalchemy import func

        stmt = select(func.count(DeploymentJob.id))

        if status:
            stmt = stmt.where(DeploymentJob.status == status)

        if job_type:
            stmt = stmt.where(DeploymentJob.job_type == job_type)

        result = await db.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    @safe_database_query("get_job")
    @log_database_operation("job retrieval", level="debug")
    async def get_job(db: AsyncSession, job_id: UUID) -> Optional[DeploymentJob]:
        """
        Get a deployment job by ID.

        Args:
            db: Database session
            job_id: Job UUID

        Returns:
            DeploymentJob or None
        """
        stmt = select(DeploymentJob).where(DeploymentJob.id == job_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_job")
    @log_database_operation("job creation", level="info")
    async def create_job(
        db: AsyncSession,
        job_data: DeploymentJobCreate,
        created_by: Optional[UUID] = None,
    ) -> DeploymentJob:
        """
        Create a new deployment job.

        Jobs are immutable after creation - the payload cannot be modified.

        Args:
            db: Database session
            job_data: Job creation data
            created_by: User who created the job

        Returns:
            Created deployment job
        """
        job = DeploymentJob(
            job_type=job_data.job_type,
            status=DeploymentJobStatus.QUEUED.value,
            payload=job_data.payload,
            created_by=created_by,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        logger.info(f"Deployment job created: {job.id} (type: {job.job_type})")
        return job

    @staticmethod
    @transactional_database_operation("claim_next_job")
    @log_database_operation("job claiming", level="info")
    async def claim_next_job(
        db: AsyncSession,
        worker_id: str,
    ) -> Optional[DeploymentJob]:
        """
        Atomically claim the next queued job.

        Uses SELECT FOR UPDATE to ensure only one worker claims each job.

        Args:
            db: Database session
            worker_id: Unique worker identifier

        Returns:
            Claimed job or None if no jobs available
        """
        # Select next queued job with row lock
        stmt = (
            select(DeploymentJob)
            .where(DeploymentJob.status == DeploymentJobStatus.QUEUED.value)
            .order_by(DeploymentJob.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )

        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            return None

        # Claim the job
        job.status = DeploymentJobStatus.IN_PROGRESS.value
        job.claimed_by = worker_id
        job.claimed_at = datetime.utcnow()

        await db.commit()
        await db.refresh(job)

        logger.info(f"Job {job.id} claimed by worker {worker_id}")
        return job

    @staticmethod
    @transactional_database_operation("report_job_result")
    @log_database_operation("job result reporting", level="info")
    async def report_job_result(
        db: AsyncSession,
        job_id: UUID,
        result_data: DeploymentJobResult,
    ) -> Optional[DeploymentJob]:
        """
        Report job completion result.

        Updates job status and per-target results, and updates
        device lifecycle states based on results.

        Args:
            db: Database session
            job_id: Job UUID
            result_data: Job result data

        Returns:
            Updated job or None if not found
        """
        stmt = select(DeploymentJob).where(DeploymentJob.id == job_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            return None

        # Validate job is in progress
        if job.status != DeploymentJobStatus.IN_PROGRESS.value:
            raise ValueError(
                f"Cannot report result for job in status '{job.status}'. "
                f"Expected '{DeploymentJobStatus.IN_PROGRESS.value}'"
            )

        # Update job
        job.status = result_data.status
        job.completed_at = datetime.utcnow()
        job.error_message = result_data.error_message

        # Store per-target results
        if result_data.per_target:
            job.result = {
                "per_target": [
                    {
                        "device_id": str(r.device_id),
                        "result": r.result,
                        "exit_code": r.exit_code,
                        "error_message": r.error_message,
                    }
                    for r in result_data.per_target
                ]
            }

            # Update device lifecycle states based on results
            for target_result in result_data.per_target:
                device_stmt = select(Device).where(
                    Device.id == target_result.device_id
                )
                device_result = await db.execute(device_stmt)
                device = device_result.scalar_one_or_none()

                if device:
                    if target_result.result == "success":
                        # Successful install -> installed but not enrolled yet
                        device.lifecycle_state = (
                            DeviceLifecycleState.INSTALLED_UNENROLLED.value
                        )
                    else:
                        # Failed install -> back to discovered
                        device.lifecycle_state = DeviceLifecycleState.DISCOVERED.value

                    device.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(job)

        logger.info(
            f"Job {job.id} completed with status {job.status} "
            f"({len(result_data.per_target)} targets)"
        )
        return job

    @staticmethod
    @safe_database_query("get_queued_count", default_return=0)
    async def get_queued_count(db: AsyncSession) -> int:
        """Get count of queued jobs."""
        from sqlalchemy import func

        stmt = select(func.count(DeploymentJob.id)).where(
            DeploymentJob.status == DeploymentJobStatus.QUEUED.value
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    @transactional_database_operation("cleanup_stale_jobs")
    @log_database_operation("stale job cleanup", level="info")
    async def cleanup_stale_jobs(
        db: AsyncSession,
        timeout_minutes: int = 60,
    ) -> dict:
        """
        Cleanup stale deployment jobs stuck in IN_PROGRESS status.

        Jobs that have been claimed but not completed within the timeout
        are marked as FAILED with an appropriate error message.

        Args:
            db: Database session
            timeout_minutes: Minutes before a job is considered stale (default: 60)

        Returns:
            dict: Cleanup statistics with keys:
                - jobs_cleaned: Number of stale jobs marked as failed
                - timestamp: UTC timestamp of cleanup operation
        """
        from datetime import timedelta
        from sqlalchemy import update

        timeout_threshold = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        # Find stale jobs (IN_PROGRESS and claimed more than timeout_minutes ago)
        stmt = select(DeploymentJob).where(
            DeploymentJob.status == DeploymentJobStatus.IN_PROGRESS.value,
            DeploymentJob.claimed_at.isnot(None),
            DeploymentJob.claimed_at < timeout_threshold,
        )

        result = await db.execute(stmt)
        stale_jobs = result.scalars().all()

        if not stale_jobs:
            logger.debug("No stale deployment jobs found")
            return {
                "jobs_cleaned": 0,
                "timestamp": datetime.utcnow().isoformat(),
            }

        # Mark stale jobs as FAILED
        stale_job_ids = [job.id for job in stale_jobs]

        update_stmt = (
            update(DeploymentJob)
            .where(DeploymentJob.id.in_(stale_job_ids))
            .values(
                status=DeploymentJobStatus.FAILED.value,
                completed_at=datetime.utcnow(),
                error_message=f"Job timed out after {timeout_minutes} minutes without completion",
            )
        )

        await db.execute(update_stmt)
        await db.commit()

        count = len(stale_jobs)
        logger.info(
            f"Cleaned up {count} stale deployment jobs "
            f"(timeout: {timeout_minutes} minutes)"
        )

        return {
            "jobs_cleaned": count,
            "timestamp": datetime.utcnow().isoformat(),
        }
