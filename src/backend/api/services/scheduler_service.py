"""Scheduler service for managing scheduled jobs and task functions.

This service handles:
- CRUD operations for scheduled jobs
- Task function registry
- Job execution tracking
- Scheduler instance management and leader election
- Manual job triggering
"""

import logging
import socket
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, case, delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    ScheduledJob,
    ScheduledJobExecution,
    SchedulerInstance,
    SchedulerJobType,
    TaskFunction,
)
from api.schemas.scheduler import (
    ScheduledJobCreate,
    ScheduledJobDetail,
    ScheduledJobListResponse,
    ScheduledJobRead,
    ScheduledJobTrigger,
    ScheduledJobUpdate,
    SchedulerInstanceRead,
    SchedulerStatusResponse,
    TaskFunctionListResponse,
    TaskFunctionRead,
    SchedulerJobTypeRead,
    ScheduledJobExecutionListResponse,
    ScheduledJobExecutionRead,
)

logger = logging.getLogger(__name__)


class SchedulerService:
    """Service for managing scheduled jobs and scheduler instances."""

    def __init__(self):
        self.version = "1.0.0"

    # ==========================================================================
    # Task Functions
    # ==========================================================================

    async def list_task_functions(
        self,
        db: AsyncSession,
        is_active: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> TaskFunctionListResponse:
        """List all available task functions.

        Args:
            db: Database session
            is_active: Filter by active status
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            TaskFunctionListResponse with task functions and total count
        """
        query = select(TaskFunction)

        if is_active is not None:
            query = query.where(TaskFunction.is_active == is_active)

        # Get total count
        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Get paginated results
        query = query.order_by(TaskFunction.name).offset((page - 1) * per_page).limit(per_page)
        result = await db.execute(query)
        task_functions = result.scalars().all()

        return TaskFunctionListResponse(
            task_functions=[TaskFunctionRead.model_validate(tf) for tf in task_functions],
            total=total,
        )

    # ==========================================================================
    # Job Types
    # ==========================================================================

    async def list_job_types(
        self,
        db: AsyncSession,
    ) -> List[SchedulerJobTypeRead]:
        """List all available job schedule types.

        Args:
            db: Database session

        Returns:
            List of job types
        """
        result = await db.execute(
            select(SchedulerJobType)
            .where(SchedulerJobType.is_active)
            .order_by(SchedulerJobType.id)
        )
        job_types = result.scalars().all()

        return [SchedulerJobTypeRead.model_validate(jt) for jt in job_types]

    # ==========================================================================
    # Scheduled Jobs
    # ==========================================================================

    async def list_scheduled_jobs(
        self,
        db: AsyncSession,
        name: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        task_function_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> ScheduledJobListResponse:
        """List all scheduled jobs with filtering and pagination.

        Args:
            db: Database session
            name: Filter by job name (partial match)
            is_enabled: Filter by enabled status
            task_function_id: Filter by task function
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            ScheduledJobListResponse with jobs and statistics
        """
        # Build base query with filters
        filters = []
        if name:
            filters.append(ScheduledJob.name.ilike(f"%{name}%"))
        if is_enabled is not None:
            filters.append(ScheduledJob.is_enabled == is_enabled)
        if task_function_id is not None:
            filters.append(ScheduledJob.task_function_id == task_function_id)

        # Single query to get all counts efficiently using conditional aggregation
        counts_query = select(
            func.count().label("total"),
            func.sum(case((ScheduledJob.is_enabled, 1), else_=0)).label("enabled_count"),
            func.sum(case((ScheduledJob.last_status == "running", 1), else_=0)).label("running_count"),
        )
        if filters:
            counts_query = counts_query.where(and_(*filters))

        counts_result = await db.execute(counts_query)
        counts = counts_result.one()

        total = counts.total or 0
        enabled_count = counts.enabled_count or 0
        disabled_count = total - enabled_count
        running_count = counts.running_count or 0

        # Get paginated results
        jobs_query = select(ScheduledJob)
        if filters:
            jobs_query = jobs_query.where(and_(*filters))

        jobs_query = (
            jobs_query
            .order_by(ScheduledJob.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        result = await db.execute(jobs_query)
        jobs = result.scalars().all()

        return ScheduledJobListResponse(
            jobs=[ScheduledJobRead.model_validate(job) for job in jobs],
            total=total,
            enabled_count=enabled_count,
            disabled_count=disabled_count,
            running_count=running_count,
        )

    async def get_scheduled_job(
        self,
        job_id: UUID,
        db: AsyncSession,
    ) -> ScheduledJobDetail:
        """Get a scheduled job with full details.

        Args:
            job_id: Job ID
            db: Database session

        Returns:
            ScheduledJobDetail with relationships

        Raises:
            HTTPException: If job not found
        """
        # Get job with task function and job type
        result = await db.execute(
            select(ScheduledJob)
            .where(ScheduledJob.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scheduled job {job_id} not found",
            )

        # Get task function
        tf_result = await db.execute(
            select(TaskFunction).where(TaskFunction.id == job.task_function_id)
        )
        task_function = tf_result.scalar_one_or_none()

        # Get job type
        jt_result = await db.execute(
            select(SchedulerJobType).where(SchedulerJobType.id == job.job_type_id)
        )
        job_type = jt_result.scalar_one_or_none()

        # Get recent executions
        exec_result = await db.execute(
            select(ScheduledJobExecution)
            .where(ScheduledJobExecution.job_id == job_id)
            .order_by(ScheduledJobExecution.started_at.desc())
            .limit(10)
        )
        executions = exec_result.scalars().all()

        return ScheduledJobDetail(
            **ScheduledJobRead.model_validate(job).model_dump(),
            task_function=TaskFunctionRead.model_validate(task_function) if task_function else None,
            job_type=SchedulerJobTypeRead.model_validate(job_type) if job_type else None,
            recent_executions=[ScheduledJobExecutionRead.model_validate(e) for e in executions],
        )

    async def create_scheduled_job(
        self,
        job_data: ScheduledJobCreate,
        db: AsyncSession,
        created_by: Optional[UUID] = None,
    ) -> ScheduledJobRead:
        """Create a new scheduled job.

        Args:
            job_data: Job creation data
            db: Database session
            created_by: User ID who created the job

        Returns:
            Created scheduled job

        Raises:
            HTTPException: If validation fails
        """
        # Validate task function exists
        tf_result = await db.execute(
            select(TaskFunction).where(TaskFunction.id == job_data.task_function_id)
        )
        task_function = tf_result.scalar_one_or_none()
        if not task_function:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task function {job_data.task_function_id} not found",
            )

        # Validate job type exists
        jt_result = await db.execute(
            select(SchedulerJobType).where(SchedulerJobType.id == job_data.job_type_id)
        )
        job_type = jt_result.scalar_one_or_none()
        if not job_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job type {job_data.job_type_id} not found",
            )

        # Create job
        job = ScheduledJob(
            name=job_data.name,
            description=job_data.description,
            task_function_id=job_data.task_function_id,
            job_type_id=job_data.job_type_id,
            schedule_config=job_data.schedule_config,
            task_args=job_data.task_args,
            max_instances=job_data.max_instances,
            timeout_seconds=job_data.timeout_seconds,
            retry_count=job_data.retry_count,
            retry_delay_seconds=job_data.retry_delay_seconds,
            is_enabled=job_data.is_enabled,
            created_by=created_by,
            updated_by=created_by,
        )

        db.add(job)
        await db.flush()
        await db.commit()

        logger.info(f"Created scheduled job: {job.id} - {job.name}")
        return ScheduledJobRead.model_validate(job)

    async def update_scheduled_job(
        self,
        job_id: UUID,
        job_data: ScheduledJobUpdate,
        db: AsyncSession,
        updated_by: Optional[UUID] = None,
    ) -> ScheduledJobRead:
        """Update a scheduled job.

        Args:
            job_id: Job ID
            job_data: Job update data
            db: Database session
            updated_by: User ID who updated the job

        Returns:
            Updated scheduled job

        Raises:
            HTTPException: If job not found
        """
        # Get job
        result = await db.execute(
            select(ScheduledJob).where(ScheduledJob.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scheduled job {job_id} not found",
            )

        # Update fields
        update_data = job_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(job, field, value)

        job.updated_by = updated_by
        job.updated_at = datetime.utcnow()

        await db.flush()
        await db.commit()

        logger.info(f"Updated scheduled job: {job.id} - {job.name}")
        return ScheduledJobRead.model_validate(job)

    async def delete_scheduled_job(
        self,
        job_id: UUID,
        db: AsyncSession,
    ) -> None:
        """Delete a scheduled job.

        Args:
            job_id: Job ID
            db: Database session

        Raises:
            HTTPException: If job not found or is system job
        """
        # Get job with task function
        result = await db.execute(
            select(ScheduledJob)
            .join(TaskFunction)
            .where(ScheduledJob.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scheduled job {job_id} not found",
            )

        # Check if system job (via task_function)
        if job.task_function.is_system:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete system jobs",
            )

        await db.execute(
            delete(ScheduledJob).where(ScheduledJob.id == job_id)
        )
        await db.commit()

        logger.info(f"Deleted scheduled job: {job_id}")

    async def toggle_job_status(
        self,
        job_id: UUID,
        is_enabled: bool,
        db: AsyncSession,
        updated_by: Optional[UUID] = None,
    ) -> ScheduledJobRead:
        """Enable or disable a scheduled job.

        Args:
            job_id: Job ID
            is_enabled: New enabled status
            db: Database session
            updated_by: User ID who made the change

        Returns:
            Updated scheduled job

        Raises:
            HTTPException: If job not found
        """
        result = await db.execute(
            select(ScheduledJob).where(ScheduledJob.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scheduled job {job_id} not found",
            )

        job.is_enabled = is_enabled
        job.updated_by = updated_by
        job.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(job)

        logger.info(f"{'Enabled' if is_enabled else 'Disabled'} scheduled job: {job_id}")
        return ScheduledJobRead.model_validate(job)

    async def trigger_job_manually(
        self,
        job_id: UUID,
        db: AsyncSession,
        triggered_by_user_id: Optional[UUID] = None,
    ) -> ScheduledJobTrigger:
        """Manually trigger a job execution.

        Creates an execution record with status='pending', dispatches to Celery,
        and returns immediately. The frontend uses SWR auto-polling to track
        status changes as the job executes.

        Args:
            job_id: Job ID
            db: Database session
            triggered_by_user_id: User who triggered the job

        Returns:
            ScheduledJobTrigger with execution details and pending status

        Raises:
            HTTPException: If job not found or not enabled
        """
        # Get job
        result = await db.execute(
            select(ScheduledJob).where(ScheduledJob.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scheduled job {job_id} not found",
            )

        if not job.is_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job {job_id} is not enabled",
            )

        # Create execution record
        execution = ScheduledJobExecution(
            job_id=job_id,
            status="pending",
            triggered_by="manual",
            triggered_by_user_id=triggered_by_user_id,
        )

        db.add(execution)
        await db.commit()
        await db.refresh(execution)

        # Update job's last_status to pending immediately
        await db.execute(
            update(ScheduledJob)
            .where(ScheduledJob.id == job_id)
            .values(last_status="pending")
        )
        await db.commit()

        # Refresh job to get updated status
        await db.refresh(job)

        # Get current leader instance for scheduler_instance_id
        leader_result = await db.execute(
            select(SchedulerInstance).where(SchedulerInstance.is_leader)
        )
        leader = leader_result.scalar_one_or_none()
        if leader:
            execution.scheduler_instance_id = leader.id
            await db.commit()

        # Import here to avoid circular import
        from tasks.scheduler_tasks import execute_scheduled_job

        # Dispatch to Celery
        celery_task = execute_scheduled_job.apply_async(
            args=[str(job_id), str(execution.id), "manual"],
            queue=job.task_function.queue or "celery",
        )

        # Update execution with Celery task ID
        execution.celery_task_id = celery_task.id
        await db.commit()

        logger.info(f"Manually triggered job: {job_id}, execution: {execution.id}")

        # Return immediately with pending status
        # SWR auto-polling will pick up status changes as the job runs
        return ScheduledJobTrigger(
            job_id=job_id,
            execution_id=execution.id,
            celery_task_id=celery_task.id,
            message="Job triggered successfully",
            execution=ScheduledJobExecutionRead.model_validate(execution),
            job=ScheduledJobRead.model_validate(job),
        )

    # ==========================================================================
    # Executions
    # ==========================================================================

    async def list_job_executions(
        self,
        db: AsyncSession,
        job_id: Optional[UUID] = None,
        status: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> ScheduledJobExecutionListResponse:
        """List execution history.

        Args:
            db: Database session
            job_id: Filter by job ID
            status: Filter by status
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            ScheduledJobExecutionListResponse with executions
        """
        query = select(ScheduledJobExecution)

        if job_id:
            query = query.where(ScheduledJobExecution.job_id == job_id)
        if status:
            query = query.where(ScheduledJobExecution.status == status)

        # Get total count
        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Get paginated results
        query = query.order_by(ScheduledJobExecution.started_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await db.execute(query)
        executions = result.scalars().all()

        return ScheduledJobExecutionListResponse(
            executions=[ScheduledJobExecutionRead.model_validate(e) for e in executions],
            total=total,
        )

    # ==========================================================================
    # Scheduler Status and Instance Management
    # ==========================================================================

    async def get_scheduler_status(
        self,
        db: AsyncSession,
    ) -> SchedulerStatusResponse:
        """Get overall scheduler status.

        Args:
            db: Database session

        Returns:
            SchedulerStatusResponse with current status
        """
        # Check if scheduler is running (has any instances)
        result = await db.execute(
            select(func.count()).select_from(SchedulerInstance)
        )
        is_running = result.scalar() > 0

        # Get leader instance
        leader_result = await db.execute(
            select(SchedulerInstance)
            .where(SchedulerInstance.is_leader)
        )
        leader = leader_result.scalar_one_or_none()
        leader_instance = SchedulerInstanceRead.model_validate(leader) if leader else None

        # Get job counts
        total_result = await db.execute(
            select(func.count()).select_from(ScheduledJob)
        )
        total_jobs = total_result.scalar() or 0

        enabled_result = await db.execute(
            select(func.count()).where(ScheduledJob.is_enabled)
        )
        enabled_jobs = enabled_result.scalar() or 0

        running_result = await db.execute(
            select(func.count()).where(ScheduledJob.last_status == "running")
        )
        running_jobs = running_result.scalar() or 0

        # Get next scheduled job
        next_result = await db.execute(
            select(ScheduledJob)
            .where(
                and_(
                    ScheduledJob.is_enabled,
                    ScheduledJob.next_run_time.isnot(None),
                )
            )
            .order_by(ScheduledJob.next_run_time.asc())
            .limit(1)
        )
        next_job = next_result.scalar_one_or_none()
        next_scheduled_job = ScheduledJobRead.model_validate(next_job) if next_job else None

        # Get all instances
        instances_result = await db.execute(
            select(SchedulerInstance).order_by(SchedulerInstance.started_at.desc())
        )
        instances = instances_result.scalars().all()

        return SchedulerStatusResponse(
            is_running=is_running,
            leader_instance=leader_instance,
            total_jobs=total_jobs,
            enabled_jobs=enabled_jobs,
            running_jobs=running_jobs,
            next_scheduled_job=next_scheduled_job,
            instances=[SchedulerInstanceRead.model_validate(i) for i in instances],
        )

    async def register_scheduler_instance(
        self,
        db: AsyncSession,
    ) -> UUID:
        """Register this scheduler instance.

        Args:
            db: Database session

        Returns:
            Instance ID
        """
        import os

        instance = SchedulerInstance(
            hostname=socket.gethostname(),
            pid=os.getpid(),
            version=self.version,
        )

        db.add(instance)
        await db.commit()
        await db.refresh(instance)

        logger.info(f"Registered scheduler instance: {instance.id} on {instance.hostname}")
        return instance.id

    async def acquire_leader_lock(
        self,
        db: AsyncSession,
        instance_id: UUID,
    ) -> bool:
        """Try to acquire leader lock.

        Args:
            db: Database session
            instance_id: This instance's ID

        Returns:
            True if lock acquired, False otherwise
        """
        # Check for active leader
        result = await db.execute(
            select(SchedulerInstance).where(
                and_(
                    SchedulerInstance.is_leader,
                    SchedulerInstance.last_heartbeat
                    > datetime.utcnow() - timedelta(minutes=2),
                )
            )
        )
        current_leader = result.scalar_one_or_none()

        if current_leader and current_leader.id != instance_id:
            return False

        # Acquire lock
        await db.execute(
            update(SchedulerInstance)
            .where(SchedulerInstance.id == instance_id)
            .values(
                is_leader=True,
                leader_since=datetime.utcnow(),
                last_heartbeat=datetime.utcnow(),
            )
        )

        # Clear leader flag from other instances
        await db.execute(
            update(SchedulerInstance)
            .where(
                and_(
                    SchedulerInstance.id != instance_id,
                    SchedulerInstance.is_leader,
                )
            )
            .values(is_leader=False, leader_since=None)
        )

        await db.commit()

        logger.debug(f"Instance {instance_id} acquired leader lock")
        return True

    async def update_instance_heartbeat(
        self,
        db: AsyncSession,
        instance_id: UUID,
    ) -> None:
        """Update instance heartbeat.

        Args:
            db: Database session
            instance_id: This instance's ID
        """
        await db.execute(
            update(SchedulerInstance)
            .where(SchedulerInstance.id == instance_id)
            .values(last_heartbeat=datetime.utcnow())
        )
        await db.commit()

    async def cleanup_stale_instances(
        self,
        db: AsyncSession,
        heartbeat_timeout_minutes: int = 2,
    ) -> int:
        """Remove stale scheduler instances.

        Args:
            db: Database session
            heartbeat_timeout_minutes: Minutes before instance considered stale

        Returns:
            Number of instances removed
        """
        timeout = datetime.utcnow() - timedelta(minutes=heartbeat_timeout_minutes)

        # First, resign leadership from stale instances
        await db.execute(
            update(SchedulerInstance)
            .where(
                and_(
                    SchedulerInstance.last_heartbeat < timeout,
                    SchedulerInstance.is_leader,
                )
            )
            .values(is_leader=False, leader_since=None)
        )

        # Then delete stale instances
        result = await db.execute(
            delete(SchedulerInstance).where(
                SchedulerInstance.last_heartbeat < timeout
            )
        )

        await db.commit()
        count = result.rowcount

        if count > 0:
            logger.info(f"Cleaned up {count} stale scheduler instances")

        return count

    # ==========================================================================
    # Execution Recording (called by Celery tasks)
    # ==========================================================================

    async def record_execution_start(
        self,
        db: AsyncSession,
        execution_id: UUID,
        celery_task_id: str,
    ) -> None:
        """Mark execution as running.

        IMPORTANT: This method does NOT commit. The caller is responsible
        for transaction management. This prevents nested session issues when
        called from scheduler tasks.

        Args:
            db: Database session
            execution_id: Execution ID
            celery_task_id: Celery task ID
        """
        # Get execution to find the job_id
        result_exec = await db.execute(
            select(ScheduledJobExecution)
            .where(ScheduledJobExecution.id == execution_id)
        )
        execution = result_exec.scalar_one_or_none()

        if not execution:
            logger.warning(f"Execution {execution_id} not found for start")
            return

        # Update execution status to running
        await db.execute(
            update(ScheduledJobExecution)
            .where(ScheduledJobExecution.id == execution_id)
            .values(
                status="running",
                celery_task_id=celery_task_id,
            )
        )

        # Update job's last_status to running
        await db.execute(
            update(ScheduledJob)
            .where(ScheduledJob.id == execution.job_id)
            .values(last_status="running")
        )

        # Use flush() for immediate visibility without committing
        # This allows the caller to manage the transaction boundary
        await db.flush()
        logger.info(f"Marked execution {execution_id} and job {execution.job_id} as running")

    async def record_execution_complete(
        self,
        db: AsyncSession,
        execution_id: UUID,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
        error_traceback: Optional[str] = None,
    ) -> None:
        """Mark execution as complete.

        IMPORTANT: This method does NOT commit. The caller is responsible
        for transaction management. This prevents nested session issues when
        called from scheduler tasks.

        Args:
            db: Database session
            execution_id: Execution ID
            status: Final status (success, failed, timeout)
            result: Execution result
            error_message: Error message if failed
            error_traceback: Full traceback if failed
        """
        # Get execution
        result_exec = await db.execute(
            select(ScheduledJobExecution)
            .where(ScheduledJobExecution.id == execution_id)
        )
        execution = result_exec.scalar_one_or_none()

        if not execution:
            logger.warning(f"Execution {execution_id} not found for completion")
            return

        # Calculate duration
        completed_at = datetime.utcnow()
        duration = None
        if execution.started_at:
            duration = (completed_at - execution.started_at).total_seconds()

        # Update execution
        await db.execute(
            update(ScheduledJobExecution)
            .where(ScheduledJobExecution.id == execution_id)
            .values(
                status=status,
                completed_at=completed_at,
                duration_seconds=duration,
                result=result,
                error_message=error_message,
                error_traceback=error_traceback,
            )
        )

        # Update job
        await db.execute(
            update(ScheduledJob)
            .where(ScheduledJob.id == execution.job_id)
            .values(
                last_run_time=completed_at,
                last_status=status,
            )
        )

        # Use flush() for immediate visibility without committing
        # This allows the caller to manage the transaction boundary
        await db.flush()

        logger.info(
            f"Recorded execution completion: execution={execution_id}, job={execution.job_id}, "
            f"status={status}, duration={duration}s"
        )

    async def cleanup_old_executions(
        self,
        db: AsyncSession,
        retention_days: int = 90,
    ) -> dict:
        """
        Cleanup old scheduler job execution records.

        Deletes execution records older than the retention period to prevent
        the database from growing indefinitely.

        Args:
            db: Database session
            retention_days: Number of days to retain execution records (default: 90)

        Returns:
            dict: Cleanup statistics with keys:
                - executions_deleted: Number of old execution records deleted
                - cutoff_date: ISO timestamp of cutoff date used
                - timestamp: UTC timestamp of cleanup operation
        """
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        # Delete old execution records
        result = await db.execute(
            delete(ScheduledJobExecution).where(
                ScheduledJobExecution.completed_at < cutoff_date
            )
        )

        await db.commit()
        count = result.rowcount

        logger.info(
            f"Cleaned up {count} old scheduler job execution records "
            f"(retention: {retention_days} days, cutoff: {cutoff_date.isoformat()})"
        )

        return {
            "executions_deleted": count,
            "cutoff_date": cutoff_date.isoformat(),
            "timestamp": datetime.utcnow().isoformat(),
        }

    async def timeout_stale_executions(
        self,
        db: AsyncSession,
        timeout_minutes: int = 5,
    ) -> dict:
        """
        Mark stale job executions as timed out based on job-level timeout settings.

        Uses each job's configured timeout_seconds (default 300 seconds = 5 minutes).
        Finds executions stuck in 'pending' or 'running' status for longer than
        their job's timeout period and marks them as 'timeout'. This can happen due to:
        - Server crashes during execution
        - Celery worker failures
        - Network issues preventing completion status updates

        Uses SKIP LOCKED to handle concurrent access gracefully.

        Args:
            db: Database session
            timeout_minutes: Default minutes before an execution is considered stale (default: 5)
                            This is used as fallback when job.timeout_seconds is None

        Returns:
            dict: Timeout statistics with keys:
                - executions_timed_out: Number of executions marked as timed out
                - timestamp: UTC timestamp of cleanup operation
        """
        # Set a short statement timeout to avoid hanging
        await db.execute(text("SET local statement_timeout = '5s'"))

        # Use raw SQL with SKIP LOCKED to avoid being blocked by other transactions
        result = await db.execute(text("""
            SELECT e.id, e.job_id, e.started_at, COALESCE(j.timeout_seconds, 300) as timeout_seconds
            FROM scheduled_job_executions e
            JOIN scheduled_jobs j ON e.job_id = j.id
            WHERE e.status IN ('pending', 'running')
            FOR UPDATE SKIP LOCKED
        """))
        executions_to_check = result.all()

        timed_out_executions = []
        timed_out_job_ids = set()

        for row in executions_to_check:
            execution_id = row[0]
            job_id = row[1]
            started_at = row[2]
            job_timeout_seconds = row[3]

            # Calculate timeout cutoff
            timeout_cutoff = started_at + timedelta(seconds=job_timeout_seconds)

            if datetime.utcnow() > timeout_cutoff:
                timed_out_executions.append(execution_id)
                timed_out_job_ids.add(job_id)

        # Update timed out executions
        if timed_out_executions:
            await db.execute(
                update(ScheduledJobExecution)
                .where(ScheduledJobExecution.id.in_(timed_out_executions))
                .values(
                    status="timeout",
                    completed_at=datetime.utcnow(),
                    error_message="Execution timed out (exceeded job's timeout_seconds)",
                )
            )

        await db.commit()
        count = len(timed_out_executions)

        # Update job statuses - update both last_run_time and last_status
        if timed_out_executions:
            # Get the completion time for updating last_run_time
            completion_time = datetime.utcnow()
            await db.execute(
                update(ScheduledJob)
                .where(ScheduledJob.id.in_(timed_out_job_ids))
                .values(
                    last_run_time=completion_time,
                    last_status="timeout"
                )
            )
            await db.commit()

        logger.info(
            f"Timed out {count} stale scheduler job execution records "
            f"(default timeout: {timeout_minutes} minutes)"
        )

        return {
            "executions_timed_out": count,
        }


# Singleton instance
scheduler_service = SchedulerService()
