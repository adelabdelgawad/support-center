"""
System Messages API endpoints for managing message templates.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session, get_current_user
from models import User, SystemMessage
from schemas.system_message.system_message import (
    SystemMessageCreate,
    SystemMessageUpdate,
    SystemMessageRead,
    SystemMessageListResponse,
)
from pydantic import BaseModel

class BulkStatusUpdate(BaseModel):
    """Schema for bulk status update."""
    message_ids: List[int]
    is_active: bool

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=SystemMessageListResponse)
async def list_system_messages(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all system message templates with counts."""
    # Build query for messages
    stmt = select(SystemMessage)

    if is_active is not None:
        stmt = stmt.where(SystemMessage.is_active == is_active)

    # Get paginated messages
    messages_stmt = stmt.offset(skip).limit(limit).order_by(SystemMessage.created_at.desc())
    result = await db.execute(messages_stmt)
    messages = result.scalars().all()

    # Get total count (with filters applied)
    count_stmt = select(func.count(SystemMessage.id))
    if is_active is not None:
        count_stmt = count_stmt.where(SystemMessage.is_active == is_active)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Get active count (global counts)
    active_stmt = select(func.count(SystemMessage.id)).where(SystemMessage.is_active == True)
    active_result = await db.execute(active_stmt)
    active_count = active_result.scalar() or 0

    # Get inactive count (global counts)
    inactive_stmt = select(func.count(SystemMessage.id)).where(SystemMessage.is_active == False)
    inactive_result = await db.execute(inactive_stmt)
    inactive_count = inactive_result.scalar() or 0

    return SystemMessageListResponse(
        messages=messages,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
    )


@router.get("/{message_id}", response_model=SystemMessageRead)
async def get_system_message(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get system message by ID."""
    stmt = select(SystemMessage).where(SystemMessage.id == message_id)
    result = await db.execute(stmt)
    message = result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="System message not found")

    return message


@router.post("", response_model=SystemMessageRead, status_code=201)
async def create_system_message(
    message_data: SystemMessageCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new system message template. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # Check if message_type already exists
    stmt = select(SystemMessage).where(
        SystemMessage.message_type == message_data.message_type
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Message type '{message_data.message_type}' already exists",
        )

    message = SystemMessage(**message_data.model_dump())
    db.add(message)
    await db.commit()
    await db.refresh(message)

    return message


@router.patch("/{message_id}", response_model=SystemMessageRead)
async def update_system_message(
    message_id: int,
    message_data: SystemMessageUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update system message template. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    stmt = select(SystemMessage).where(SystemMessage.id == message_id)
    result = await db.execute(stmt)
    message = result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="System message not found")

    update_dict = message_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(message, field, value)

    await db.commit()
    await db.refresh(message)

    return message


@router.patch("/{message_id}/toggle", response_model=SystemMessageRead)
async def toggle_system_message_status(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Toggle system message active/inactive status. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    stmt = select(SystemMessage).where(SystemMessage.id == message_id)
    result = await db.execute(stmt)
    message = result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="System message not found")

    message.is_active = not message.is_active
    await db.commit()
    await db.refresh(message)

    return message


@router.post("/bulk-status", response_model=List[SystemMessageRead])
async def bulk_update_status(
    update_data: BulkStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Bulk update system message status. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    if not update_data.message_ids:
        raise HTTPException(status_code=400, detail="No message IDs provided")

    # Fetch all messages
    stmt = select(SystemMessage).where(SystemMessage.id.in_(update_data.message_ids))
    result = await db.execute(stmt)
    messages = result.scalars().all()

    if not messages:
        raise HTTPException(status_code=404, detail="No messages found")

    # Update status
    updated_messages = []
    for message in messages:
        message.is_active = update_data.is_active
        updated_messages.append(message)

    await db.commit()

    # Refresh all messages
    for message in updated_messages:
        await db.refresh(message)

    return updated_messages


@router.delete("/{message_id}", status_code=204)
async def delete_system_message(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete system message. Admin only. Warning: Hard delete."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    stmt = select(SystemMessage).where(SystemMessage.id == message_id)
    result = await db.execute(stmt)
    message = result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=404, detail="System message not found")

    await db.delete(message)
    await db.commit()
