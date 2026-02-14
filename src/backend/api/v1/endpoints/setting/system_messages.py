"""
System Messages API endpoints for managing message templates.

Provides CRUD operations for system-wide message templates used for
automated notifications and responses.

Key Features:
- Message type uniqueness (no duplicate message_type values)
- Multi-language support (message_en, message_ar)
- Active/inactive toggle for soft delete
- Bulk status updates for multiple messages
- Admin-only access for write operations

Endpoints:
- GET / - List all system message templates with counts
- GET /{message_id} - Get a specific message by ID
- POST / - Create a new message template (admin only)
- PATCH /{message_id} - Update a message template (admin only)
- PATCH /{message_id}/toggle - Toggle message active/inactive (admin only)
- POST /bulk-status - Bulk update message status (admin only)
- DELETE /{message_id} - Delete a message (hard delete, admin only)

Authentication:
- All endpoints require authentication
- Write operations (POST, PATCH, DELETE) require super admin role

Note:
DELETE is a hard delete and will permanently remove the message.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session, get_current_user
from db import User
from api.schemas.system_message import (
    SystemMessageCreate,
    SystemMessageUpdate,
    SystemMessageRead,
    SystemMessageListResponse,
)
from api.services.system_message_service import SystemMessageService
from repositories.setting.system_message_repository import SystemMessageRepository
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
    # Use repository to get filtered messages with pagination
    filters = {}
    if is_active is not None:
        filters["is_active"] = is_active

    from db import SystemMessage
    messages = await SystemMessageRepository.find_all(
        db,
        filters=filters,
        order_by=SystemMessage.created_at.desc(),
        offset=skip,
        limit=limit,
    )

    # Get total count with filters
    total = await SystemMessageRepository.count(db, filters=filters)

    # Get global active/inactive counts
    active_count = await SystemMessageRepository.count(db, filters={"is_active": True})
    inactive_count = await SystemMessageRepository.count(db, filters={"is_active": False})

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
    message = await SystemMessageRepository.find_by_id(db, message_id)

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
    existing = await SystemMessageRepository.find_one(
        db, filters={"message_type": message_data.message_type}
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Message type '{message_data.message_type}' already exists",
        )

    message = await SystemMessageRepository.create(
        db, obj_in=message_data.model_dump()
    )

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

    update_dict = {
        k: v
        for k, v in message_data.model_dump(exclude_unset=True).items()
        if v is not None
    }

    message = await SystemMessageRepository.update(
        db, id_value=message_id, obj_in=update_dict
    )

    if not message:
        raise HTTPException(status_code=404, detail="System message not found")

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

    message = await SystemMessageRepository.find_by_id(db, message_id)

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
    from sqlalchemy import select
    from db import SystemMessage
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

    deleted = await SystemMessageRepository.delete(
        db, id_value=message_id, soft_delete=False
    )

    if not deleted:
        raise HTTPException(status_code=404, detail="System message not found")
