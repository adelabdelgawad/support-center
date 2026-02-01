"""
Business Unit Region API endpoints.

Provides endpoints for managing business unit regions, which are used to
group business units geographically or organizationally.

**Key Features:**
- Region CRUD operations
- Active/inactive status tracking
- Count statistics (total, active, inactive)
- Bulk status updates
- Soft delete support
"""
from typing import List, Optional

from db.database import get_session
from core.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from db import User
from api.schemas.business_unit_region import (BusinessUnitRegionCreate, BusinessUnitRegionCountsResponse,
                                          BusinessUnitRegionListResponse,
                                          BulkBusinessUnitRegionStatusUpdate, BusinessUnitRegionRead,
                                          BusinessUnitRegionUpdate)
from api.services.business_unit_region_service import BusinessUnitRegionService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("", response_model=BusinessUnitRegionRead, status_code=201)
async def create_business_unit_region(
    region_data: BusinessUnitRegionCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new business unit region (admin only).

    Args:
        region_data: Region creation data
            - name: Region name (must be unique)
            - description: Optional description
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitRegionRead: Created region

    Raises:
        HTTPException 400: Validation error

    **Permissions:** Authenticated users
    """
    try:
        region = await BusinessUnitRegionService.create_business_unit_region(
            db=db,
            region_data=region_data,
            created_by=current_user.id
        )
        return region
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=BusinessUnitRegionListResponse)
async def list_business_unit_regions(
    name: Optional[str] = Query(None, description="Filter by name (partial match)"),
    is_active: Optional[str] = Query(None, description="Filter by active status (true/false)"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_session),
):
    """
    List business unit regions with filtering and pagination.

    Args:
        name: Optional partial name match filter
        is_active: Optional boolean status filter (string "true"/"false")
        page: Page number (1-indexed)
        per_page: Items per page (max 100)
        db: Database session

    Returns:
        BusinessUnitRegionListResponse:
            - regions: List of regions
            - total: Total regions
            - active_count: Active regions
            - inactive_count: Inactive regions

    **Permissions:** No authentication required
    """
    # Convert is_active string to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    result = await BusinessUnitRegionService.list_business_unit_regions(
        db=db,
        name=name,
        is_active=is_active_bool,
        page=page,
        per_page=per_page,
    )

    # Handle None return (error case)
    if result is None:
        regions, total, active_count, inactive_count = [], 0, 0, 0
    else:
        regions, total, active_count, inactive_count = result

    return BusinessUnitRegionListResponse(
        regions=regions,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
    )


@router.get("/counts", response_model=BusinessUnitRegionCountsResponse)
async def get_business_unit_region_counts(db: AsyncSession = Depends(get_session)):
    """
    Get business unit region count statistics.

    Returns total, active, and inactive counts across all regions.

    Args:
        db: Database session

    Returns:
        Dict with keys:
            - total: Total regions
            - active_count: Active regions
            - inactive_count: Inactive regions

    **Permissions:** No authentication required
    """
    result = await BusinessUnitRegionService.list_business_unit_regions(
        db=db, page=1, per_page=1
    )

    # Handle None return (error case)
    if result is None:
        total, active_count, inactive_count = 0, 0, 0
    else:
        _, total, active_count, inactive_count = result

    return {
        "total": total,
        "active_count": active_count,
        "inactive_count": inactive_count,
    }


@router.get("/{region_id}", response_model=BusinessUnitRegionRead)
async def get_business_unit_region(
    region_id: int,
    db: AsyncSession = Depends(get_session)
):
    """
    Get a business unit region by ID.

    Args:
        region_id: Region ID
        db: Database session

    Returns:
        BusinessUnitRegionRead: Region details

    Raises:
        HTTPException 404: Region not found

    **Permissions:** No authentication required
    """
    region = await BusinessUnitRegionService.get_business_unit_region(
        db=db,
        region_id=region_id
    )

    if not region:
        raise HTTPException(status_code=404, detail="Business unit region not found")

    return region


@router.put("/{region_id}", response_model=BusinessUnitRegionRead)
async def update_business_unit_region(
    region_id: int,
    update_data: BusinessUnitRegionUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update a business unit region (admin only).

    All fields are optional. Only provided fields will be updated.

    Args:
        region_id: Region ID
        update_data: Fields to update
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitRegionRead: Updated region

    Raises:
        HTTPException 404: Region not found

    **Permissions:** Authenticated users
    """
    region = await BusinessUnitRegionService.update_business_unit_region(
        db=db,
        region_id=region_id,
        update_data=update_data,
        updated_by=current_user.id,
    )

    if not region:
        raise HTTPException(status_code=404, detail="Business unit region not found")

    return region


@router.put("/{region_id}/status", response_model=BusinessUnitRegionRead)
async def toggle_business_unit_region_status(
    region_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle business unit region active/inactive status.

    Quickly enables/disables a region without full update.

    Args:
        region_id: Region ID
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitRegionRead: Updated region

    Raises:
        HTTPException 404: Region not found

    **Permissions:** Authenticated users
    """
    region = await BusinessUnitRegionService.get_business_unit_region(
        db=db,
        region_id=region_id
    )

    if not region:
        raise HTTPException(status_code=404, detail="Business unit region not found")

    region = await BusinessUnitRegionService.toggle_business_unit_region_status(
        db=db,
        region_id=region_id,
        updated_by=current_user.id,
    )

    if not region:
        raise HTTPException(status_code=404, detail="Business unit region not found")

    return region


@router.post("/bulk-status", response_model=List[BusinessUnitRegionRead])
async def bulk_update_business_unit_regions_status(
    update_data: BulkBusinessUnitRegionStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk update business unit regions active/inactive status.

    Efficiently updates multiple regions to the same status in a single
    transaction.

    Args:
        update_data: Bulk update data
            - region_ids: List of region IDs to update
            - is_active: Target status (true/false)
        db: Database session
        current_user: Authenticated user

    Returns:
        List[BusinessUnitRegionRead]: Updated regions

    Raises:
        HTTPException 400: No region IDs provided

    **Permissions:** Authenticated users
    """
    if not update_data.region_ids:
        raise HTTPException(status_code=400, detail="No region IDs provided")

    regions = await BusinessUnitRegionService.bulk_update_business_unit_regions_status(
        db=db,
        region_ids=update_data.region_ids,
        is_active=update_data.is_active,
        updated_by=current_user.id,
    )

    return regions


@router.delete("/{region_id}", status_code=204)
async def delete_business_unit_region(
    region_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a business unit region (soft delete).

    Marks the region as deleted without removing it from the database.

    Args:
        region_id: Region ID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Region not found

    **Permissions:** Authenticated users
    """
    success = await BusinessUnitRegionService.delete_business_unit_region(
        db=db,
        region_id=region_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Business unit region not found")

    return Response(status_code=204)
