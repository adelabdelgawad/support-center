"""
Priority service with explicit error handling.
"""

import logging
from typing import List, Optional

from db import Priority
from api.schemas.priority import PriorityCreate, PriorityUpdate
from sqlalchemy.ext.asyncio import AsyncSession
from repositories.setting.priority_repository import PriorityRepository

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

    async def list_priorities(self, active_only: bool = True) -> List[Priority]:
        """
        List all priorities.

        Args:
            db: Database session
            active_only: Only return active priorities

        Returns:
            List of priorities
        """
        try:
            return await PriorityRepository.find_all_ordered(self.db, active_only)
        except Exception as e:
            logger.error(f"Failed to list priorities: {e}")
            return []

    async def get_priority(self, priority_id: int) -> Optional[Priority]:
        """
        Get a priority by ID.

        Args:
            db: Database session
            priority_id: Priority ID

        Returns:
            Priority or None
        """
        try:
            return await PriorityRepository.find_by_id(self.db, priority_id)
        except Exception as e:
            logger.error(f"Failed to get priority {priority_id}: {e}")
            return None

    async def create_priority(self, priority_data: PriorityCreate) -> Priority:
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
            priority = await PriorityRepository.create(
                self.db, obj_in=priority_data.model_dump(), commit=True
            )
            logger.info(f"Created priority: {priority.name_en}")
            return priority
        except Exception:
            await self.db.rollback()
            raise

    async def update_priority(
        self, priority_id: int, update_data: PriorityUpdate
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
            priority = await PriorityRepository.update(
                self.db,
                id_value=priority_id,
                obj_in=update_data.model_dump(exclude_unset=True),
                commit=True,
            )
            logger.info(f"Updated priority {priority_id}")
            return priority
        except Exception:
            await self.db.rollback()
            raise

    async def delete_priority(self, priority_id: int) -> bool:
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
            priority = await PriorityRepository.find_by_id(self.db, priority_id)
            if not priority:
                return False

            await PriorityRepository.update(
                self.db, id_value=priority_id, obj_in={"is_active": False}, commit=True
            )
            logger.info(f"Deactivated priority {priority_id}")
            return True
        except Exception:
            await self.db.rollback()
            raise
