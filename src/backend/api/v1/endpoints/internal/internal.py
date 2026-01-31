"""
Internal API endpoints for the Deployment Control Plane.

These endpoints are used exclusively by the Rust deployment worker to
coordinate deployment job execution. They are NOT intended for client use.

Worker Responsibilities:
1. Claim queued jobs from the job queue
2. Execute deployment operations on target devices
3. Report results back to the API

Endpoints:
Job Management:
- GET /deployment-jobs/next - Claim the next queued job (atomically)
- POST /deployment-jobs/{job_id}/result - Report job execution result

Credential Access:
- GET /credentials/{credential_id}/vault-ref - Get vault reference for credentials

Security:
- All endpoints require X-Worker-Token header authentication
- Credential endpoint returns opaque vault reference, never actual secrets
- Workers must query the vault separately using the reference

Job Claim Flow:
1. Worker polls GET /deployment-jobs/next with worker_id
2. API atomically selects one queued job and sets status to in_progress
3. Worker receives job with claimed_at timestamp
4. Worker executes deployment
5. Worker reports result via POST /deployment-jobs/{job_id}/result

Result Reporting:
The result payload includes:
- status: completed or failed
- per_target_results: Results for each deployment target
- error_message: Error details if failed

Device State Updates:
Job results automatically update device lifecycle states:
- Success -> Device state set to 'installed'
- Failure -> Device state set to 'install_failed'

Note:
These endpoints are optimized for high-frequency worker polling.
Clients should use the public deployment_jobs endpoints instead.
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import require_worker_token
from api.schemas.credential import CredentialVaultRef
from api.schemas.deployment_job import DeploymentJobRead, DeploymentJobResult
from api.services.credential_service import CredentialService
from api.services.deployment_job_service import DeploymentJobService

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
