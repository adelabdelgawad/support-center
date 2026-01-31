"""
Priority service with explicit error handling.
"""
import logging
from typing import List, Optional

from db import Priority
from api.schemas.priority import PriorityCreate, PriorityUpdate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class PriorityService:
    """Service for managing priorities."""

    def __init__(self, session: AsyncSession):
        """
        Initialize service with database session.

        Args:
            session: Database session
        """
        self.db = session

    async def list_priorities(
        self,
        active_only: bool = True
    ) -> List[Priority]:
        """
        List all priorities.

        Args:
            db: Database session
            active_only: Only return active priorities

        Returns:
            List of priorities
        """
        try:
            stmt = select(Priority).order_by(Priority.id)

            if active_only:
                stmt = stmt.where(Priority.is_active)

            result = await self.db.execute(stmt)
            priorities = result.scalars().all()

            return priorities
        except Exception as e:
            logger.error(f"Failed to list priorities: {e}")
            return []

    async def get_priority(
        self,
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
        try:
            stmt = select(Priority).where(Priority.id == priority_id)
            result = await self.db.execute(stmt)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Failed to get priority {priority_id}: {e}")
            return None

    async def create_priority(
        self,
        priority_data: PriorityCreate
    ) -> Priority:
        """
        Create a new priority.

        Args:
            db: Database session
            priority_data: Priority creation data

        Returns:
            Created priority

        Raises:
            Exception: If creation fails
        """
        try:
            priority = Priority(**priority_data.model_dump())
            self.db.add(priority)
            await self.db.commit()
            await self.db.refresh(priority)

            logger.info(f"Created priority: {priority.name_en}")
            return priority
        except Exception:
            await self.db.rollback()
            raise

    async def update_priority(
        self,
        priority_id: int,
        update_data: PriorityUpdate
    ) -> Optional[Priority]:
        """
        Update a priority.

        Args:
            db: Database session
            priority_id: Priority ID
            update_data: Update data

        Returns:
            Updated priority or None if not found

        Raises:
            Exception: If update fails
        """
        try:
            stmt = select(Priority).where(Priority.id == priority_id)
            result = await self.db.execute(stmt)
            priority = result.scalar_one_or_none()

            if not priority:
                return None

            update_dict = update_data.model_dump(exclude_unset=True)
            for field, value in update_dict.items():
                setattr(priority, field, value)

            await self.db.commit()
            await self.db.refresh(priority)

            logger.info(f"Updated priority {priority_id}")
            return priority
        except Exception:
            await self.db.rollback()
            raise

    async def delete_priority(
        self,
        priority_id: int
    ) -> bool:
        """
        Delete a priority (marks as inactive).

        Args:
            db: Database session
            priority_id: Priority ID

        Returns:
            True if deleted, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            stmt = select(Priority).where(Priority.id == priority_id)
            result = await self.db.execute(stmt)
            priority = result.scalar_one_or_none()

            if not priority:
                return False

            # Mark as inactive to preserve referential integrity
            priority.is_active = False
            await self.db.commit()

            logger.info(f"Deactivated priority {priority_id}")
            return True
        except Exception:
            await self.db.rollback()
            raise
