"""
Business Unit User Assignment API endpoints.

Manages assignment of users (primarily technicians) to business units.
This enables multi-BU support where technicians can handle requests from
multiple business units based on their assignments.

**Key Features:**
- User-to-BU assignment CRUD operations
- Active/inactive status tracking
- Bulk assignment and removal operations
- Per-user BU listing
- Per-BU user listing
- Count statistics
"""
from typing import Optional
from uuid import UUID

from db.database import get_session
from core.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from db import User
from api.schemas.business_unit_user_assign import (
    BusinessUnitUserAssignCreate,
    BusinessUnitUserAssignListResponse,
    BusinessUnitUserAssignRead,
    BusinessUnitUserAssignUpdate,
    BulkAssignUsersRequest,
    BulkRemoveUsersRequest,
)
from api.services.business_unit_user_assign_service import (
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

    Assigns a user to a business unit, enabling them to handle requests
    from that BU.

    Args:
        assignment_data: Assignment data
            - user_id: User UUID to assign
            - business_unit_id: Business unit ID
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitUserAssignRead: Created assignment

    Raises:
        HTTPException 400: Validation error (duplicate assignment)
        HTTPException 500: Server error

    **Permissions:** Authenticated users
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
    business_unit_id: Optional[int] = Query(None, description="Filter by business unit ID"),
    is_active: Optional[str] = Query(None, description="Filter by active status (true/false)"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_session),
):
    """
    List business unit user assignments with filtering and pagination.

    Args:
        user_id: Optional filter by user ID
        business_unit_id: Optional filter by business unit ID
        is_active: Optional boolean status filter (string "true"/"false")
        page: Page number (1-indexed)
        per_page: Items per page (max 100)
        db: Database session

    Returns:
        BusinessUnitUserAssignListResponse:
            - assignments: List of assignments
            - total: Total assignments
            - active_count: Active assignments
            - inactive_count: Inactive assignments

    **Permissions:** No authentication required
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
    """
    Get assignment count statistics.

    Returns total, active, and inactive counts across all assignments.

    Args:
        db: Database session

    Returns:
        Dict with keys:
            - total: Total assignments
            - active_count: Active assignments
            - inactive_count: Inactive assignments

    **Permissions:** No authentication required
    """
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
    """
    Get a business unit user assignment by ID.

    Args:
        assignment_id: Assignment ID
        db: Database session

    Returns:
        BusinessUnitUserAssignRead: Assignment details

    Raises:
        HTTPException 404: Assignment not found

    **Permissions:** No authentication required
    """
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
    """
    Update a business unit user assignment (admin only).

    All fields are optional. Only provided fields will be updated.

    Args:
        assignment_id: Assignment ID
        update_data: Fields to update (is_active)
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitUserAssignRead: Updated assignment

    Raises:
        HTTPException 404: Assignment not found

    **Permissions:** Authenticated users
    """
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
    """
    Toggle assignment active/inactive status.

    Quickly enables/disables an assignment without full update.

    Args:
        assignment_id: Assignment ID
        db: Database session
        current_user: Authenticated user

    Returns:
        BusinessUnitUserAssignRead: Updated assignment

    Raises:
        HTTPException 404: Assignment not found

    **Permissions:** Authenticated users
    """
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
    """
    Delete a business unit user assignment (soft delete).

    Marks the assignment as deleted without removing it from the database.

    Args:
        assignment_id: Assignment ID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Assignment not found

    **Permissions:** Authenticated users
    """
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
    """
    Get all business units assigned to a user.

    Returns list of business units the user is assigned to.

    Args:
        user_id: User UUID
        is_active: Filter by active assignments (default: true)
        db: Database session

    Returns:
        Dict with key:
            - business_units: List of business units

    **Permissions:** No authentication required
    """
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
    """
    Get all users assigned to a business unit.

    Returns list of users assigned to the specified business unit.

    Args:
        business_unit_id: Business unit ID
        is_active: Filter by active assignments (default: true)
        db: Database session

    Returns:
        Dict with key:
            - users: List of users

    **Permissions:** No authentication required
    """
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

    Efficiently assigns multiple users to a business unit in a single
    transaction. Skips duplicate assignments.

    Args:
        request_data: Bulk assignment data
            - user_ids: List of user UUIDs to assign
            - business_unit_id: Business unit ID
        db: Database session
        current_user: Authenticated user

    Returns:
        Dict with keys:
            - message: Success message
            - assignments: List of created assignments

    Raises:
        HTTPException 500: Server error

    **Permissions:** Authenticated users
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

    Efficiently removes multiple user assignments from a business unit
    in a single transaction (soft delete).

    Args:
        request_data: Bulk removal data
            - user_ids: List of user UUIDs to remove
            - business_unit_id: Business unit ID
        db: Database session
        current_user: Authenticated user

    Returns:
        Dict with keys:
            - message: Success message
            - count: Number of assignments removed

    Raises:
        HTTPException 500: Server error

    **Permissions:** Authenticated users
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
