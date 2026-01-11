"""
Health check endpoint handler.
"""

from fastapi import APIRouter

from core.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring.
    Checks MinIO connectivity and bucket access.
    """
    health_status = {
        "status": "healthy",
        "services": {}
    }

    # Check MinIO health
    try:
        from services.minio_service import MinIOStorageService

        minio_healthy = await MinIOStorageService.health_check()
        health_status["services"]["minio"] = {
            "status": "healthy" if minio_healthy else "unhealthy",
            "bucket": settings.minio.bucket_name,
            "endpoint": settings.minio.endpoint,
        }
    except Exception as e:
        health_status["services"]["minio"] = {
            "status": "unhealthy",
            "error": str(e),
        }
        health_status["status"] = "degraded"

    return health_status
