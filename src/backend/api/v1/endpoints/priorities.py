"""
Priority API endpoints.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import require_admin
from models import User
from schemas.priority import (
    PriorityCreate,
    PriorityListItem,
    PriorityRead,
    PriorityUpdate,
)
from services.priority_service import PriorityService

router = APIRouter()


@router.get("/", response_model=List[PriorityListItem])
async def list_priorities(
    active_only: bool = True, db: AsyncSession = Depends(get_session)
):
    """
    List all priorities.

    - **active_only**: Only return active priorities (default: true)
    """
    priorities = await PriorityService.list_priorities(
        db=db, active_only=active_only
    )
    return priorities


@router.get("/{priority_id}", response_model=PriorityRead)
async def get_priority(
    priority_id: int, db: AsyncSession = Depends(get_session)
):
    """Get a priority by ID."""
    priority = await PriorityService.get_priority(
        db=db, priority_id=priority_id
    )

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

    - **name**: Priority name (Critical, High, Medium, Low, Lowest)
    - **response_time_minutes**: Expected response time in minutes
    - **resolution_time_hours**: Expected resolution time in hours
    """
    try:
        priority = await PriorityService.create_priority(
            db=db, priority_data=priority_data
        )

        # Note: Cache invalidation is handled in priority_service.py via Redis
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
    """Update a priority (admin only)."""
    priority = await PriorityService.update_priority(
        db=db, priority_id=priority_id, update_data=update_data
    )

    if not priority:
        raise HTTPException(status_code=404, detail="Priority not found")

    # Note: Cache invalidation is handled in priority_service.py via Redis
    return priority


@router.delete("/{priority_id}", status_code=204)
async def delete_priority(
    priority_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete a priority (mark as inactive, admin only).

    Note: Priorities are marked as inactive rather than deleted
    to maintain referential integrity with service requests.
    """
    success = await PriorityService.delete_priority(
        db=db, priority_id=priority_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Priority not found")

    # Note: Cache invalidation is handled in priority_service.py via Redis
    return None
