"""
Durable Notification Service

This service ensures notifications are not lost when clients are offline:
- Persists notifications to database BEFORE SignalR broadcast
- Provides HTTP recovery endpoint for missed notifications
- Tracks delivery status for auditing

Contract:
- All user-affecting notifications go through this service
- DB persistence happens FIRST, then SignalR broadcast
- Clients fetch pending notifications on reconnect via HTTP
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    safe_database_query,
    transactional_database_operation,
)
from db import NotificationEvent
from api.repositories.support.notification_event_repository import (
    NotificationEventRepository,
)
from api.services.signalr_client import SignalRClient

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Durable notification service with persistence + broadcast.

    Flow:
    1. Create notification event in DB
    2. Broadcast via SignalR
    3. On reconnect, client fetches pending via HTTP
    4. Mark as delivered on acknowledgment
    """

    # ==================== Core Persistence Methods ====================

    @staticmethod
    @transactional_database_operation("create_notification")
    async def create_notification(
        db: AsyncSession,
        user_id: UUID,
        event_type: str,
        payload: Dict[str, Any],
        request_id: Optional[UUID] = None,
    ) -> NotificationEvent:
        """
        Create a notification event (persists to DB).

        Args:
            db: Database session
            user_id: Target user UUID
            event_type: Type of notification
            payload: Event-specific data
            request_id: Optional related request UUID

        Returns:
            Created NotificationEvent
        """
        notification = await NotificationEventRepository.create(
            db,
            obj_in={
                "id": uuid4(),
                "user_id": user_id,
                "event_type": event_type,
                "request_id": request_id,
                "payload": payload,
            },
            commit=False,
        )
        await db.flush()

        logger.info(
            f"[NOTIFICATION] Created {event_type} for user {user_id}, "
            f"request_id={request_id}, notification_id={notification.id}"
        )
        return notification

    @staticmethod
    @safe_database_query("get_pending_notifications", default_return=[])
    async def get_pending_notifications(
        db: AsyncSession,
        user_id: UUID,
        limit: int = 100,
    ) -> List[NotificationEvent]:
        """
        Get pending (undelivered) notifications for a user.

        Used by HTTP recovery endpoint on client reconnect.

        Args:
            db: Database session
            user_id: User UUID
            limit: Maximum notifications to return

        Returns:
            List of pending NotificationEvent records
        """
        return await NotificationEventRepository.find_by_user(
            db, user_id, limit
        )

    @staticmethod
    @transactional_database_operation("mark_notifications_delivered")
    async def mark_notifications_delivered(
        db: AsyncSession,
        notification_ids: List[UUID],
    ) -> int:
        """
        Mark notifications as delivered.

        Called after client confirms receipt via HTTP or after successful SignalR broadcast.

        Args:
            db: Database session
            notification_ids: List of notification UUIDs to mark

        Returns:
            Number of notifications marked
        """
        count = await NotificationEventRepository.mark_multiple_read(
            db, notification_ids
        )
        logger.info(f"[NOTIFICATION] Marked {count} notifications as delivered")
        return count

    @staticmethod
    @transactional_database_operation("mark_user_notifications_delivered")
    async def mark_user_notifications_delivered(
        db: AsyncSession,
        user_id: UUID,
        before_timestamp: Optional[datetime] = None,
    ) -> int:
        """
        Mark all pending notifications for a user as delivered.

        Used when client acknowledges all pending notifications.

        Args:
            db: Database session
            user_id: User UUID
            before_timestamp: Only mark notifications created before this time

        Returns:
            Number of notifications marked
        """
        count = await NotificationEventRepository.mark_user_notifications_delivered(
            db, user_id, before_timestamp
        )
        logger.info(
            f"[NOTIFICATION] Marked {count} notifications as delivered for user {user_id}"
        )
        return count

    # ==================== High-Level Notification Methods ====================
    # These persist first, then broadcast

    @classmethod
    async def notify_subscription_added(
        cls,
        db: AsyncSession,
        user_id: UUID,
        request_id: UUID,
        request_title: Optional[str] = None,
    ) -> NotificationEvent:
        """
        Notify user that they were subscribed to a request.

        Persists to DB first, then broadcasts via SignalR.
        """
        payload = {
            "requestId": str(request_id),
            "requestTitle": request_title,
        }

        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type="subscription_added",
            request_id=request_id,
            payload=payload,
        )

        try:
            await SignalRClient.notify_subscription_added(
                user_id=str(user_id),
                request_id=str(request_id),
            )
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(
                f"[NOTIFICATION] Failed to broadcast subscription_added: {e}"
            )

        return notification

    @classmethod
    async def notify_subscription_removed(
        cls,
        db: AsyncSession,
        user_id: UUID,
        request_id: UUID,
        request_title: Optional[str] = None,
    ) -> NotificationEvent:
        """
        Notify user that they were unsubscribed from a request.

        Persists to DB first, then broadcasts via SignalR.
        """
        payload = {
            "requestId": str(request_id),
            "requestTitle": request_title,
        }

        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type="subscription_removed",
            request_id=request_id,
            payload=payload,
        )

        try:
            await SignalRClient.notify_subscription_removed(
                user_id=str(user_id),
                request_id=str(request_id),
            )
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(
                f"[NOTIFICATION] Failed to broadcast subscription_removed: {e}"
            )

        return notification

    @classmethod
    async def notify_ticket_update(
        cls,
        db: AsyncSession,
        user_id: UUID,
        request_id: UUID,
        update_type: str,
        update_data: Dict[str, Any],
    ) -> NotificationEvent:
        """
        Notify user of a ticket update (status change, assignment, etc.).

        Persists to DB first, then broadcasts via SignalR.
        """
        payload = {
            "requestId": str(request_id),
            "updateType": update_type,
            "updateData": update_data,
        }

        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type="ticket_update",
            request_id=request_id,
            payload=payload,
        )

        try:
            await SignalRClient.broadcast_ticket_update(
                request_id=str(request_id),
                update_type=update_type,
                update_data=update_data,
            )
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to broadcast ticket_update: {e}")

        return notification

    @classmethod
    async def send_user_notification(
        cls,
        db: AsyncSession,
        user_id: UUID,
        notification_data: Dict[str, Any],
        event_type: str = "generic",
        request_id: Optional[UUID] = None,
    ) -> NotificationEvent:
        """
        Send a generic notification to a user.

        Persists to DB first, then broadcasts via SignalR.
        """
        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type=event_type,
            request_id=request_id,
            payload=notification_data,
        )

        try:
            await SignalRClient.send_user_notification(
                user_id=str(user_id),
                notification=notification_data,
            )
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to broadcast user notification: {e}")

        return notification
