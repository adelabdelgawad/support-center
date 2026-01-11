"""
Service for managing per-user, per-chat read state tracking.

This service provides methods for:
- Tracking unread counts per user per chat
- Managing viewing presence (is user currently in a chat)
- Marking chats as read
- Aggregating global unread counts
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import ChatMessage, ChatReadState, ServiceRequest, User

logger = logging.getLogger(__name__)


class ChatReadStateService:
    """Service for managing chat read states."""

    @staticmethod
    @log_database_operation("get or create chat read monitor", level="debug")
    async def get_or_create_monitor(
        db: AsyncSession, request_id: UUID, user_id: int
    ) -> ChatReadState:
        """
        Get or create a ChatReadState record for a user in a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User UUID string

        Returns:
            ChatReadState record (existing or newly created)
        """
        # Try to get existing monitor
        stmt = select(ChatReadState).where(
            and_(
                ChatReadState.request_id == request_id,
                ChatReadState.user_id == user_id,
            )
        )
        result = await db.execute(stmt)
        monitor = result.scalar_one_or_none()

        if monitor:
            return monitor

        # Create new monitor
        monitor = ChatReadState(
            request_id=request_id,
            user_id=user_id,
            unread_count=0,
            is_viewing=False,
        )
        db.add(monitor)
        await db.flush()  # Add to session but don't commit yet

        logger.info(
            f"Created chat read monitor: request_id={request_id}, user_id={user_id}"
        )
        return monitor

    @staticmethod
    @transactional_database_operation("mark_chat_as_read")
    @log_database_operation("mark chat as read", level="debug")
    async def mark_chat_as_read(
        db: AsyncSession,
        request_id: UUID,
        user_id: str,
        last_message_id: Optional[UUID] = None,
    ) -> ChatReadState:
        """
        Mark a chat as fully read for a user.

        Sets unread_count to 0 and updates last_read_at timestamp.
        Also marks all messages as read (updates ChatMessage.is_read field).

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User UUID string
            last_message_id: Optional ID of the last read message

        Returns:
            Updated ChatReadState record
        """
        logger.debug(f"[READ_RECEIPTS] mark_chat_as_read: request_id={request_id}, user_id={user_id}")

        # Get or create monitor
        monitor = await ChatReadStateService.get_or_create_monitor(
            db, request_id, user_id
        )

        # Get the latest message timestamp if not provided
        if not last_message_id:
            stmt = (
                select(ChatMessage.id, ChatMessage.created_at)
                .where(ChatMessage.request_id == request_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
            result = await db.execute(stmt)
            latest = result.first()
            if latest:
                last_message_id = latest.id
                last_read_at = latest.created_at
            else:
                last_read_at = datetime.utcnow()
        else:
            # Get timestamp of provided message
            stmt = select(ChatMessage.created_at).where(
                ChatMessage.id == last_message_id
            )
            result = await db.execute(stmt)
            timestamp = result.scalar_one_or_none()
            last_read_at = timestamp or datetime.utcnow()

        # Update monitor
        monitor.unread_count = 0
        monitor.last_read_at = last_read_at
        monitor.last_read_message_id = last_message_id
        monitor.updated_at = datetime.utcnow()

        # CRITICAL FIX: Also mark all unread messages NOT from this user as read
        # This is needed because check_technician_unread_for_requests uses ChatMessage.is_read
        mark_read_stmt = (
            update(ChatMessage)
            .where(
                and_(
                    ChatMessage.request_id == request_id,
                    ChatMessage.sender_id != user_id,  # Messages NOT sent by current user
                    ChatMessage.is_read == False,
                )
            )
            .values(is_read=True)
        )
        result = await db.execute(mark_read_stmt)
        messages_marked = result.rowcount

        logger.debug(
            f"[READ_RECEIPTS] Marked {messages_marked} messages as read for user {user_id} in request {request_id}"
        )
        return monitor

    @staticmethod
    @transactional_database_operation("increment_unread")
    async def increment_unread_for_users(
        db: AsyncSession,
        request_id: UUID,
        exclude_user_ids: List[int],
        participant_user_ids: List[int],
    ) -> int:
        """
        Increment unread count for all participants except those currently viewing.

        Called when a new message is sent in a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            exclude_user_ids: Users to exclude (sender, users currently viewing)
            participant_user_ids: All users who should be notified

        Returns:
            Number of monitors updated
        """
        # Filter out excluded users
        users_to_notify = [
            uid for uid in participant_user_ids if uid not in exclude_user_ids
        ]

        if not users_to_notify:
            return 0

        updated_count = 0

        for user_id in users_to_notify:
            # Get or create monitor for each user
            monitor = await ChatReadStateService.get_or_create_monitor(
                db, request_id, user_id
            )

            # Always increment unread count for recipients
            # Note: is_viewing check removed because:
            # 1. SignalR service handles viewing state in memory
            # 2. Database is_viewing field was never properly maintained
            # 3. This caused bugs where unread counts wouldn't increment
            monitor.unread_count += 1
            monitor.updated_at = datetime.utcnow()
            updated_count += 1

        logger.debug(
            f"Incremented unread for {updated_count} users in request {request_id}"
        )
        return updated_count

    @staticmethod
    @transactional_database_operation("set_viewing_status")
    @log_database_operation("set viewing status", level="debug")
    async def set_viewing_status(
        db: AsyncSession,
        request_id: UUID,
        user_id: str,
        is_viewing: bool,
    ) -> ChatReadState:
        """
        Update whether a user is currently viewing a chat.

        OPTIMIZED:
        - is_viewing=False: Uses PostgreSQL upsert (single query)
        - is_viewing=True: Uses SELECT + UPDATE (needs latest message)

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User UUID string
            is_viewing: True if user is viewing, False otherwise

        Returns:
            Updated ChatReadState record
        """
        now = datetime.utcnow()

        # OPTIMIZED PATH: For is_viewing=False (disconnect), use upsert (single query)
        if not is_viewing:
            stmt = insert(ChatReadState).values(
                request_id=request_id,
                user_id=user_id,
                is_viewing=False,
                unread_count=0,
                updated_at=now,
            ).on_conflict_do_update(
                index_elements=['request_id', 'user_id'],
                set_={
                    'is_viewing': False,
                    'updated_at': now,
                }
            ).returning(ChatReadState)

            result = await db.execute(stmt)
            monitor = result.scalar_one()

            logger.debug(
                f"Set viewing status (upsert): request_id={request_id}, "
                f"user_id={user_id}, is_viewing=False"
            )
            return monitor

        # STANDARD PATH: For is_viewing=True, need to get latest message
        monitor = await ChatReadStateService.get_or_create_monitor(
            db, request_id, user_id
        )

        monitor.is_viewing = True
        monitor.updated_at = now
        monitor.unread_count = 0

        # Get latest message timestamp
        stmt = (
            select(ChatMessage.id, ChatMessage.created_at)
            .where(ChatMessage.request_id == request_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        latest = result.first()
        if latest:
            monitor.last_read_message_id = latest.id
            monitor.last_read_at = latest.created_at

        logger.debug(
            f"Set viewing status: request_id={request_id}, "
            f"user_id={user_id}, is_viewing=True"
        )
        return monitor

    @staticmethod
    @safe_database_query("get_unread_message_ids", default_return=[])
    async def get_unread_message_ids(
        db: AsyncSession, request_id: UUID, user_id: int
    ) -> List[str]:
        """
        Get IDs of unread messages for a user in a chat.

        Returns message IDs for messages NOT sent by the user that are unread.
        Used for SignalR broadcast when marking as read.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User UUID string

        Returns:
            List of unread message IDs as strings
        """
        stmt = select(ChatMessage.id).where(
            and_(
                ChatMessage.request_id == request_id,
                ChatMessage.sender_id != user_id,  # Messages NOT sent by current user
                ChatMessage.is_read == False,
            )
        )
        result = await db.execute(stmt)
        return [str(row[0]) for row in result.all()]

    @staticmethod
    @safe_database_query("get_unread_count", default_return=0)
    async def get_unread_count(
        db: AsyncSession, request_id: UUID, user_id: int
    ) -> int:
        """
        Get unread count for a specific user in a specific chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User UUID string

        Returns:
            Number of unread messages
        """
        stmt = select(ChatReadState.unread_count).where(
            and_(
                ChatReadState.request_id == request_id,
                ChatReadState.user_id == user_id,
            )
        )
        result = await db.execute(stmt)
        count = result.scalar_one_or_none()
        return count or 0

    @staticmethod
    @safe_database_query("get_total_unread_count", default_return=0)
    async def get_total_unread_count(db: AsyncSession, user_id: str) -> int:
        """
        Get total unread count across all chats for a user.

        Args:
            db: Database session
            user_id: User UUID string

        Returns:
            Total number of unread messages across all chats
        """
        stmt = select(func.sum(ChatReadState.unread_count)).where(
            ChatReadState.user_id == user_id
        )
        result = await db.execute(stmt)
        total = result.scalar_one_or_none()
        return total or 0

    @staticmethod
    @safe_database_query("get_all_monitors_for_user", default_return=[])
    async def get_all_monitors_for_user(
        db: AsyncSession, user_id: int
    ) -> List[Dict]:
        """
        Get all chat read monitors for a user.

        Used for displaying unread badges on chat list.

        Args:
            db: Database session
            user_id: User UUID string

        Returns:
            List of dicts with request_id and unread_count
        """
        stmt = select(
            ChatReadState.request_id,
            ChatReadState.unread_count,
            ChatReadState.last_read_at,
        ).where(ChatReadState.user_id == user_id)

        result = await db.execute(stmt)
        rows = result.all()

        return [
            {
                "request_id": str(row.request_id),
                "unread_count": row.unread_count,
                "last_read_at": row.last_read_at.isoformat() if row.last_read_at else None,
            }
            for row in rows
        ]

    @staticmethod
    @safe_database_query("get_users_viewing_chat", default_return=[])
    async def get_users_viewing_chat(
        db: AsyncSession, request_id: UUID
    ) -> List[int]:
        """
        Get list of user IDs currently viewing a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID

        Returns:
            List of user IDs currently viewing the chat
        """
        stmt = select(ChatReadState.user_id).where(
            and_(
                ChatReadState.request_id == request_id,
                ChatReadState.is_viewing == True,
            )
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    @staticmethod
    @transactional_database_operation("ensure_monitors_for_participants")
    async def ensure_monitors_for_participants(
        db: AsyncSession,
        request_id: UUID,
        participant_user_ids: List[int],
    ) -> int:
        """
        Ensure ChatReadState records exist for all participants.

        Creates monitors for any participants who don't have one yet.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            participant_user_ids: List of user IDs who should have monitors

        Returns:
            Number of new monitors created
        """
        # Get existing monitors
        stmt = select(ChatReadState.user_id).where(
            ChatReadState.request_id == request_id
        )
        result = await db.execute(stmt)
        existing_user_ids = {row[0] for row in result.all()}

        # Create monitors for missing users
        new_monitors = []
        for user_id in participant_user_ids:
            if user_id not in existing_user_ids:
                new_monitors.append(
                    ChatReadState(
                        request_id=request_id,
                        user_id=user_id,
                        unread_count=0,
                        is_viewing=False,
                    )
                )

        if new_monitors:
            db.add_all(new_monitors)
            logger.info(
                f"Created {len(new_monitors)} monitors for request {request_id}"
            )

        return len(new_monitors)
