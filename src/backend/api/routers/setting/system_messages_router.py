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
from pydantic import BaseModel

from core.dependencies import get_session, get_current_user
from db import User
from api.schemas.system_message import (
    SystemMessageCreate,
    SystemMessageUpdate,
    SystemMessageRead,
    SystemMessageListResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class BulkStatusUpdate(BaseModel):
    """Schema for bulk status update."""
    message_ids: List[int]
    is_active: bool


@router.get("", response_model=SystemMessageListResponse)
async def list_system_messages(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SystemMessageListResponse:
    """List all system message templates with counts."""
    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    return await service.list_messages(skip=skip, limit=limit, is_active=is_active)


@router.get("/{message_id}", response_model=SystemMessageRead)
async def get_system_message(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SystemMessageRead:
    """Get system message by ID."""
    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    message = await service.get_by_id(message_id)
    if not message:
        raise HTTPException(status_code=404, detail="System message not found")
    return SystemMessageRead.model_validate(message)


@router.post("", response_model=SystemMessageRead, status_code=201)
async def create_system_message(
    message_data: SystemMessageCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SystemMessageRead:
    """Create a new system message template. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    message = await service.create_message(message_data.model_dump())
    return SystemMessageRead.model_validate(message)


@router.patch("/{message_id}", response_model=SystemMessageRead)
async def update_system_message(
    message_id: int,
    message_data: SystemMessageUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SystemMessageRead:
    """Update system message template. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    update_dict = {
        k: v
        for k, v in message_data.model_dump(exclude_unset=True).items()
        if v is not None
    }

    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    message = await service.update_message(message_id, update_dict)
    if not message:
        raise HTTPException(status_code=404, detail="System message not found")
    return SystemMessageRead.model_validate(message)


@router.patch("/{message_id}/toggle", response_model=SystemMessageRead)
async def toggle_system_message_status(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SystemMessageRead:
    """Toggle system message active/inactive status. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    message = await service.toggle_status(message_id)
    if not message:
        raise HTTPException(status_code=404, detail="System message not found")
    return SystemMessageRead.model_validate(message)


@router.post("/bulk-status", response_model=List[SystemMessageRead])
async def bulk_update_status(
    update_data: BulkStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[SystemMessageRead]:
    """Bulk update system message status. Admin only."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    if not update_data.message_ids:
        raise HTTPException(status_code=400, detail="No message IDs provided")

    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    messages = await service.bulk_update_status(update_data.message_ids, update_data.is_active)
    if not messages:
        raise HTTPException(status_code=404, detail="No messages found")
    return [SystemMessageRead.model_validate(m) for m in messages]


@router.delete("/{message_id}", status_code=204)
async def delete_system_message(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete system message. Admin only. Warning: Hard delete."""
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    from api.services.setting.system_message_service import SystemMessageService
    service = SystemMessageService(db)
    deleted = await service.delete_message(message_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="System message not found")
