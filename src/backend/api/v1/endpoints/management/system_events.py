"""
System Events API endpoints for managing event configurations.

Provides endpoints for managing system events that trigger automated actions,
such as sending notifications or executing workflows when specific conditions occur.

**Architecture Note:**
Refactored to inline DB queries - service and CRUD layers removed.
Previous service layer used raw SQL with minor FK validation which has been
simplified into helper functions within this module.

**Key Features:**
- System event CRUD operations
- Event key-based lookups (used by event_trigger_service)
- Association with system messages (templates)
- Active/inactive status tracking
- Super admin-only access
- Hard delete support (use with caution)
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.dependencies import get_session, get_current_user
from db import SystemEvent, SystemMessage, User
from api.schemas.system_event import (
    SystemEventCreate,
    SystemEventUpdate,
    SystemEventRead,
    SystemEventListResponse,
)

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

    Args:
        skip: Number of records to skip (pagination offset)
        limit: Max records to return (1-100)
        is_active: Optional filter by active status
        db: Database session
        current_user: Authenticated user

    Returns:
        SystemEventListResponse:
            - events: List of system events
            - total: Total count
            - active_count: Active events count
            - inactive_count: Inactive events count

    Raises:
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        stmt = select(SystemEvent).options(selectinload(SystemEvent.system_message))

        if is_active is not None:
            stmt = stmt.where(SystemEvent.is_active == is_active)

        # Get total count
        count_stmt = select(func.count()).select_from(SystemEvent)
        if is_active is not None:
            count_stmt = count_stmt.where(SystemEvent.is_active == is_active)

        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = stmt.offset(skip).limit(limit).order_by(SystemEvent.created_at.desc())
        result = await db.execute(stmt)
        events = result.scalars().all()

        active_count = sum(1 for e in events if e.is_active)
        inactive_count = len(events) - active_count

        return SystemEventListResponse(
            events=list(events),
            total=total,
            active_count=active_count,
            inactive_count=inactive_count,
        )
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching system events: {str(e)}"
        )


@router.get("/{event_id}", response_model=SystemEventRead)
async def get_system_event(
    event_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get system event by ID.

    Returns the event with its associated system message and audit info.

    Args:
        event_id: Event ID
        db: Database session
        current_user: Authenticated user

    Returns:
        SystemEventRead: Event with system_message, creator, updater

    Raises:
        HTTPException 404: System event not found
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        stmt = select(SystemEvent).where(SystemEvent.id == event_id).options(
            selectinload(SystemEvent.system_message),
            selectinload(SystemEvent.creator),
            selectinload(SystemEvent.updater),
        )
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            raise HTTPException(status_code=404, detail="System event not found")

        return event
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching system event: {str(e)}"
        )


@router.post("", response_model=SystemEventRead, status_code=201)
async def create_system_event(
    event_data: SystemEventCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new system event.

    System events define triggers for automated workflows. The event_key is
    used by event_trigger_service to look up and execute the event configuration.

    Args:
        event_data: Event creation data
            - event_key: Unique key for event lookup (e.g., 'request_created')
            - name: Display name
            - description: Optional description
            - system_message_id: Optional associated system message template
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated user

    Returns:
        SystemEventRead: Created event with relationships loaded

    Raises:
        HTTPException 400: SystemMessage not found
        HTTPException 403: Not a super admin
        HTTPException 500: Database error

    **Permissions:** Super admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can create system events"
        )

    try:
        # Verify system_message exists if provided
        if event_data.system_message_id:
            stmt = select(SystemMessage).where(SystemMessage.id == event_data.system_message_id)
            result = await db.execute(stmt)
            if not result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"SystemMessage {event_data.system_message_id} not found"
                )

        # Create event
        event_dict = event_data.model_dump()
        event = SystemEvent(**event_dict)
        db.add(event)
        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        stmt = select(SystemEvent).where(SystemEvent.id == event.id).options(
            selectinload(SystemEvent.system_message),
            selectinload(SystemEvent.creator),
            selectinload(SystemEvent.updater),
        )
        result = await db.execute(stmt)
        return result.scalar_one()
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while creating system event: {str(e)}"
        )


@router.patch("/{event_id}", response_model=SystemEventRead)
async def update_system_event(
    event_id: int,
    event_data: SystemEventUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update system event.

    All fields are optional. Only provided fields will be updated.

    Args:
        event_id: Event ID
        event_data: Fields to update
            - event_key: Optional new event key
            - name: Optional new name
            - description: Optional new description
            - system_message_id: Optional new system message
            - is_active: Optional active status
        db: Database session
        current_user: Authenticated user

    Returns:
        SystemEventRead: Updated event with relationships loaded

    Raises:
        HTTPException 400: SystemMessage not found
        HTTPException 403: Not a super admin
        HTTPException 404: System event not found
        HTTPException 500: Database error

    **Permissions:** Super admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can update system events"
        )

    try:
        # Get existing event
        stmt = select(SystemEvent).where(SystemEvent.id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            raise HTTPException(status_code=404, detail="System event not found")

        update_dict = event_data.model_dump(exclude_unset=True)

        # Verify new system_message if provided
        if "system_message_id" in update_dict and update_dict["system_message_id"]:
            stmt = select(SystemMessage).where(SystemMessage.id == update_dict["system_message_id"])
            result = await db.execute(stmt)
            if not result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"SystemMessage {update_dict['system_message_id']} not found"
                )

        # Update fields
        for field, value in update_dict.items():
            setattr(event, field, value)

        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        stmt = select(SystemEvent).where(SystemEvent.id == event.id).options(
            selectinload(SystemEvent.system_message),
            selectinload(SystemEvent.creator),
            selectinload(SystemEvent.updater),
        )
        result = await db.execute(stmt)
        return result.scalar_one()
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while updating system event: {str(e)}"
        )


@router.delete("/{event_id}", status_code=204)
async def delete_system_event(
    event_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete system event.

    Permanently removes the event from the database. This is a hard delete
    operation and cannot be undone. Use with caution.

    Args:
        event_id: Event ID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 403: Not a super admin
        HTTPException 404: System event not found
        HTTPException 500: Database error

    **Warning:** Hard delete - use with caution

    **Permissions:** Super admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can delete system events"
        )

    try:
        stmt = select(SystemEvent).where(SystemEvent.id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            raise HTTPException(status_code=404, detail="System event not found")

        await db.delete(event)
        await db.commit()
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while deleting system event: {str(e)}"
        )


@router.patch("/{event_id}/toggle", response_model=SystemEventRead)
async def toggle_system_event_status(
    event_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle system event is_active status.

    Quickly enables/disables an event without full update.

    Args:
        event_id: Event ID
        db: Database session
        current_user: Authenticated user

    Returns:
        SystemEventRead: Updated event with relationships loaded

    Raises:
        HTTPException 403: Not a super admin
        HTTPException 404: System event not found
        HTTPException 500: Database error

    **Permissions:** Super admin only
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403, detail="Only administrators can toggle system events"
        )

    try:
        stmt = select(SystemEvent).where(SystemEvent.id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            raise HTTPException(status_code=404, detail="System event not found")

        event.is_active = not event.is_active
        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        stmt = select(SystemEvent).where(SystemEvent.id == event.id).options(
            selectinload(SystemEvent.system_message),
            selectinload(SystemEvent.creator),
            selectinload(SystemEvent.updater),
        )
        result = await db.execute(stmt)
        return result.scalar_one()
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while toggling system event: {str(e)}"
        )


# Export for use by event_trigger_service
async def get_event_by_key(db: AsyncSession, event_key: str) -> Optional[SystemEvent]:
    """Get active system event by event_key."""
    stmt = select(SystemEvent).where(
        SystemEvent.event_key == event_key,
        SystemEvent.is_active
    ).options(selectinload(SystemEvent.system_message))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
