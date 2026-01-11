"""
Root endpoint handler.
"""

from fastapi import APIRouter

from core.config import settings

router = APIRouter()


@router.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.api.app_name,
        "version": settings.api.app_version,
        "status": "operational",
    }
