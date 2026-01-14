"""
Request Details Metadata endpoint for consolidated metadata fetching.

GET /api/v1/request-details-metadata - Returns all metadata for request details page
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, get_session
from models import User
from schemas.request_details_metadata import RequestDetailsMetadataResponse
from services.request_details_metadata_service import RequestDetailsMetadataService

# Module-level logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


@router.get(
    "",
    response_model=RequestDetailsMetadataResponse,
    summary="Get request details metadata",
    description="""
    Fetch all metadata needed for the request details page in a single call.

    Returns:
    - Priorities: All active priorities
    - Statuses: All active request statuses
    - Technicians: All active technicians
    - Categories: All active categories with subcategories

    This endpoint consolidates 4 separate API calls into one for better performance.
    """,
)
async def get_request_details_metadata(
    db: Annotated[AsyncSession, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Get all metadata for request details page.

    Requires authentication.
    """
    try:
        metadata = await RequestDetailsMetadataService.get_request_details_metadata(db)
        return metadata
    except Exception as e:
        logger.error(f"Error fetching request details metadata: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch request details metadata",
        )
