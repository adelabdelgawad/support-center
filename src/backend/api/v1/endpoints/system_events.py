"""
System Events API endpoints for managing event configurations.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session, get_current_user
from models import User
from schemas.system_event.system_event import (
    SystemEventCreate,
    SystemEventUpdate,
    SystemEventRead,
    SystemEventListResponse,
)
from services.system_event_service import SystemEventService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=SystemEventListResponse)
async def list_system_events(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max records to return"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List all system events with pagination.

    **Permissions**: Authenticated users
    """
    events, total = await SystemEventService.list_events(
        db, skip=skip, limit=limit, is_active=is_active
    )

    active_count = sum(1 for e in events if e.is_active)
    inactive_count = len(events) - active_count

    return SystemEventListResponse(
        events=events,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
    )


@router.get("/{event_id}", response_model=SystemEventRead)
async def get_system_event(
    event_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get system event by ID.

    **Permissions**: Authenticated users
    """
    event = await SystemEventService.get_event_by_id(db, event_id)

    if not event:
        raise HTTPException(status_code=404, detail="System event not found")

    return event


@router.post("", response_model=SystemEventRead, status_code=201)
async def create_system_event(
    event_data: SystemEventCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new system event.

    **Permissions**: Admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can create system events"
        )

    try:
        event = await SystemEventService.create_event(db, event_data)
        return event
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{event_id}", response_model=SystemEventRead)
async def update_system_event(
    event_id: int,
    event_data: SystemEventUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update system event.

    **Permissions**: Admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can update system events"
        )

    try:
        event = await SystemEventService.update_event(db, event_id, event_data)

        if not event:
            raise HTTPException(status_code=404, detail="System event not found")

        return event
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{event_id}", status_code=204)
async def delete_system_event(
    event_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete system event.

    **Permissions**: Admin only
    **Warning**: Hard delete - use with caution
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can delete system events"
        )

    success = await SystemEventService.delete_event(db, event_id)

    if not success:
        raise HTTPException(status_code=404, detail="System event not found")


@router.patch("/{event_id}/toggle", response_model=SystemEventRead)
async def toggle_system_event_status(
    event_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle system event is_active status.

    **Permissions**: Admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can toggle system events"
        )

    event = await SystemEventService.toggle_event_status(db, event_id)

    if not event:
        raise HTTPException(status_code=404, detail="System event not found")

    return event
