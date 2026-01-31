"""
Request Status API endpoints.

Provides CRUD operations for request status definitions.
Statuses define the lifecycle states of service requests (e.g., "Open", "In Progress", "Resolved").

Key Features:
- Multi-language support (name_en, name_ar)
- Readonly protection for core system statuses
- Active/inactive toggle for soft delete
- Count as solved flag for SLA calculations
- Bulk operations for status management

Endpoints:
- POST / - Create a new request status (admin only)
- GET / - List all request statuses with filtering and pagination
- GET /counts - Get status count statistics
- GET /{status_id} - Get a specific status by ID
- PUT /{status_id} - Update a status (admin only)
- PUT /{status_id}/status - Toggle status active/inactive
- POST /bulk-status - Bulk update statuses
- DELETE /{status_id} - Delete a status (soft delete, admin only)

Authentication:
- All endpoints require authentication
- Write operations (POST, PUT, DELETE) require admin role
"""
from typing import List, Optional

from db.database import get_session
from core.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from db import User
from api.schemas.request_status import (RequestStatusCreate, RequestStatusListResponse,
                                    BulkRequestStatusUpdate, RequestStatusRead,
                                    RequestStatusUpdate)
from api.services.request_status_service import RequestStatusService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("", response_model=RequestStatusRead, status_code=201)
async def create_request_status(
    status_data: RequestStatusCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new request status (admin only).

    - **name**: Status name
    - **description**: Optional description
    - **color**: Optional hex color code (e.g., #FF5733)
    - **readonly**: Whether this status is read-only (cannot be edited/deleted)
    - **is_active**: Whether this status is active
    - **count_as_solved**: Whether requests with this status count as solved
    """
    try:
        status = await RequestStatusService.create_request_status(
            db=db,
            status_data=status_data,
            created_by=current_user.id
        )
        return status
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=RequestStatusListResponse)
async def list_request_statuses(
    name: Optional[str] = Query(None, description="Filter by name"),
    is_active: Optional[str] = Query(None, description="Filter by active status"),
    readonly: Optional[str] = Query(None, description="Filter by readonly status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List request statuses with filtering and pagination.

    - **name**: Filter by name (partial match)
    - **is_active**: Filter by active status (true/false)
    - **readonly**: Filter by readonly status (true/false)
    """
    # Convert is_active string to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    # Convert readonly string to boolean
    readonly_bool = None
    if readonly is not None:
        readonly_bool = readonly.lower() == "true"

    statuses, total, active_count, inactive_count, readonly_count = await RequestStatusService.list_request_statuses(
        db=db,
        name=name,
        is_active=is_active_bool,
        readonly=readonly_bool,
        page=page,
        per_page=per_page,
    )

    return RequestStatusListResponse(
        statuses=statuses,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
        readonly_count=readonly_count,
    )


@router.get("/counts")
async def get_request_status_counts(db: AsyncSession = Depends(get_session)):
    """Get request status count statistics."""
    _, total, active_count, inactive_count, readonly_count = await RequestStatusService.list_request_statuses(
        db=db, page=1, per_page=1
    )

    return {
        "total": total,
        "active_count": active_count,
        "inactive_count": inactive_count,
        "readonly_count": readonly_count,
    }


@router.get("/{status_id}", response_model=RequestStatusRead)
async def get_request_status(
    status_id: int,
    db: AsyncSession = Depends(get_session)
):
    """Get a request status by ID."""
    status = await RequestStatusService.get_request_status(
        db=db,
        status_id=status_id
    )

    if not status:
        raise HTTPException(status_code=404, detail="Request status not found")

    return status


@router.put("/{status_id}", response_model=RequestStatusRead)
async def update_request_status(
    status_id: int,
    update_data: RequestStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update a request status (admin only).

    For readonly statuses, only switches (isActive, countAsSolved, visibleOnRequesterPage)
    can be updated. Text fields (name, description, color) cannot be modified.
    """
    status = await RequestStatusService.get_request_status(
        db=db,
        status_id=status_id
    )

    if not status:
        raise HTTPException(status_code=404, detail="Request status not found")

    # For readonly statuses, check if trying to update restricted fields
    if status.readonly:
        # Check if any text fields are being updated
        if (update_data.name is not None or
            update_data.name_en is not None or
            update_data.name_ar is not None or
            update_data.description is not None or
            update_data.color is not None or
            update_data.readonly is not None):
            raise HTTPException(
                status_code=403,
                detail="Cannot modify name, description, or color of a readonly status. Only switches can be toggled."
            )

    status = await RequestStatusService.update_request_status(
        db=db,
        status_id=status_id,
        update_data=update_data,
        updated_by=current_user.id,
    )

    if not status:
        raise HTTPException(status_code=404, detail="Request status not found")

    return status


@router.put("/{status_id}/status", response_model=RequestStatusRead)
async def toggle_request_status_status(
    status_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle request status active/inactive.

    This can be done for both readonly and non-readonly statuses.
    """
    status = await RequestStatusService.get_request_status(
        db=db,
        status_id=status_id
    )

    if not status:
        raise HTTPException(status_code=404, detail="Request status not found")

    status = await RequestStatusService.toggle_request_status_status(
        db=db,
        status_id=status_id,
        updated_by=current_user.id,
    )

    if not status:
        raise HTTPException(status_code=404, detail="Request status not found")

    return status


@router.post("/bulk-status", response_model=List[RequestStatusRead])
async def bulk_update_request_statuses_status(
    update_data: BulkRequestStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Bulk update request statuses active/inactive."""
    if not update_data.status_ids:
        raise HTTPException(status_code=400, detail="No status IDs provided")

    statuses = await RequestStatusService.bulk_update_request_statuses_status(
        db=db,
        status_ids=update_data.status_ids,
        is_active=update_data.is_active,
        updated_by=current_user.id,
    )

    return statuses


@router.delete("/{status_id}", status_code=204)
async def delete_request_status(
    status_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a request status (soft delete)."""
    status = await RequestStatusService.get_request_status(
        db=db,
        status_id=status_id
    )

    if not status:
        raise HTTPException(status_code=404, detail="Request status not found")

    if status.readonly:
        raise HTTPException(status_code=403, detail="Cannot delete a readonly status")

    success = await RequestStatusService.delete_request_status(
        db=db,
        status_id=status_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Request status not found")

    return Response(status_code=204)
