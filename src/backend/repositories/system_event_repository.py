"""Repository for SystemEvent database operations."""

from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.database_models import SystemEvent
from repositories.base_repository import BaseRepository


class SystemEventRepository(BaseRepository[SystemEvent]):
    """Repository for system event operations."""

    model = SystemEvent

    @classmethod
    async def find_by_event_key(
        cls,
        db: AsyncSession,
        event_key: str,
        *,
        include_message: bool = True
    ) -> Optional[SystemEvent]:
        """
        Find system event by event_key.

        Args:
            db: Database session
            event_key: Unique event identifier
            include_message: Whether to eager load system_message relationship

        Returns:
            SystemEvent or None
        """
        stmt = select(SystemEvent).where(
            SystemEvent.event_key == event_key,
            SystemEvent.is_active == True
        )

        if include_message:
            stmt = stmt.options(selectinload(SystemEvent.system_message))

        result = await db.execute(stmt)
        return result.scalar_one_or_none()
