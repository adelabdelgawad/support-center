from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from db.models import NotificationEvent
from api.repositories.base_repository import BaseRepository


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
                    NotificationEvent.__table__.c.user_id == user_id,
                    NotificationEvent.__table__.c.delivered_at.is_(None),
                )
            )
            .order_by(NotificationEvent.__table__.c.created_at.asc())
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
            .where(NotificationEvent.__table__.c.user_id == user_id)
            .order_by(NotificationEvent.__table__.c.created_at.desc())
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
        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            update(NotificationEvent)
            .where(NotificationEvent.__table__.c.id == event_id)
            .values(delivered_at=datetime.utcnow())
        )

        return cursor_result.rowcount > 0

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

        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            update(NotificationEvent)
            .where(NotificationEvent.__table__.c.id.in_(notification_ids))
            .values(delivered_at=datetime.utcnow())
        )

        return cursor_result.rowcount

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
            NotificationEvent.__table__.c.user_id == user_id,
            NotificationEvent.__table__.c.delivered_at.is_(None),
        ]

        if before_timestamp:
            conditions.append(NotificationEvent.__table__.c.created_at <= before_timestamp)

        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            update(NotificationEvent)
            .where(and_(*conditions))
            .values(delivered_at=datetime.utcnow())
        )

        return cursor_result.rowcount

    @classmethod
    async def create_notification(
        cls,
        db: AsyncSession,
        user_id: UUID,
        event_type: str,
        payload: Dict[str, Any],
        request_id: Optional[UUID] = None,
        *,
        commit: bool = True,
    ) -> NotificationEvent:
        """
        Create a notification event.

        Args:
            db: Database session
            user_id: Target user UUID
            event_type: Type of notification
            payload: Event-specific data
            request_id: Optional related request UUID
            commit: Whether to flush immediately

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
        await db.refresh(notification)

        return notification
