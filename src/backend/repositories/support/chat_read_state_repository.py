"""
Chat read state repository for managing ChatReadState model.

This repository handles all database operations for chat read state tracking.
"""

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db import ChatMessage, ChatReadState
from repositories.base_repository import BaseRepository


class ChatReadStateRepository(BaseRepository[ChatReadState]):
    """Repository for ChatReadState operations."""

    model = ChatReadState

    @classmethod
    async def find_by_request_and_user(
        cls, db: AsyncSession, request_id: UUID, user_id: int
    ) -> Optional[ChatReadState]:
        """
        Get or create a ChatReadState record for a user in a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User ID

        Returns:
            ChatReadState or None
        """
        stmt = select(ChatReadState).where(
            and_(
                ChatReadState.request_id == request_id,
                ChatReadState.user_id == user_id,
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_all_for_user(cls, db: AsyncSession, user_id: int) -> List[Dict]:
        """
        Get all chat read monitors for a user.

        Args:
            db: Database session
            user_id: User ID

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
                "last_read_at": row.last_read_at.isoformat()
                if row.last_read_at
                else None,
            }
            for row in rows
        ]

    @classmethod
    async def find_viewing_users(cls, db: AsyncSession, request_id: UUID) -> List[int]:
        """
        Get list of user IDs currently viewing a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID

        Returns:
            List of user IDs currently viewing chat
        """
        stmt = select(ChatReadState.user_id).where(
            and_(
                ChatReadState.request_id == request_id,
                ChatReadState.is_viewing,
            )
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    @classmethod
    async def find_existing_user_ids(cls, db: AsyncSession, request_id: UUID) -> set:
        """
        Get existing user IDs for a request.

        Args:
            db: Database session
            request_id: Service request (chat) ID

        Returns:
            Set of user IDs
        """
        stmt = select(ChatReadState.user_id).where(
            ChatReadState.request_id == request_id
        )
        result = await db.execute(stmt)
        return {row[0] for row in result.all()}

    @classmethod
    async def get_unread_count(
        cls, db: AsyncSession, request_id: UUID, user_id: int
    ) -> int:
        """
        Get unread count for a specific user in a specific chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User ID

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

    @classmethod
    async def get_total_unread_count(cls, db: AsyncSession, user_id: str) -> int:
        """
        Get total unread count across all chats for a user.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            Total number of unread messages across all chats
        """
        stmt = select(func.sum(ChatReadState.unread_count)).where(
            ChatReadState.user_id == user_id
        )
        result = await db.execute(stmt)
        total = result.scalar_one_or_none()
        return total or 0

    @classmethod
    async def mark_as_read(
        cls,
        db: AsyncSession,
        request_id: UUID,
        user_id: str,
        last_message_id: Optional[UUID] = None,
    ) -> Optional[ChatReadState]:
        """
        Mark a chat as fully read for a user.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User ID
            last_message_id: Optional ID of last read message

        Returns:
            Updated ChatReadState record
        """
        monitor = await cls.find_by_request_and_user(db, request_id, user_id)

        if not monitor:
            return None

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
                monitor.last_read_at = latest.created_at
            else:
                monitor.last_read_at = datetime.utcnow()
        else:
            stmt = select(ChatMessage.created_at).where(
                ChatMessage.id == last_message_id
            )
            result = await db.execute(stmt)
            timestamp = result.scalar_one_or_none()
            monitor.last_read_at = timestamp or datetime.utcnow()

        monitor.unread_count = 0
        monitor.last_read_message_id = last_message_id
        monitor.updated_at = datetime.utcnow()

        mark_read_stmt = (
            update(ChatMessage)
            .where(
                and_(
                    ChatMessage.request_id == request_id,
                    ChatMessage.sender_id != user_id,
                    not ChatMessage.is_read,
                )
            )
            .values(is_read=True)
        )
        await db.execute(mark_read_stmt)

        return monitor

    @classmethod
    async def set_viewing_status(
        cls,
        db: AsyncSession,
        request_id: UUID,
        user_id: str,
        is_viewing: bool,
    ) -> Optional[ChatReadState]:
        """
        Update whether a user is currently viewing a chat.

        Args:
            db: Database session
            request_id: Service request (chat) ID
            user_id: User ID
            is_viewing: True if user is viewing, False otherwise

        Returns:
            Updated ChatReadState record
        """
        now = datetime.utcnow()

        if not is_viewing:
            stmt = (
                insert(ChatReadState)
                .values(
                    request_id=request_id,
                    user_id=user_id,
                    is_viewing=False,
                    unread_count=0,
                    updated_at=now,
                )
                .on_conflict_do_update(
                    index_elements=["request_id", "user_id"],
                    set_={
                        "is_viewing": False,
                        "updated_at": now,
                    },
                )
                .returning(ChatReadState)
            )

            result = await db.execute(stmt)
            return result.scalar_one()

        monitor = await cls.find_by_request_and_user(db, request_id, user_id)

        if monitor is None:
            return None

        monitor.is_viewing = True
        monitor.updated_at = now
        monitor.unread_count = 0

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

        return monitor
