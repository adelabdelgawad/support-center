from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from api.services.internal.health_service import HealthService

router = APIRouter()


@router.get("/health/liveness")
async def liveness_check():
    """
    Liveness health check endpoint.

    Returns 200 if the application is running.
    Used by Kubernetes liveness probes.
    """
    from api.services.internal.health_service import HealthService
    # Create service with dummy session for liveness check
    dummy_session = None
    service = HealthService(dummy_session)

    return await service.get_liveness_status()


@router.get("/health/readiness")
async def readiness_check(session: AsyncSession = Depends(get_session)):
    """
    Readiness health check endpoint.

    Returns 200 if all critical dependencies are ready:
    - Database connection (tested with simple query)
    - Redis connection (if configured)
    """
    try:
        service = HealthService(session)
        return await service.get_readiness_status()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Readiness check failed: {str(e)}"
        )


@router.get("/health/detailed")
async def detailed_health_check(session: AsyncSession = Depends(get_session)):
    """
    Detailed health check endpoint with component status.

    Returns comprehensive health information including:
    - Database pool metrics
    - Redis connection status
    - Service version
    """
    service = HealthService(session)
    return await service.get_detailed_status()


@router.get("/metrics/database")
async def get_database_metrics(session: AsyncSession = Depends(get_session)):
    """Get database connection pool metrics"""
    service = HealthService(session)
    return await service.get_database_metrics()