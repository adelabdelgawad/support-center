"""
Business Unit API endpoints.
"""
from typing import List, Optional

from core.database import get_session
from core.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from models import User
from schemas.business_unit import (BusinessUnitCreate, BusinessUnitListResponse,
                                    BulkBusinessUnitStatusUpdate, BusinessUnitRead,
                                    BusinessUnitUpdate)
from services.business_unit_service import BusinessUnitService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("", response_model=BusinessUnitRead, status_code=201)
async def create_business_unit(
    business_unit_data: BusinessUnitCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new business unit (admin only).

    - **name**: Business unit name (unique)
    - **description**: Optional description
    - **network**: Optional network CIDR (e.g., 10.23.0.0/16)
    - **business_unit_region_id**: Region ID
    """
    try:
        business_unit = await BusinessUnitService.create_business_unit(
            db=db,
            business_unit_data=business_unit_data,
            created_by=current_user.id
        )
        return business_unit
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=BusinessUnitListResponse)
async def list_business_units(
    name: Optional[str] = Query(None, description="Filter by name"),
    is_active: Optional[str] = Query(None, description="Filter by active status"),
    region_id: Optional[int] = Query(None, description="Filter by region ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """
    List business units with filtering and pagination.

    - **name**: Filter by name (partial match)
    - **is_active**: Filter by active status (true/false)
    - **region_id**: Filter by business unit region
    """
    # Convert is_active string to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    result = await BusinessUnitService.list_business_units(
        db=db,
        name=name,
        is_active=is_active_bool,
        region_id=region_id,
        page=page,
        per_page=per_page,
    )

    # Handle None return (error case)
    if result is None:
        business_units, total, active_count, inactive_count = [], 0, 0, 0
    else:
        business_units, total, active_count, inactive_count = result

    return BusinessUnitListResponse(
        business_units=business_units,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
    )


@router.get("/counts")
async def get_business_unit_counts(db: AsyncSession = Depends(get_session)):
    """Get business unit count statistics."""
    result = await BusinessUnitService.list_business_units(
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


@router.get("/{business_unit_id}", response_model=BusinessUnitRead)
async def get_business_unit(
    business_unit_id: int,
    db: AsyncSession = Depends(get_session)
):
    """Get a business unit by ID."""
    business_unit = await BusinessUnitService.get_business_unit(
        db=db,
        business_unit_id=business_unit_id
    )

    if not business_unit:
        raise HTTPException(status_code=404, detail="Business unit not found")

    return business_unit


@router.put("/{business_unit_id}", response_model=BusinessUnitRead)
async def update_business_unit(
    business_unit_id: int,
    update_data: BusinessUnitUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a business unit (admin only)."""
    business_unit = await BusinessUnitService.update_business_unit(
        db=db,
        business_unit_id=business_unit_id,
        update_data=update_data,
        updated_by=current_user.id,
    )

    if not business_unit:
        raise HTTPException(status_code=404, detail="Business unit not found")

    return business_unit


@router.put("/{business_unit_id}/status", response_model=BusinessUnitRead)
async def toggle_business_unit_status(
    business_unit_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Toggle business unit active/inactive status."""
    business_unit = await BusinessUnitService.get_business_unit(
        db=db,
        business_unit_id=business_unit_id
    )

    if not business_unit:
        raise HTTPException(status_code=404, detail="Business unit not found")

    business_unit = await BusinessUnitService.toggle_business_unit_status(
        db=db,
        business_unit_id=business_unit_id,
        updated_by=current_user.id,
    )

    if not business_unit:
        raise HTTPException(status_code=404, detail="Business unit not found")

    return business_unit


@router.patch("/{business_unit_id}/working-hours", response_model=BusinessUnitRead)
async def update_business_unit_working_hours(
    business_unit_id: int,
    update_data: BusinessUnitUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update working hours for a business unit."""
    business_unit = await BusinessUnitService.update_business_unit_working_hours(
        db=db,
        business_unit_id=business_unit_id,
        working_hours=update_data.working_hours,
        updated_by=current_user.id,
    )

    if not business_unit:
        raise HTTPException(status_code=404, detail="Business unit not found")

    return business_unit


@router.post("/bulk-status", response_model=List[BusinessUnitRead])
async def bulk_update_business_units_status(
    update_data: BulkBusinessUnitStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Bulk update business units active/inactive status."""
    if not update_data.business_unit_ids:
        raise HTTPException(status_code=400, detail="No business unit IDs provided")

    business_units = await BusinessUnitService.bulk_update_business_units_status(
        db=db,
        business_unit_ids=update_data.business_unit_ids,
        is_active=update_data.is_active,
        updated_by=current_user.id,
    )

    return business_units


@router.delete("/{business_unit_id}", status_code=204)
async def delete_business_unit(
    business_unit_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a business unit (soft delete)."""
    success = await BusinessUnitService.delete_business_unit(
        db=db,
        business_unit_id=business_unit_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Business unit not found")

    return Response(status_code=204)
