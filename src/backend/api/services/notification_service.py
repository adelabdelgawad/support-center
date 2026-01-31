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

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    safe_database_query,
    transactional_database_operation,
)
from db import NotificationEvent
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
        notification = NotificationEvent(
            id=uuid4(),
            user_id=user_id,
            event_type=event_type,
            request_id=request_id,
            payload=payload,
        )
        db.add(notification)
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
        stmt = (
            select(NotificationEvent)
            .where(
                and_(
                    NotificationEvent.user_id == user_id,
                    NotificationEvent.delivered_at.is_(None),
                )
            )
            .order_by(NotificationEvent.created_at.asc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

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
        if not notification_ids:
            return 0

        stmt = (
            update(NotificationEvent)
            .where(NotificationEvent.id.in_(notification_ids))
            .values(delivered_at=datetime.utcnow())
        )
        result = await db.execute(stmt)

        logger.info(f"[NOTIFICATION] Marked {result.rowcount} notifications as delivered")
        return result.rowcount

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
        conditions = [
            NotificationEvent.user_id == user_id,
            NotificationEvent.delivered_at.is_(None),
        ]

        if before_timestamp:
            conditions.append(NotificationEvent.created_at <= before_timestamp)

        stmt = (
            update(NotificationEvent)
            .where(and_(*conditions))
            .values(delivered_at=datetime.utcnow())
        )
        result = await db.execute(stmt)

        logger.info(f"[NOTIFICATION] Marked {result.rowcount} notifications as delivered for user {user_id}")
        return result.rowcount

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

        # 1. Persist to DB
        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type="subscription_added",
            request_id=request_id,
            payload=payload,
        )

        # 2. Broadcast via SignalR (fire-and-forget, DB is source of truth)
        try:
            await SignalRClient.notify_subscription_added(
                user_id=str(user_id),
                request_id=str(request_id),
            )
            # Mark as delivered on successful broadcast
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to broadcast subscription_added: {e}")
            # Don't fail - notification is persisted, client can recover via HTTP

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

        # 1. Persist to DB
        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type="subscription_removed",
            request_id=request_id,
            payload=payload,
        )

        # 2. Broadcast via SignalR
        try:
            await SignalRClient.notify_subscription_removed(
                user_id=str(user_id),
                request_id=str(request_id),
            )
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to broadcast subscription_removed: {e}")

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

        # 1. Persist to DB
        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type="ticket_update",
            request_id=request_id,
            payload=payload,
        )

        # 2. Broadcast via SignalR
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
        # 1. Persist to DB
        notification = await cls.create_notification(
            db=db,
            user_id=user_id,
            event_type=event_type,
            request_id=request_id,
            payload=notification_data,
        )

        # 2. Broadcast via SignalR
        try:
            await SignalRClient.send_user_notification(
                user_id=str(user_id),
                notification=notification_data,
            )
            await cls.mark_notifications_delivered(db, [notification.id])
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to broadcast user notification: {e}")

        return notification
