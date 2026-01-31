"""
Priority API endpoints.

Provides endpoints for managing service request priority levels.
Priorities define the urgency and expected response/resolution times for requests.

**Key Features:**
- Priority CRUD operations
- Response time SLA tracking (response_time_minutes)
- Resolution time SLA tracking (resolution_time_hours)
- Active/inactive status tracking
- Redis caching for performance
- Ordered by severity level (implicit)
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import require_admin
from db import User
from api.schemas.priority import (
    PriorityCreate,
    PriorityListItem,
    PriorityRead,
    PriorityUpdate,
)
from api.services.priority_service import PriorityService

router = APIRouter()


@router.get("", response_model=List[PriorityListItem])
async def list_priorities(
    active_only: bool = True, db: AsyncSession = Depends(get_session)
):
    """
    List all priorities.

    Returns priorities ordered by severity level. Results are cached in Redis.

    Args:
        active_only: Only return active priorities (default: true)
        db: Database session

    Returns:
        List[PriorityListItem]: List of priorities

    **Permissions:** No authentication required
    """
    service = PriorityService(db)
    priorities = await service.list_priorities(active_only=active_only)
    return priorities


@router.get("/{priority_id}", response_model=PriorityRead)
async def get_priority(
    priority_id: int, db: AsyncSession = Depends(get_session)
):
    """
    Get a priority by ID.

    Args:
        priority_id: Priority ID
        db: Database session

    Returns:
        PriorityRead: Priority details

    Raises:
        HTTPException 404: Priority not found

    **Permissions:** No authentication required
    """
    service = PriorityService(db)
    priority = await service.get_priority(priority_id=priority_id)

    if not priority:
        raise HTTPException(status_code=404, detail="Priority not found")

    return priority


@router.post("", response_model=PriorityRead, status_code=201)
async def create_priority(
    priority_data: PriorityCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new priority (admin only).

    Priority names typically follow standard severity levels: Critical, High,
    Medium, Low, Lowest. Response and resolution times define SLA expectations.

    Args:
        priority_data: Priority creation data
            - name: Priority name (e.g., "Critical", "High")
            - response_time_minutes: Expected response time in minutes
            - resolution_time_hours: Expected resolution time in hours
            - color: Optional display color
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated admin user

    Returns:
        PriorityRead: Created priority

    Raises:
        HTTPException 400: Validation error

    **Note:** Cache invalidation is handled in priority_service.py via Redis

    **Permissions:** Admin only
    """
    try:
        service = PriorityService(db)
        priority = await service.create_priority(priority_data=priority_data)
        return priority
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{priority_id}", response_model=PriorityRead)
async def update_priority(
    priority_id: int,
    update_data: PriorityUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Update a priority (admin only).

    Args:
        priority_id: Priority ID
        update_data: Fields to update
        db: Database session
        current_user: Authenticated admin user

    Returns:
        PriorityRead: Updated priority

    Raises:
        HTTPException 404: Priority not found

    **Note:** Cache invalidation is handled in priority_service.py via Redis

    **Permissions:** Admin only
    """
    service = PriorityService(db)
    priority = await service.update_priority(
        priority_id=priority_id, update_data=update_data
    )

    if not priority:
        raise HTTPException(status_code=404, detail="Priority not found")

    return priority


@router.delete("/{priority_id}", status_code=204)
async def delete_priority(
    priority_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete a priority (mark as inactive, admin only).

    Priorities are marked as inactive rather than deleted to maintain
    referential integrity with service requests.

    Args:
        priority_id: Priority ID
        db: Database session
        current_user: Authenticated admin user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Priority not found

    **Note:** Cache invalidation is handled in priority_service.py via Redis

    **Permissions:** Admin only
    """
    service = PriorityService(db)
    success = await service.delete_priority(priority_id=priority_id)

    if not success:
        raise HTTPException(status_code=404, detail="Priority not found")

    return None
