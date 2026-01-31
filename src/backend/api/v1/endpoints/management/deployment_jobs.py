"""
Deployment Job API endpoints for the Deployment Control Plane.

Manages the lifecycle of deployment jobs used for software deployment
to remote devices (e.g., NetSupport installation).

Job Lifecycle:
1. queued - Job created, waiting for worker
2. in_progress - Job claimed by worker, executing
3. completed - Job finished successfully
4. failed - Job failed with error

Job Types:
- netsupport_install - NetSupport agent installation

Key Features:
- Worker claim pattern (atomic queue dequeue)
- Per-target result tracking
- Device lifecycle state updates
- Background task execution via Rust workers

Endpoints:
- GET / - List deployment jobs with filtering
- GET /count - Get job count with optional filtering
- GET /queued-count - Get count of queued jobs
- GET /{job_id} - Get a job by ID
- POST / - Create a new job (admin only, typically auto-created)

Internal Endpoints (used by Rust workers):
- GET /internal/deployment-jobs/next - Claim next queued job
- POST /internal/deployment-jobs/{job_id}/result - Report job result

Authentication:
- Read endpoints: Require admin role
- Create endpoint: Require admin role
- Internal endpoints: Require worker token authentication

Note:
Most jobs are created automatically by device installation triggers.
Manual job creation via POST / is for advanced use cases only.
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import require_admin
from db import User
from api.schemas.deployment_job import (
    DeploymentJobCreate,
    DeploymentJobListItem,
    DeploymentJobListResponse,
    DeploymentJobRead,
)
from api.services.deployment_job_service import DeploymentJobService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=DeploymentJobListResponse)
async def list_jobs(
    status: Optional[str] = None,
    job_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    List deployment jobs with optional filtering.

    Requires admin role.
    """
    jobs = await DeploymentJobService.list_jobs(
        db=db,
        status=status,
        job_type=job_type,
        limit=limit,
        offset=offset,
    )

    job_list = [
        DeploymentJobListItem(
            id=job.id,
            job_type=job.job_type,
            status=job.status,
            payload=job.payload or {},
            created_at=job.created_at,
            claimed_by=job.claimed_by,
            claimed_at=job.claimed_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
        )
        for job in (jobs or [])
    ]

    return DeploymentJobListResponse(jobs=job_list, total=len(job_list))


@router.get("/count")
async def count_jobs(
    status: Optional[str] = None,
    job_type: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Get job count with optional filtering."""
    count = await DeploymentJobService.count_jobs(
        db=db,
        status=status,
        job_type=job_type,
    )
    return {"count": count}


@router.get("/queued-count")
async def get_queued_count(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Get count of queued jobs waiting for workers."""
    count = await DeploymentJobService.get_queued_count(db=db)
    return {"count": count}


@router.get("/{job_id}", response_model=DeploymentJobRead)
async def get_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Get a deployment job by ID.

    Requires admin role.
    """
    job = await DeploymentJobService.get_job(db=db, job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Deployment job not found")

    return DeploymentJobRead(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        payload=job.payload,
        created_by=job.created_by,
        created_at=job.created_at,
        claimed_by=job.claimed_by,
        claimed_at=job.claimed_at,
        completed_at=job.completed_at,
        result=job.result,
        error_message=job.error_message,
    )


@router.post("", response_model=DeploymentJobRead, status_code=201)
async def create_job(
    job_data: DeploymentJobCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new deployment job manually.

    Normally jobs are created via device install actions, but this
    endpoint allows direct job creation for advanced use cases.

    Requires admin role.
    """
    job = await DeploymentJobService.create_job(
        db=db,
        job_data=job_data,
        created_by=current_user.id,
    )

    return DeploymentJobRead(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        payload=job.payload,
        created_by=job.created_by,
        created_at=job.created_at,
        claimed_by=job.claimed_by,
        claimed_at=job.claimed_at,
        completed_at=job.completed_at,
        result=job.result,
        error_message=job.error_message,
    )
