"""
Internal API endpoints for the Deployment Control Plane.

These endpoints are used by the Rust deployment worker to:
- Claim queued jobs
- Report job results
- Get credential vault references

SECURITY: All endpoints require worker token authentication via X-Worker-Token header.
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import require_worker_token
from schemas.credential import CredentialVaultRef
from schemas.deployment_job import DeploymentJobRead, DeploymentJobResult
from services.credential_service import CredentialService
from services.deployment_job_service import DeploymentJobService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/deployment-jobs/next", response_model=Optional[DeploymentJobRead])
async def claim_next_job(
    worker_id: str,
    db: AsyncSession = Depends(get_session),
    _: bool = Depends(require_worker_token),
):
    """
    Claim the next queued deployment job.

    Atomically selects one queued job, sets status to in_progress,
    and assigns it to the worker.

    Args:
        worker_id: Unique worker identifier

    Returns:
        Claimed job or 204 No Content if no jobs available
    """
    job = await DeploymentJobService.claim_next_job(
        db=db,
        worker_id=worker_id,
    )

    if not job:
        return Response(status_code=204)

    logger.info(f"Worker {worker_id} claimed job {job.id}")

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


@router.post("/deployment-jobs/{job_id}/result", response_model=DeploymentJobRead)
async def report_job_result(
    job_id: UUID,
    result_data: DeploymentJobResult,
    db: AsyncSession = Depends(get_session),
    _: bool = Depends(require_worker_token),
):
    """
    Report deployment job result.

    Updates job status and per-target results. Also updates device
    lifecycle states based on success/failure.

    Args:
        job_id: Job UUID
        result_data: Job result data

    Returns:
        Updated job

    Raises:
        404: Job not found
        400: Job not in valid state for result reporting
    """
    try:
        job = await DeploymentJobService.report_job_result(
            db=db,
            job_id=job_id,
            result_data=result_data,
        )

        if not job:
            raise HTTPException(status_code=404, detail="Deployment job not found")

        logger.info(f"Job {job_id} completed with status {result_data.status}")

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

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/credentials/{credential_id}/vault-ref", response_model=CredentialVaultRef)
async def get_credential_vault_ref(
    credential_id: UUID,
    db: AsyncSession = Depends(get_session),
    _: bool = Depends(require_worker_token),
):
    """
    Get credential vault reference.

    Returns the opaque vault reference that the worker uses to
    retrieve actual secrets from the vault.

    SECURITY: This endpoint only returns the vault reference, never
    the actual secrets. The worker must use this reference to query
    the vault directly.

    Args:
        credential_id: Credential UUID

    Returns:
        Vault reference

    Raises:
        404: Credential not found or disabled
    """
    vault_ref = await CredentialService.get_vault_ref(
        db=db,
        credential_id=credential_id,
    )

    if vault_ref is None:
        raise HTTPException(
            status_code=404,
            detail="Credential not found or disabled",
        )

    return CredentialVaultRef(vault_ref=vault_ref)
