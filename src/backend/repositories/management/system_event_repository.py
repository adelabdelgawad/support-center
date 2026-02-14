"""
Repository for SystemEvent database operations.
"""

from typing import List, Optional
from sqlmodel import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from db import SystemEvent
from repositories.base_repository import BaseRepository


class SystemEventRepository(BaseRepository[SystemEvent]):
    model = SystemEvent

    @classmethod
    async def find_paginated_with_filters(
        cls,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None,
    ) -> tuple[List[SystemEvent], int, int, int]:
        """
        Find system events with pagination and filters.

        Args:
            db: Database session
            skip: Number of records to skip (pagination offset)
            limit: Max records to return (1-100)
            is_active: Optional filter by active status

        Returns:
            Tuple of (events list, total count, active_count, inactive_count)
        """
        stmt = select(SystemEvent).options(selectinload(SystemEvent.system_message))

        if is_active is not None:
            stmt = stmt.where(SystemEvent.is_active == is_active)

        count_stmt = select(func.count()).select_from(SystemEvent)
        if is_active is not None:
            count_stmt = count_stmt.where(SystemEvent.is_active == is_active)

        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        stmt = stmt.offset(skip).limit(limit).order_by(SystemEvent.created_at.desc())
        result = await db.execute(stmt)
        events = result.scalars().all()

        active_count = sum(1 for e in events if e.is_active)
        inactive_count = len(events) - active_count

        return list(events), total, active_count, inactive_count

    @classmethod
    async def get_type_counts(cls, db: AsyncSession) -> dict:
        """
        Get counts of active and inactive system events.

        Args:
            db: Database session

        Returns:
            Dict with active_count and inactive_count
        """
        stmt = (
            select(func.count())
            .select_from(SystemEvent)
            .where(SystemEvent.is_active == True)
        )
        result = await db.execute(stmt)
        active_count = result.scalar() or 0

        stmt = (
            select(func.count())
            .select_from(SystemEvent)
            .where(SystemEvent.is_active == False)
        )
        result = await db.execute(stmt)
        inactive_count = result.scalar() or 0

        return {"active_count": active_count, "inactive_count": inactive_count}
