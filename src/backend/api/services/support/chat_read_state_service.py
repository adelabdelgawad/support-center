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
from typing import Any, Dict, List, Optional, cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import ChatReadState
from api.repositories.support.chat_read_state_repository import ChatReadStateRepository

logger = logging.getLogger(__name__)


class ChatReadStateService:
    """Service for managing chat read states."""

    @staticmethod
    @log_database_operation("get or create chat read monitor", level="debug")
    async def get_or_create_monitor(
        db: AsyncSession, request_id: int, user_id: UUID
    ) -> ChatReadState:
        """
        Get or create a ChatReadState record for a user in a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID (int)
            user_id: User ID (UUID)

        Returns:
            ChatReadState record (existing or newly created)
        """
        monitor = await ChatReadStateRepository.get_or_create(db, request_id, user_id)

        logger.debug(
            f"Got/created chat read monitor: request_id={request_id}, user_id={user_id}"
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
            latest_info = await ChatReadStateRepository.get_latest_message_info(
                db, cast(Any, request_id)
            )
            if latest_info:
                last_message_id = cast(Any, latest_info[0])
                last_read_at = latest_info[1]
            else:
                last_read_at = datetime.utcnow()
        else:
            # Get timestamp of provided message
            timestamp = await ChatReadStateRepository.get_message_timestamp(
                db, last_message_id
            )
            last_read_at = timestamp or datetime.utcnow()

        # Update monitor
        monitor.unread_count = 0
        monitor.last_read_at = last_read_at
        monitor.last_read_message_id = last_message_id
        monitor.updated_at = datetime.utcnow()

        # CRITICAL FIX: Also mark all unread messages NOT from this user as read
        # This is needed because check_technician_unread_for_requests uses ChatMessage.is_read
        messages_marked = await ChatReadStateRepository.mark_messages_as_read(
            db, cast(Any, request_id), user_id
        )

        logger.debug(
            f"[READ_RECEIPTS] Marked {messages_marked} messages as read for user {user_id} in request {request_id}"
        )
        return monitor

    @staticmethod
    @transactional_database_operation("increment_unread")
    async def increment_unread_for_users(
        db: AsyncSession,
        request_id: int,
        exclude_user_ids: List[UUID],
        participant_user_ids: List[UUID],
    ) -> int:
        """
        Increment unread count for all participants except those currently viewing.

        Called when a new message is sent in a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID (int)
            exclude_user_ids: Users to exclude (sender, users currently viewing) as UUIDs
            participant_user_ids: All users who should be notified as UUIDs

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
    ) -> Optional[ChatReadState]:
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
        monitor = await ChatReadStateRepository.set_viewing_status(
            db, cast(Any, request_id), user_id, is_viewing
        )

        logger.debug(
            f"Set viewing status: request_id={request_id}, "
            f"user_id={user_id}, is_viewing={is_viewing}"
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
        return await ChatReadStateRepository.get_unread_message_ids(
            db, cast(Any, request_id), user_id
        )

    @staticmethod
    @safe_database_query("get_unread_count", default_return=0)
    async def get_unread_count(
        db: AsyncSession, request_id: int, user_id: UUID
    ) -> int:
        """
        Get unread count for a specific user in a specific chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID (int)
            user_id: User ID (UUID)

        Returns:
            Number of unread messages
        """
        return await ChatReadStateRepository.get_unread_count(
            db, request_id, user_id
        )

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
        return await ChatReadStateRepository.get_total_unread_count(db, user_id)

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
        return await ChatReadStateRepository.find_all_for_user(db, user_id)

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
        return cast(List[Any], await ChatReadStateRepository.find_viewing_users(db, cast(Any, request_id)))

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
        existing_user_ids = await ChatReadStateRepository.find_existing_user_ids(
            db, cast(Any, request_id)
        )

        # Filter out users who already have monitors
        new_user_ids = [
            user_id for user_id in participant_user_ids
            if user_id not in existing_user_ids
        ]

        # Create monitors for missing users
        if new_user_ids:
            count = await ChatReadStateRepository.bulk_create_monitors(
                db, cast(Any, request_id), new_user_ids
            )
            logger.debug(
                f"Created {count} monitors for request {request_id}"
            )
            return count

        return 0
