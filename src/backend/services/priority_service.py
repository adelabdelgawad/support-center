"""
Priority service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
import logging
from typing import List, Optional

from core.decorators import (log_database_operation, safe_database_query,
                             transactional_database_operation)
from models import Priority
from schemas.priority import PriorityCreate, PriorityUpdate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class PriorityService:
    """Service for managing priorities."""

    @staticmethod
    @safe_database_query("list_priorities", default_return=[])
    @log_database_operation("priority listing", level="debug")
    async def list_priorities(
        db: AsyncSession,
        active_only: bool = True
    ) -> List[Priority]:
        """
        List all priorities with Redis caching.
        Cache TTL: 5 minutes (300 seconds)

        Args:
            db: Database session
            active_only: Only return active priorities

        Returns:
            List of priorities
        """
        # Build query
        stmt = select(Priority).order_by(Priority.id)

        if active_only:
            stmt = stmt.where(Priority.is_active == True)

        result = await db.execute(stmt)
        priorities = result.scalars().all()

        return priorities

    @staticmethod
    @safe_database_query("get_priority")
    @log_database_operation("priority retrieval", level="debug")
    async def get_priority(
        db: AsyncSession,
        priority_id: int
    ) -> Optional[Priority]:
        """
        Get a priority by ID.

        Args:
            db: Database session
            priority_id: Priority ID

        Returns:
            Priority or None
        """
        stmt = select(Priority).where(Priority.id == priority_id)
        result = await db.execute(stmt)
        priority = result.scalar_one_or_none()

        return priority

    @staticmethod
    @transactional_database_operation("create_priority")
    @log_database_operation("priority creation", level="debug")
    async def create_priority(
        db: AsyncSession,
        priority_data: PriorityCreate
    ) -> Priority:
        """
        Create a new priority and invalidate cache.

        Args:
            db: Database session
            priority_data: Priority creation data

        Returns:
            Created priority
        """
        priority = Priority(**priority_data.model_dump())
        db.add(priority)
        await db.commit()
        await db.refresh(priority)

        return priority

    @staticmethod
    @transactional_database_operation("update_priority")
    @log_database_operation("priority update", level="debug")
    async def update_priority(
        db: AsyncSession,
        priority_id: int,
        update_data: PriorityUpdate
    ) -> Optional[Priority]:
        """
        Update a priority and invalidate cache.

        Args:
            db: Database session
            priority_id: Priority ID
            update_data: Update data

        Returns:
            Updated priority or None
        """
        stmt = select(Priority).where(Priority.id == priority_id)
        result = await db.execute(stmt)
        priority = result.scalar_one_or_none()

        if not priority:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(priority, field, value)

        await db.commit()
        await db.refresh(priority)

        return priority

    @staticmethod
    @transactional_database_operation("delete_priority")
    @log_database_operation("priority deletion", level="debug")
    async def delete_priority(
        db: AsyncSession,
        priority_id: int
    ) -> bool:
        """
        Delete a priority (or mark as inactive) and invalidate cache.

        Args:
            db: Database session
            priority_id: Priority ID

        Returns:
            True if deleted/deactivated, False if not found
        """
        stmt = select(Priority).where(Priority.id == priority_id)
        result = await db.execute(stmt)
        priority = result.scalar_one_or_none()

        if not priority:
            return False

        # Instead of deleting, mark as inactive to preserve referential integrity
        priority.is_active = False
        await db.commit()

        return True
