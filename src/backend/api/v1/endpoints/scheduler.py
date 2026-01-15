"""Scheduler API endpoints.

Provides REST API for managing scheduled jobs, task functions,
and scheduler status.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user
from models import User
from schemas.scheduler import (
    ScheduledJobCreate,
    ScheduledJobDetail,
    ScheduledJobListResponse,
    ScheduledJobRead,
    ScheduledJobToggle,
    ScheduledJobTrigger,
    ScheduledJobUpdate,
    SchedulerInstanceRead,
    SchedulerStatusResponse,
    TaskFunctionListResponse,
    SchedulerJobTypeRead,
    ScheduledJobExecutionListResponse,
)
from services.scheduler_service import scheduler_service

router = APIRouter()


# =============================================================================
# Task Functions
# =============================================================================


@router.get("/task-functions", response_model=TaskFunctionListResponse)
async def list_task_functions(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all available task functions that can be scheduled."""
    return await scheduler_service.list_task_functions(
        db=db,
        is_active=is_active,
        page=page,
        per_page=per_page,
    )


# =============================================================================
# Job Types
# =============================================================================


@router.get("/job-types", response_model=list[SchedulerJobTypeRead])
async def list_job_types(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all available job schedule types (interval, cron)."""
    return await scheduler_service.list_job_types(db=db)


# =============================================================================
# Scheduled Jobs
# =============================================================================


@router.get("/jobs", response_model=ScheduledJobListResponse)
async def list_scheduled_jobs(
    response: Response,
    name: Optional[str] = Query(None, description="Filter by job name (partial match)"),
    is_enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    task_function_id: Optional[int] = Query(None, description="Filter by task function"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all scheduled jobs with filtering and pagination."""
    result = await scheduler_service.list_scheduled_jobs(
        db=db,
        name=name,
        is_enabled=is_enabled,
        task_function_id=task_function_id,
        page=page,
        per_page=per_page,
    )

    # Set pagination headers
    response.headers["X-Total-Count"] = str(result.total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(per_page)

    return result


@router.post("/jobs", response_model=ScheduledJobRead, status_code=201)
async def create_scheduled_job(
    job_data: ScheduledJobCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new scheduled job."""
    return await scheduler_service.create_scheduled_job(
        job_data=job_data,
        db=db,
        created_by=current_user.id,
    )


@router.get("/jobs/{job_id}", response_model=ScheduledJobDetail)
async def get_scheduled_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get a single scheduled job with full details including recent executions."""
    return await scheduler_service.get_scheduled_job(job_id=job_id, db=db)


@router.put("/jobs/{job_id}", response_model=ScheduledJobRead)
async def update_scheduled_job(
    job_id: UUID,
    job_data: ScheduledJobUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update an existing scheduled job. All fields are optional."""
    return await scheduler_service.update_scheduled_job(
        job_id=job_id,
        job_data=job_data,
        db=db,
        updated_by=current_user.id,
    )


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_scheduled_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a scheduled job. System jobs cannot be deleted."""
    await scheduler_service.delete_scheduled_job(job_id=job_id, db=db)
    return Response(status_code=204)


# =============================================================================
# Job Actions
# =============================================================================


@router.put("/jobs/{job_id}/status", response_model=ScheduledJobRead)
async def toggle_job_status(
    job_id: UUID,
    toggle_data: ScheduledJobToggle,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Enable or disable a scheduled job."""
    return await scheduler_service.toggle_job_status(
        job_id=job_id,
        is_enabled=toggle_data.is_enabled,
        db=db,
        updated_by=current_user.id,
    )


@router.post("/jobs/{job_id}/trigger", response_model=ScheduledJobTrigger)
async def trigger_job_manually(
    job_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Manually trigger a job execution.

    Creates an execution record with triggered_by='manual'
    and records the user who triggered the job.
    """
    return await scheduler_service.trigger_job_manually(
        job_id=job_id,
        db=db,
        triggered_by_user_id=current_user.id,
    )


# =============================================================================
# Executions
# =============================================================================


@router.get("/executions", response_model=ScheduledJobExecutionListResponse)
async def list_all_executions(
    response: Response,
    job_id: Optional[UUID] = Query(None, description="Filter by job ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get execution history across all jobs with optional filtering."""
    result = await scheduler_service.list_job_executions(
        db=db,
        job_id=job_id,
        status=status,
        page=page,
        per_page=per_page,
    )

    # Set pagination headers
    response.headers["X-Total-Count"] = str(result.total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(per_page)

    return result


@router.get("/jobs/{job_id}/executions", response_model=ScheduledJobExecutionListResponse)
async def list_job_executions(
    job_id: UUID,
    response: Response,
    status: Optional[str] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get execution history for a specific job."""
    result = await scheduler_service.list_job_executions(
        db=db,
        job_id=job_id,
        status=status,
        page=page,
        per_page=per_page,
    )

    # Set pagination headers
    response.headers["X-Total-Count"] = str(result.total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(per_page)

    return result


# =============================================================================
# Scheduler Status
# =============================================================================


@router.get("/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get overall scheduler status including leader instance and job counts.

    Returns:
    - is_running: Whether scheduler is active
    - leader_instance: Current leader instance info
    - total_jobs: Total number of jobs
    - enabled_jobs: Number of enabled jobs
    - running_jobs: Number of currently running jobs
    - next_scheduled_job: Next job to run
    - instances: All scheduler instances
    """
    return await scheduler_service.get_scheduler_status(db=db)
