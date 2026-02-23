"""
Scheduler repository for managing ScheduledJob, ScheduledJobExecution, SchedulerInstance, SchedulerJobType, TaskFunction models.

This repository handles all database operations for scheduler and job management.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, case, delete, func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from db.models import (
    ScheduledJob,
    ScheduledJobExecution,
    SchedulerInstance,
    SchedulerJobType,
    TaskFunction,
)
from api.repositories.base_repository import BaseRepository


class TaskFunctionRepository(BaseRepository[TaskFunction]):
    """Repository for TaskFunction operations."""

    model = TaskFunction

    @classmethod
    async def list_functions(
        cls,
        db: AsyncSession,
        is_active: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple:
        """
        List all available task functions.

        Args:
            db: Database session
            is_active: Filter by active status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (functions list, total count)
        """
        query = select(TaskFunction)

        if is_active is not None:
            query = query.where(TaskFunction.__table__.c.is_active == is_active)

        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        query = (
            query.order_by(TaskFunction.__table__.c.name)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await db.execute(query)
        task_functions = result.scalars().all()

        return list(task_functions), total

    @classmethod
    async def find_by_id(  # type: ignore[override]
        cls, db: AsyncSession, function_id: Any, *, eager_load: Optional[List] = None
    ) -> Optional[TaskFunction]:
        """
        Find task function by ID.

        Args:
            db: Database session
            function_id: Task function ID
            eager_load: Unused, kept for signature compatibility

        Returns:
            TaskFunction or None
        """
        stmt = select(TaskFunction).where(TaskFunction.__table__.c.id == function_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()


class SchedulerJobTypeRepository(BaseRepository[SchedulerJobType]):
    """Repository for SchedulerJobType operations."""

    model = SchedulerJobType

    @classmethod
    async def list_active_types(cls, db: AsyncSession) -> List[SchedulerJobType]:
        """
        List all available job schedule types.

        Args:
            db: Database session

        Returns:
            List of job types
        """
        result = await db.execute(
            select(SchedulerJobType)
            .where(SchedulerJobType.__table__.c.is_active.is_(True))
            .order_by(SchedulerJobType.__table__.c.id)
        )
        job_types = result.scalars().all()

        return list(job_types)

    @classmethod
    async def find_by_id(  # type: ignore[override]
        cls, db: AsyncSession, job_type_id: Any, *, eager_load: Optional[List] = None
    ) -> Optional[SchedulerJobType]:
        """
        Find job type by ID.

        Args:
            db: Database session
            job_type_id: Job type ID
            eager_load: Unused, kept for signature compatibility

        Returns:
            SchedulerJobType or None
        """
        result = await db.execute(
            select(SchedulerJobType).where(SchedulerJobType.__table__.c.id == job_type_id)
        )
        return result.scalar_one_or_none()


class ScheduledJobRepository(BaseRepository[ScheduledJob]):
    """Repository for ScheduledJob operations."""

    model = ScheduledJob

    @classmethod
    async def list_jobs(
        cls,
        db: AsyncSession,
        name: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        task_function_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple:
        """
        List all scheduled jobs with filtering and pagination.

        Args:
            db: Database session
            name: Filter by job name (partial match)
            is_enabled: Filter by enabled status
            task_function_id: Filter by task function
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (jobs list, total, enabled_count, disabled_count, running_count)
        """
        filters: List[ColumnElement[bool]] = []
        if name:
            filters.append(ScheduledJob.__table__.c.name.ilike(f"%{name}%"))
        if is_enabled is not None:
            filters.append(ScheduledJob.__table__.c.is_enabled == is_enabled)
        if task_function_id is not None:
            filters.append(ScheduledJob.__table__.c.task_function_id == task_function_id)

        counts_query = select(
            func.count().label("total"),
            func.sum(case((ScheduledJob.__table__.c.is_enabled.is_(True), 1), else_=0)).label(
                "enabled_count"
            ),
            func.sum(case((ScheduledJob.__table__.c.last_status == "running", 1), else_=0)).label(
                "running_count"
            ),
        )
        if filters:
            counts_query = counts_query.where(and_(*filters))

        counts_result = await db.execute(counts_query)
        counts = counts_result.one()

        total = counts.total or 0
        enabled_count = counts.enabled_count or 0
        disabled_count = total - enabled_count
        running_count = counts.running_count or 0

        jobs_query = select(ScheduledJob)
        if filters:
            jobs_query = jobs_query.where(and_(*filters))

        jobs_query = (
            jobs_query.order_by(ScheduledJob.__table__.c.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        result = await db.execute(jobs_query)
        jobs = result.scalars().all()

        return list(jobs), total, enabled_count, disabled_count, running_count

    @classmethod
    async def find_by_id(  # type: ignore[override]
        cls, db: AsyncSession, job_id: Any, *, eager_load: Optional[List] = None
    ) -> Optional[ScheduledJob]:
        """
        Get a scheduled job by ID.

        Args:
            db: Database session
            job_id: Job ID
            eager_load: Unused, kept for signature compatibility

        Returns:
            ScheduledJob or None
        """
        result = await db.execute(select(ScheduledJob).where(ScheduledJob.__table__.c.id == job_id))
        return result.scalar_one_or_none()

    @classmethod
    async def count_total(cls, db: AsyncSession) -> int:
        """
        Count total scheduled jobs.

        Args:
            db: Database session

        Returns:
            Total count of jobs
        """
        total_result = await db.execute(select(func.count()).select_from(ScheduledJob))
        return total_result.scalar() or 0

    @classmethod
    async def count_enabled(cls, db: AsyncSession) -> int:
        """
        Count enabled scheduled jobs.

        Args:
            db: Database session

        Returns:
            Count of enabled jobs
        """
        enabled_result = await db.execute(
            select(func.count()).where(ScheduledJob.__table__.c.is_enabled.is_(True))
        )
        return enabled_result.scalar() or 0

    @classmethod
    async def count_running(cls, db: AsyncSession) -> int:
        """
        Count running scheduled jobs.

        Args:
            db: Database session

        Returns:
            Count of running jobs
        """
        running_result = await db.execute(
            select(func.count()).where(ScheduledJob.__table__.c.last_status == "running")
        )
        return running_result.scalar() or 0

    @classmethod
    async def find_next_scheduled(cls, db: AsyncSession) -> Optional[ScheduledJob]:
        """
        Get next scheduled job.

        Args:
            db: Database session

        Returns:
            Next scheduled job or None
        """
        next_result = await db.execute(
            select(ScheduledJob)
            .where(
                and_(
                    ScheduledJob.__table__.c.is_enabled.is_(True),
                    ScheduledJob.__table__.c.next_run_time.isnot(None),
                )
            )
            .order_by(ScheduledJob.__table__.c.next_run_time.asc())
            .limit(1)
        )
        return next_result.scalar_one_or_none()

    @classmethod
    async def update_enabled(
        cls,
        db: AsyncSession,
        job_id: UUID,
        is_enabled: bool,
        updated_by: Optional[UUID] = None,
    ) -> Optional[ScheduledJob]:
        """
        Enable or disable a scheduled job.

        Args:
            db: Database session
            job_id: Job ID
            is_enabled: New enabled status
            updated_by: User ID who made change

        Returns:
            Updated scheduled job or None
        """
        result = await db.execute(select(ScheduledJob).where(ScheduledJob.__table__.c.id == job_id))
        job = result.scalar_one_or_none()

        if not job:
            return None

        job.is_enabled = is_enabled
        job.updated_by = updated_by
        job.updated_at = datetime.utcnow()

        await db.flush()
        await db.refresh(job)

        return job

    @classmethod
    async def update_status(
        cls, db: AsyncSession, job_id: UUID, last_status: str
    ) -> None:
        """
        Update job last status.

        Args:
            db: Database session
            job_id: Job ID
            last_status: New status
        """
        await db.execute(
            update(ScheduledJob)
            .where(ScheduledJob.__table__.c.id == job_id)
            .values(last_status=last_status)
        )
        await db.flush()


class ScheduledJobExecutionRepository(BaseRepository[ScheduledJobExecution]):
    """Repository for ScheduledJobExecution operations."""

    model = ScheduledJobExecution

    @classmethod
    async def find_recent_by_job_id(
        cls, db: AsyncSession, job_id: UUID, limit: int = 10
    ) -> List[ScheduledJobExecution]:
        """
        Find recent executions for a job.

        Args:
            db: Database session
            job_id: Job ID
            limit: Maximum executions to return

        Returns:
            List of recent executions
        """
        result = await db.execute(
            select(ScheduledJobExecution)
            .where(ScheduledJobExecution.__table__.c.job_id == job_id)
            .order_by(ScheduledJobExecution.__table__.c.started_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    @classmethod
    async def list_executions(
        cls,
        db: AsyncSession,
        job_id: Optional[UUID] = None,
        status: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple:
        """
        List execution history.

        Args:
            db: Database session
            job_id: Filter by job ID
            status: Filter by status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (executions list, total count)
        """
        query = select(ScheduledJobExecution)

        if job_id:
            query = query.where(ScheduledJobExecution.__table__.c.job_id == job_id)
        if status:
            query = query.where(ScheduledJobExecution.__table__.c.status == status)

        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        query = query.order_by(ScheduledJobExecution.__table__.c.started_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await db.execute(query)
        executions = result.scalars().all()

        return list(executions), total

    @classmethod
    async def find_by_id(  # type: ignore[override]
        cls, db: AsyncSession, execution_id: Any, *, eager_load: Optional[List] = None
    ) -> Optional[ScheduledJobExecution]:
        """
        Find execution by ID.

        Args:
            db: Database session
            execution_id: Execution ID
            eager_load: Unused, kept for signature compatibility

        Returns:
            ScheduledJobExecution or None
        """
        result = await db.execute(
            select(ScheduledJobExecution).where(
                ScheduledJobExecution.__table__.c.id == execution_id
            )
        )
        return result.scalar_one_or_none()

    @classmethod
    async def update_started(
        cls, db: AsyncSession, execution_id: UUID, celery_task_id: str
    ) -> Optional[UUID]:
        """
        Mark execution as running.

        Args:
            db: Database session
            execution_id: Execution ID
            celery_task_id: Celery task ID

        Returns:
            Job ID or None
        """
        result_exec = await db.execute(
            select(ScheduledJobExecution).where(
                ScheduledJobExecution.__table__.c.id == execution_id
            )
        )
        execution = result_exec.scalar_one_or_none()

        if not execution:
            return None

        await db.execute(
            update(ScheduledJobExecution)
            .where(ScheduledJobExecution.__table__.c.id == execution_id)
            .values(
                status="running",
                celery_task_id=celery_task_id,
            )
        )

        await db.execute(
            update(ScheduledJob)
            .where(ScheduledJob.__table__.c.id == execution.job_id)
            .values(last_status="running")
        )

        await db.flush()

        return execution.job_id

    @classmethod
    async def update_completed(
        cls,
        db: AsyncSession,
        execution_id: UUID,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
        error_traceback: Optional[str] = None,
    ) -> Optional[UUID]:
        """
        Mark execution as complete.

        Args:
            db: Database session
            execution_id: Execution ID
            status: Final status
            result: Execution result
            error_message: Error message if failed
            error_traceback: Full traceback if failed

        Returns:
            Job ID or None
        """
        result_exec = await db.execute(
            select(ScheduledJobExecution).where(
                ScheduledJobExecution.__table__.c.id == execution_id
            )
        )
        execution = result_exec.scalar_one_or_none()

        if not execution:
            return None

        completed_at = datetime.utcnow()
        duration = None
        if execution.started_at:
            duration = (completed_at - execution.started_at).total_seconds()

        await db.execute(
            update(ScheduledJobExecution)
            .where(ScheduledJobExecution.__table__.c.id == execution_id)
            .values(
                status=status,
                completed_at=completed_at,
                duration_seconds=duration,
                result=result,
                error_message=error_message,
                error_traceback=error_traceback,
            )
        )

        await db.execute(
            update(ScheduledJob)
            .where(ScheduledJob.__table__.c.id == execution.job_id)
            .values(
                last_run_time=completed_at,
                last_status=status,
            )
        )

        await db.flush()

        return execution.job_id

    @classmethod
    async def cleanup_old_executions(
        cls, db: AsyncSession, retention_days: int = 90
    ) -> dict:
        """
        Clean up old scheduler job execution records.

        Args:
            db: Database session
            retention_days: Number of days to retain execution records

        Returns:
            Dict: Cleanup statistics
        """
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            delete(ScheduledJobExecution).where(
                ScheduledJobExecution.__table__.c.completed_at < cutoff_date
            )
        )

        await db.flush()
        count = cursor_result.rowcount

        return {
            "executions_deleted": count,
            "cutoff_date": cutoff_date.isoformat(),
            "timestamp": datetime.utcnow().isoformat(),
        }

    @classmethod
    async def timeout_stale_executions(
        cls, db: AsyncSession, timeout_minutes: int = 5
    ) -> dict:
        """
        Mark stale job executions as timed out.

        Args:
            db: Database session
            timeout_minutes: Minutes before marking as timed out

        Returns:
            Dict: Timeout statistics
        """
        timeout_threshold = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        count_result = await db.execute(
            select(func.count()).where(
                and_(
                    ScheduledJobExecution.__table__.c.started_at < timeout_threshold,
                    ScheduledJobExecution.__table__.c.status.in_(["pending", "running"]),
                )
            )
        )
        count = count_result.scalar() or 0

        await db.execute(
            update(ScheduledJobExecution)
            .where(
                and_(
                    ScheduledJobExecution.__table__.c.started_at < timeout_threshold,
                    ScheduledJobExecution.__table__.c.status.in_(["pending", "running"]),
                )
            )
            .values(
                status="timed_out",
                error_message=f"Timed out after {timeout_minutes} minutes",
            )
        )

        await db.flush()

        return {
            "executions_timed_out": count,
            "timeout_minutes": timeout_minutes,
            "timestamp": datetime.utcnow().isoformat(),
        }


class SchedulerInstanceRepository(BaseRepository[SchedulerInstance]):
    """Repository for SchedulerInstance operations."""

    model = SchedulerInstance

    @classmethod
    async def find_active_leader(cls, db: AsyncSession) -> Optional[SchedulerInstance]:
        """
        Find active leader instance.

        Args:
            db: Database session

        Returns:
            SchedulerInstance or None
        """
        result = await db.execute(
            select(SchedulerInstance).where(SchedulerInstance.__table__.c.is_leader.is_(True))
        )
        return result.scalar_one_or_none()

    @classmethod
    async def find_leader(cls, db: AsyncSession) -> Optional[SchedulerInstance]:
        """
        Alias for find_active_leader.

        Args:
            db: Database session

        Returns:
            SchedulerInstance or None
        """
        return await cls.find_active_leader(db)

    @classmethod
    async def find_active_leader_recent(
        cls, db: AsyncSession, timeout_minutes: int = 2
    ) -> Optional[SchedulerInstance]:
        """
        Find active leader with recent heartbeat.

        Args:
            db: Database session
            timeout_minutes: Minutes before instance is considered stale

        Returns:
            SchedulerInstance or None
        """
        result = await db.execute(
            select(SchedulerInstance).where(
                and_(
                    SchedulerInstance.__table__.c.is_leader.is_(True),
                    SchedulerInstance.__table__.c.last_heartbeat
                    > datetime.utcnow() - timedelta(minutes=timeout_minutes),
                )
            )
        )
        return result.scalar_one_or_none()

    @classmethod
    async def list_all(cls, db: AsyncSession) -> List[SchedulerInstance]:
        """
        List all scheduler instances.

        Args:
            db: Database session

        Returns:
            List of scheduler instances
        """
        instances_result = await db.execute(
            select(SchedulerInstance).order_by(SchedulerInstance.__table__.c.started_at.desc())
        )
        instances = instances_result.scalars().all()

        return list(instances)

    @classmethod
    async def create_instance(
        cls, db: AsyncSession, hostname: str, pid: int, version: str
    ) -> SchedulerInstance:
        """
        Register scheduler instance.

        Args:
            db: Database session
            hostname: Hostname
            pid: Process ID
            version: Scheduler version

        Returns:
            Created instance
        """
        instance = SchedulerInstance(
            hostname=hostname,
            pid=pid,
            version=version,
        )

        db.add(instance)
        await db.flush()
        await db.refresh(instance)

        return instance

    @classmethod
    async def update_leader(cls, db: AsyncSession, instance_id: UUID) -> bool:
        """
        Acquire leader lock for instance.

        Args:
            db: Database session
            instance_id: This instance's ID

        Returns:
            True if lock acquired, False otherwise
        """
        result = await db.execute(
            select(SchedulerInstance).where(
                and_(
                    SchedulerInstance.__table__.c.is_leader.is_(True),
                    SchedulerInstance.__table__.c.last_heartbeat
                    > datetime.utcnow() - timedelta(minutes=2),
                )
            )
        )
        current_leader = result.scalar_one_or_none()

        if current_leader and current_leader.id != instance_id:
            return False

        await db.execute(
            update(SchedulerInstance)
            .where(SchedulerInstance.__table__.c.id == instance_id)
            .values(
                is_leader=True,
                leader_since=datetime.utcnow(),
                last_heartbeat=datetime.utcnow(),
            )
        )

        await db.execute(
            update(SchedulerInstance)
            .where(
                and_(
                    SchedulerInstance.__table__.c.id != instance_id,
                    SchedulerInstance.__table__.c.is_leader.is_(True),
                )
            )
            .values(is_leader=False, leader_since=None)
        )

        await db.flush()

        return True

    @classmethod
    async def update_heartbeat(cls, db: AsyncSession, instance_id: UUID) -> None:
        """
        Update instance heartbeat.

        Args:
            db: Database session
            instance_id: This instance's ID
        """
        await db.execute(
            update(SchedulerInstance)
            .where(SchedulerInstance.__table__.c.id == instance_id)
            .values(last_heartbeat=datetime.utcnow())
        )
        await db.flush()

    @classmethod
    async def cleanup_stale_instances(
        cls, db: AsyncSession, heartbeat_timeout_minutes: int = 2
    ) -> int:
        """
        Remove stale scheduler instances.

        Args:
            db: Database session
            heartbeat_timeout_minutes: Minutes before instance is considered stale

        Returns:
            Number of instances removed
        """
        timeout = datetime.utcnow() - timedelta(minutes=heartbeat_timeout_minutes)

        await db.execute(
            update(SchedulerInstance)
            .where(
                and_(
                    SchedulerInstance.__table__.c.last_heartbeat < timeout,
                    SchedulerInstance.__table__.c.is_leader.is_(True),
                )
            )
            .values(is_leader=False, leader_since=None)
        )

        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            delete(SchedulerInstance).where(SchedulerInstance.__table__.c.last_heartbeat < timeout)
        )

        await db.flush()
        count = cursor_result.rowcount

        return count
