"""
Repository for SystemMessage database operations.
"""

from typing import List, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from db import SystemMessage
from repositories.base_repository import BaseRepository


class SystemMessageRepository(BaseRepository[SystemMessage]):
    model = SystemMessage

    @classmethod
    async def find_by_message_type(
        cls, db: AsyncSession, message_type: str
    ) -> Optional[SystemMessage]:
        """
        Find an active system message by message type.

        Args:
            db: Database session
            message_type: Message type identifier

        Returns:
            SystemMessage or None if not found
        """
        stmt = select(SystemMessage).where(
            (SystemMessage.message_type == message_type) & (SystemMessage.is_active)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_active_messages(cls, db: AsyncSession) -> List[SystemMessage]:
        """
        Find all active system messages.

        Args:
            db: Database session

        Returns:
            List of active system messages
        """
        stmt = select(SystemMessage).where(SystemMessage.is_active)
        result = await db.execute(stmt)
        return list(result.scalars().all())
