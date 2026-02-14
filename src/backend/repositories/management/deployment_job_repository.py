"""
Deployment job repository for managing DeploymentJob model.

This repository handles all database operations for deployment jobs.
"""

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db import DeploymentJob, Device
from db.enums import DeploymentJobStatus, DeviceLifecycleState
from repositories.base_repository import BaseRepository


class DeploymentJobRepository(BaseRepository[DeploymentJob]):
    """Repository for DeploymentJob operations."""

    model = DeploymentJob

    @classmethod
    async def list_jobs(
        cls,
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

    @classmethod
    async def count_jobs(
        cls,
        db: AsyncSession,
        status: Optional[str] = None,
        job_type: Optional[str] = None,
    ) -> int:
        """
        Count jobs with optional filtering.

        Args:
            db: Database session
            status: Filter by job status
            job_type: Filter by job type

        Returns:
            Count of jobs
        """
        stmt = select(func.count(DeploymentJob.id))

        if status:
            stmt = stmt.where(DeploymentJob.status == status)

        if job_type:
            stmt = stmt.where(DeploymentJob.job_type == job_type)

        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def find_queued(cls, db: AsyncSession) -> List[DeploymentJob]:
        """
        Find all queued deployment jobs.

        Args:
            db: Database session

        Returns:
            List of queued jobs
        """
        stmt = (
            select(DeploymentJob)
            .where(DeploymentJob.status == DeploymentJobStatus.QUEUED.value)
            .order_by(DeploymentJob.created_at.asc())
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def claim_next(
        cls, db: AsyncSession, worker_id: str
    ) -> Optional[DeploymentJob]:
        """
        Atomically claim next queued job.

        Uses SELECT FOR UPDATE to ensure only one worker claims each job.

        Args:
            db: Database session
            worker_id: Unique worker identifier

        Returns:
            Claimed job or None if no jobs available
        """
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

        job.status = DeploymentJobStatus.IN_PROGRESS.value
        job.claimed_by = worker_id
        job.claimed_at = datetime.utcnow()

        await db.commit()
        await db.refresh(job)

        return job

    @classmethod
    async def update_result(
        cls,
        db: AsyncSession,
        job_id: UUID,
        status: str,
        error_message: Optional[str] = None,
        per_target: Optional[List] = None,
    ) -> Optional[DeploymentJob]:
        """
        Update job with completion result.

        Also updates device lifecycle states based on results.

        Args:
            db: Database session
            job_id: Job UUID
            status: Final status
            error_message: Error message if failed
            per_target: Per-target results

        Returns:
            Updated job or None
        """
        stmt = select(DeploymentJob).where(DeploymentJob.id == job_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            return None

        job.status = status
        job.completed_at = datetime.utcnow()
        job.error_message = error_message

        if per_target:
            job.result = {
                "per_target": [
                    {
                        "device_id": str(r.device_id),
                        "result": r.result,
                        "exit_code": r.exit_code,
                        "error_message": r.error_message,
                    }
                    for r in per_target
                ]
            }

            for target_result in per_target:
                device_stmt = select(Device).where(Device.id == target_result.device_id)
                device_result = await db.execute(device_stmt)
                device = device_result.scalar_one_or_none()

                if device:
                    if target_result.result == "success":
                        device.lifecycle_state = (
                            DeviceLifecycleState.INSTALLED_UNENROLLED.value
                        )
                    else:
                        device.lifecycle_state = DeviceLifecycleState.DISCOVERED.value

                    device.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(job)

        return job

    @classmethod
    async def count_queued(cls, db: AsyncSession) -> int:
        """
        Get count of queued jobs.

        Args:
            db: Database session

        Returns:
            Number of queued jobs
        """
        stmt = select(func.count(DeploymentJob.id)).where(
            DeploymentJob.status == DeploymentJobStatus.QUEUED.value
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def cleanup_stale(cls, db: AsyncSession, timeout_minutes: int = 60) -> dict:
        """
        Clean up stale deployment jobs stuck in IN_PROGRESS status.

        Args:
            db: Database session
            timeout_minutes: Minutes before a job is considered stale

        Returns:
            Dict: Cleanup statistics
        """
        timeout_threshold = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        stmt = select(DeploymentJob).where(
            DeploymentJob.status == DeploymentJobStatus.IN_PROGRESS.value,
            DeploymentJob.claimed_at.isnot(None),
            DeploymentJob.claimed_at < timeout_threshold,
        )

        result = await db.execute(stmt)
        stale_jobs = result.scalars().all()

        if not stale_jobs:
            return {
                "jobs_cleaned": 0,
                "timestamp": datetime.utcnow().isoformat(),
            }

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

        return {
            "jobs_cleaned": count,
            "timestamp": datetime.utcnow().isoformat(),
        }
