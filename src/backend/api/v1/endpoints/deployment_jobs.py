"""
DeploymentJob API endpoints for the Deployment Control Plane.

Public endpoints for viewing and creating deployment jobs.
"""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user, require_admin
from models import User
from schemas.deployment_job import (
    DeploymentJobCreate,
    DeploymentJobListItem,
    DeploymentJobListResponse,
    DeploymentJobRead,
)
from services.deployment_job_service import DeploymentJobService

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
