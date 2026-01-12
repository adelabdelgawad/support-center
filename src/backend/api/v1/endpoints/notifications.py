"""
Notification Endpoints

HTTP endpoints for notification recovery and management.

Contract:
- Clients fetch pending notifications via GET /pending on reconnect
- Clients acknowledge notifications via POST /acknowledge
- All notifications are persisted to DB before SignalR broadcast
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, get_session
from core.schema_base import HTTPSchemaModel
from models import NotificationEvent, User
from services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================


class NotificationPayload(HTTPSchemaModel):
    """Notification event payload for API responses."""

    id: UUID = Field(..., description="Notification UUID")
    event_type: str = Field(..., description="Event type")
    request_id: Optional[UUID] = Field(None, description="Related request ID")
    payload: dict = Field(..., description="Event-specific data")
    created_at: datetime = Field(..., description="When notification was created")


class PendingNotificationsResponse(HTTPSchemaModel):
    """Response for pending notifications endpoint."""

    notifications: List[NotificationPayload] = Field(
        default_factory=list,
        description="List of pending notifications"
    )
    count: int = Field(0, description="Number of pending notifications")


class AcknowledgeRequest(BaseModel):
    """Request body for acknowledging notifications."""

    notification_ids: Optional[List[UUID]] = Field(
        None,
        description="Specific notification IDs to acknowledge. If None, acknowledges all pending."
    )
    before_timestamp: Optional[datetime] = Field(
        None,
        description="Only acknowledge notifications created before this time"
    )


class AcknowledgeResponse(HTTPSchemaModel):
    """Response for acknowledge endpoint."""

    acknowledged_count: int = Field(..., description="Number of notifications acknowledged")


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/pending", response_model=PendingNotificationsResponse)
async def get_pending_notifications(
    limit: int = 100,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get pending (undelivered) notifications for the current user.

    This endpoint is called by clients on reconnect to recover
    any notifications missed while offline.

    Returns notifications in chronological order (oldest first).
    """
    logger.debug(f"[NOTIFICATIONS] Fetching pending for user {current_user.id}")

    notifications = await NotificationService.get_pending_notifications(
        db=db,
        user_id=current_user.id,
        limit=min(limit, 500),  # Cap at 500 max
    )

    notification_payloads = [
        NotificationPayload(
            id=n.id,
            event_type=n.event_type,
            request_id=n.request_id,
            payload=n.payload,
            created_at=n.created_at,
        )
        for n in notifications
    ]

    logger.debug(f"[NOTIFICATIONS] Returning {len(notification_payloads)} pending notifications for user {current_user.id}")

    return PendingNotificationsResponse(
        notifications=notification_payloads,
        count=len(notification_payloads),
    )


@router.post("/acknowledge", response_model=AcknowledgeResponse)
async def acknowledge_notifications(
    request: AcknowledgeRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Acknowledge receipt of notifications.

    Can either:
    1. Acknowledge specific notification IDs (if notification_ids provided)
    2. Acknowledge all pending notifications (if notification_ids is None)

    Optionally filter by before_timestamp to only acknowledge older notifications.
    """
    logger.debug(f"[NOTIFICATIONS] Acknowledging for user {current_user.id}, specific_ids={bool(request.notification_ids)}")

    if request.notification_ids:
        # Acknowledge specific notifications
        count = await NotificationService.mark_notifications_delivered(
            db=db,
            notification_ids=request.notification_ids,
        )
    else:
        # Acknowledge all pending for user
        count = await NotificationService.mark_user_notifications_delivered(
            db=db,
            user_id=current_user.id,
            before_timestamp=request.before_timestamp,
        )

    logger.debug(f"[NOTIFICATIONS] Acknowledged {count} notifications for user {current_user.id}")

    return AcknowledgeResponse(acknowledged_count=count)


@router.get("/count", response_model=dict)
async def get_notification_count(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get count of pending notifications for the current user.

    Lightweight endpoint for badge count updates.
    """
    notifications = await NotificationService.get_pending_notifications(
        db=db,
        user_id=current_user.id,
        limit=1000,  # Just counting
    )

    return {"count": len(notifications)}
