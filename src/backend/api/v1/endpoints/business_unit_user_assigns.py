"""
Business Unit User Assignment API endpoints.
Manages assignment of technicians to business units.
"""
from typing import List, Optional
from uuid import UUID

from core.database import get_session
from core.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from models import User
from schemas.business_unit_user_assign import (
    BusinessUnitUserAssignCreate,
    BusinessUnitUserAssignListResponse,
    BusinessUnitUserAssignRead,
    BusinessUnitUserAssignUpdate,
    BulkAssignUsersRequest,
    BulkRemoveUsersRequest,
)
from services.business_unit_user_assign_service import (
    BusinessUnitUserAssignService,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("", response_model=BusinessUnitUserAssignRead, status_code=201)
async def create_assignment(
    assignment_data: BusinessUnitUserAssignCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new business unit user assignment (admin only).

    - **user_id**: User UUID to assign
    - **business_unit_id**: Business unit ID
    """
    try:
        assignment = await BusinessUnitUserAssignService.create_assignment(
            db=db, assignment_data=assignment_data, created_by=current_user.id
        )
        return assignment
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=BusinessUnitUserAssignListResponse)
async def list_assignments(
    user_id: Optional[UUID] = Query(None, description="Filter by user ID"),
    business_unit_id: Optional[int] = Query(
        None, description="Filter by business unit ID"
    ),
    is_active: Optional[str] = Query(
        None, description="Filter by active status"
    ),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """
    List business unit user assignments with filtering and pagination.

    - **user_id**: Filter by user ID
    - **business_unit_id**: Filter by business unit ID
    - **is_active**: Filter by active status (true/false)
    """
    # Convert is_active string to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    (
        assignments,
        total,
        active_count,
        inactive_count,
    ) = await BusinessUnitUserAssignService.list_assignments(
        db=db,
        user_id=user_id,
        business_unit_id=business_unit_id,
        is_active=is_active_bool,
        page=page,
        per_page=per_page,
    )

    return BusinessUnitUserAssignListResponse(
        assignments=assignments,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
    )


@router.get("/counts")
async def get_assignment_counts(db: AsyncSession = Depends(get_session)):
    """Get assignment count statistics."""
    (
        _,
        total,
        active_count,
        inactive_count,
    ) = await BusinessUnitUserAssignService.list_assignments(
        db=db, page=1, per_page=1
    )

    return {
        "total": total,
        "active_count": active_count,
        "inactive_count": inactive_count,
    }


@router.get("/{assignment_id}", response_model=BusinessUnitUserAssignRead)
async def get_assignment(
    assignment_id: int, db: AsyncSession = Depends(get_session)
):
    """Get a business unit user assignment by ID."""
    assignment = await BusinessUnitUserAssignService.get_assignment(
        db=db, assignment_id=assignment_id
    )

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return assignment


@router.put("/{assignment_id}", response_model=BusinessUnitUserAssignRead)
async def update_assignment(
    assignment_id: int,
    update_data: BusinessUnitUserAssignUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a business unit user assignment (admin only)."""
    assignment = await BusinessUnitUserAssignService.update_assignment(
        db=db,
        assignment_id=assignment_id,
        update_data=update_data,
        updated_by=current_user.id,
    )

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return assignment


@router.put("/{assignment_id}/status", response_model=BusinessUnitUserAssignRead)
async def toggle_assignment_status(
    assignment_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Toggle assignment active/inactive status."""
    assignment = await BusinessUnitUserAssignService.get_assignment(
        db=db, assignment_id=assignment_id
    )

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = await BusinessUnitUserAssignService.toggle_assignment_status(
        db=db, assignment_id=assignment_id, updated_by=current_user.id
    )

    return assignment


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a business unit user assignment (soft delete)."""
    success = await BusinessUnitUserAssignService.delete_assignment(
        db=db, assignment_id=assignment_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return Response(status_code=204)


@router.get("/user/{user_id}/business-units")
async def get_user_business_units(
    user_id: UUID,
    is_active: bool = Query(True, description="Filter by active assignments"),
    db: AsyncSession = Depends(get_session),
):
    """Get all business units assigned to a user."""
    business_units = await BusinessUnitUserAssignService.get_user_business_units(
        db=db, user_id=user_id, is_active=is_active
    )

    return {"business_units": business_units}


@router.get("/business-unit/{business_unit_id}/users")
async def get_business_unit_users(
    business_unit_id: int,
    is_active: bool = Query(True, description="Filter by active assignments"),
    db: AsyncSession = Depends(get_session),
):
    """Get all users assigned to a business unit."""
    users = await BusinessUnitUserAssignService.get_business_unit_users(
        db=db, business_unit_id=business_unit_id, is_active=is_active
    )

    return {"users": users}


@router.post("/bulk-assign", status_code=201)
async def bulk_assign_users(
    request_data: BulkAssignUsersRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk assign multiple users to a business unit.

    - **user_ids**: List of user UUIDs to assign
    - **business_unit_id**: Business unit ID
    """
    try:
        assignments = await BusinessUnitUserAssignService.bulk_assign_users(
            db=db,
            user_ids=request_data.user_ids,
            business_unit_id=request_data.business_unit_id,
            created_by=current_user.id,
        )

        return {
            "message": f"Successfully assigned {len(assignments)} users",
            "assignments": assignments,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-remove", status_code=200)
async def bulk_remove_users(
    request_data: BulkRemoveUsersRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk remove multiple users from a business unit.

    - **user_ids**: List of user UUIDs to remove
    - **business_unit_id**: Business unit ID
    """
    try:
        count = await BusinessUnitUserAssignService.bulk_remove_users(
            db=db,
            user_ids=request_data.user_ids,
            business_unit_id=request_data.business_unit_id,
        )

        return {
            "message": f"Successfully removed {count} users",
            "count": count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
