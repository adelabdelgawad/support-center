"""
Request Type API endpoints.

Provides CRUD operations for request type definitions.
Request types categorize service requests (e.g., "Hardware", "Software", "Network").

Key Features:
- Multi-language support (name_en, name_ar)
- Active/inactive toggle for soft delete
- Bulk operations for type management
- Force delete option for types in use

Endpoints:
- GET / - List all request types with pagination and filtering
- GET /{request_type_id} - Get a specific type by ID
- POST / - Create a new request type (admin only)
- PUT /{request_type_id} - Update a type (admin only)
- PUT /{request_type_id}/status - Toggle type active status (admin only)
- POST /bulk-status - Bulk update types status (admin only)
- DELETE /{request_type_id} - Delete a type (admin only)

Authentication:
- All endpoints require authentication
- Write operations (POST, PUT, DELETE) require admin role
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import require_admin
from db import User
from api.schemas.request_type import (
    RequestTypeCreate,
    RequestTypeListResponse,
    RequestTypeRead,
    RequestTypeUpdate,
    BulkRequestTypeUpdate,
)
from api.services.request_type_service import RequestTypeService

router = APIRouter()


@router.get("", response_model=RequestTypeListResponse)
async def list_request_types(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    is_active: Optional[str] = Query(None, description="Filter by active status (true/false)"),
    name: Optional[str] = Query(None, description="Filter by name (partial match)"),
    db: AsyncSession = Depends(get_session)
):
    """
    List all request types with pagination and filtering.

    - **page**: Page number (default: 1)
    - **per_page**: Items per page (default: 10, max: 100)
    - **is_active**: Filter by active status (true/false)
    - **name**: Filter by name (partial match)
    """
    # Convert is_active string to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    result = await RequestTypeService.list_request_types(
        db=db,
        page=page,
        per_page=per_page,
        is_active=is_active_bool,
        name=name,
    )
    return result


@router.get("/{request_type_id}", response_model=RequestTypeRead)
async def get_request_type(
    request_type_id: int, db: AsyncSession = Depends(get_session)
):
    """Get a request type by ID."""
    request_type = await RequestTypeService.get_request_type(
        db=db, request_type_id=request_type_id
    )

    if not request_type:
        raise HTTPException(status_code=404, detail="Request type not found")

    return request_type


@router.post("", response_model=RequestTypeRead, status_code=201)
async def create_request_type(
    request_type_data: RequestTypeCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new request type (admin only).

    - **name**: Request type name (required)
    - **description**: Request type description (optional)
    - **is_active**: Whether the request type is active (default: true)
    """
    try:
        request_type = await RequestTypeService.create_request_type(
            db=db, request_type_data=request_type_data
        )
        return request_type
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{request_type_id}", response_model=RequestTypeRead)
async def update_request_type(
    request_type_id: int,
    update_data: RequestTypeUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Update a request type (admin only)."""
    request_type = await RequestTypeService.update_request_type(
        db=db, request_type_id=request_type_id, update_data=update_data
    )

    if not request_type:
        raise HTTPException(status_code=404, detail="Request type not found")

    return request_type


@router.put("/{request_type_id}/status", response_model=RequestTypeRead)
async def toggle_request_type_status(
    request_type_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Toggle a request type's active status (admin only)."""
    request_type = await RequestTypeService.toggle_request_type_status(
        db=db, request_type_id=request_type_id
    )

    if not request_type:
        raise HTTPException(status_code=404, detail="Request type not found")

    return request_type


@router.post("/bulk-status", response_model=List[RequestTypeRead])
async def bulk_update_request_types_status(
    data: BulkRequestTypeUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Bulk update request types status (admin only)."""
    updated = await RequestTypeService.bulk_update_request_type_status(
        db=db, type_ids=data.type_ids, is_active=data.is_active
    )
    return updated


@router.delete("/{request_type_id}", status_code=204)
async def delete_request_type(
    request_type_id: int,
    force: bool = Query(False, description="Force delete even if in use (soft delete)"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete a request type (admin only).

    If the request type is in use, it will be soft deleted (marked as inactive).
    Use force=true to force soft delete.
    """
    success, error = await RequestTypeService.delete_request_type(
        db=db, request_type_id=request_type_id, force=force
    )

    if not success:
        if error == "Request type not found":
            raise HTTPException(status_code=404, detail=error)
        raise HTTPException(status_code=400, detail=error)

    return None
