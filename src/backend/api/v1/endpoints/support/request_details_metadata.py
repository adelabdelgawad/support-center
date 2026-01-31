"""
Request Details Metadata endpoint.

Provides a consolidated metadata fetch for the request details page,
combining multiple metadata sources into a single API call for performance.

Key Features:
- Single call replaces 4 separate API calls
- Returns all dropdown options and reference data
- Filtered to active items only
- Includes category-subcategory hierarchy

Metadata Included:
- Priorities: All active priority levels
- Statuses: All active request statuses
- Technicians: All active technician users
- Categories: All active categories with subcategories

Performance Optimization:
This endpoint consolidates data that would otherwise require 4 separate
API calls, reducing round-trips and improving page load time.

Endpoint:
- GET / - Get all request details metadata

Response:
{
  "priorities": [...],
  "statuses": [...],
  "technicians": [...],
  "categories": [
    {
      "id": 1,
      "name": "Hardware",
      "subcategories": [...]
    },
    ...
  ]
}

Authentication:
- Requires authentication

Use Case:
Request details page needs to populate multiple dropdowns and autocomplete
fields. This single call fetches all required metadata in one request.

Note:
Categories include their subcategories as nested data to avoid a separate
subcategory lookup call.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, get_session
from db import User
from api.schemas.request_details_metadata import RequestDetailsMetadataResponse
from api.services.request_details_metadata_service import RequestDetailsMetadataService

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
