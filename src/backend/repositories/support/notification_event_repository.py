from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from db.models import NotificationEvent
from repositories.base_repository import BaseRepository


class NotificationEventRepository(BaseRepository[NotificationEvent]):
    model = NotificationEvent

    @classmethod
    async def find_by_user(
        cls,
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

    @classmethod
    async def find_by_user_all(
        cls,
        db: AsyncSession,
        user_id: UUID,
        limit: int = 100,
    ) -> List[NotificationEvent]:
        """
        Get all notifications for a user (including delivered).

        Args:
            db: Database session
            user_id: User UUID
            limit: Maximum notifications to return

        Returns:
            List of NotificationEvent records
        """
        stmt = (
            select(NotificationEvent)
            .where(NotificationEvent.user_id == user_id)
            .order_by(NotificationEvent.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def mark_read(
        cls,
        db: AsyncSession,
        event_id: UUID,
    ) -> bool:
        """
        Mark a notification as delivered.

        Args:
            db: Database session
            event_id: Notification event UUID

        Returns:
            True if marked, False if not found
        """
        stmt = (
            update(NotificationEvent)
            .where(NotificationEvent.id == event_id)
            .values(delivered_at=datetime.utcnow())
        )
        result = await db.execute(stmt)

        if result.rowcount == 0:
            return False

        return True

    @classmethod
    async def mark_multiple_read(
        cls,
        db: AsyncSession,
        notification_ids: List[UUID],
    ) -> int:
        """
        Mark multiple notifications as delivered.

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

        return result.rowcount

    @classmethod
    async def mark_user_notifications_delivered(
        cls,
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

        return result.rowcount

    @classmethod
    async def create(
        cls,
        db: AsyncSession,
        user_id: UUID,
        event_type: str,
        payload: Dict[str, Any],
        request_id: Optional[UUID] = None,
    ) -> NotificationEvent:
        """
        Create a notification event.

        Args:
            db: Database session
            user_id: Target user UUID
            event_type: Type of notification
            payload: Event-specific data
            request_id: Optional related request UUID

        Returns:
            Created NotificationEvent
        """
        from uuid import uuid4

        notification = NotificationEvent(
            id=uuid4(),
            user_id=user_id,
            event_type=event_type,
            request_id=request_id,
            payload=payload,
        )
        db.add(notification)
        await db.flush()

        return notification
