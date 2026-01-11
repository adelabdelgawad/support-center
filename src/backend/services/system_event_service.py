"""System Event Service for CRUD operations on system events."""

import logging
from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import (
    safe_database_query,
    log_database_operation,
    transactional_database_operation,
)
from models import SystemEvent, SystemMessage
from repositories.system_event_repository import SystemEventRepository
from schemas.system_event.system_event import (
    SystemEventCreate,
    SystemEventUpdate,
)

logger = logging.getLogger(__name__)


class SystemEventService:
    """Service for managing system events."""

    @staticmethod
    @safe_database_query("get_event_by_key", default_return=None)
    @log_database_operation("get system event by key", level="debug")
    async def get_event_by_key(
        db: AsyncSession, event_key: str
    ) -> Optional[SystemEvent]:
        """Get active system event by event_key."""
        return await SystemEventRepository.find_by_event_key(
            db, event_key, include_message=True
        )

    @staticmethod
    @safe_database_query("get_event_by_id", default_return=None)
    @log_database_operation("get system event by id", level="debug")
    async def get_event_by_id(db: AsyncSession, event_id: int) -> Optional[SystemEvent]:
        """Get system event by ID with eager loaded relationships."""
        stmt = select(SystemEvent).where(SystemEvent.id == event_id).options(
            selectinload(SystemEvent.system_message),
            selectinload(SystemEvent.creator),
            selectinload(SystemEvent.updater),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("list_events", default_return=([], 0))
    @log_database_operation("list system events", level="debug")
    async def list_events(
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None
    ) -> Tuple[List[SystemEvent], int]:
        """
        List system events with pagination.

        Returns:
            Tuple of (events_list, total_count)
        """
        stmt = select(SystemEvent).options(selectinload(SystemEvent.system_message))

        if is_active is not None:
            stmt = stmt.where(SystemEvent.is_active == is_active)

        # Get total count
        count_stmt = select(func.count()).select_from(SystemEvent)
        if is_active is not None:
            count_stmt = count_stmt.where(SystemEvent.is_active == is_active)

        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = stmt.offset(skip).limit(limit).order_by(SystemEvent.created_at.desc())
        result = await db.execute(stmt)
        events = result.scalars().all()

        return list(events), total

    @staticmethod
    @transactional_database_operation(operation_name="create_event")
    @log_database_operation("create system event", level="info")
    async def create_event(
        db: AsyncSession, event_data: SystemEventCreate
    ) -> SystemEvent:
        """Create a new system event."""
        # Verify system_message exists if provided
        if event_data.system_message_id:
            stmt = select(SystemMessage).where(
                SystemMessage.id == event_data.system_message_id
            )
            result = await db.execute(stmt)
            system_message = result.scalar_one_or_none()

            if not system_message:
                raise ValueError(
                    f"SystemMessage {event_data.system_message_id} not found"
                )

        # Create event
        event_dict = event_data.model_dump()
        event = SystemEvent(**event_dict)
        db.add(event)
        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        stmt = select(SystemEvent).where(SystemEvent.id == event.id).options(
            selectinload(SystemEvent.system_message)
        )
        result = await db.execute(stmt)
        return result.scalar_one()

    @staticmethod
    @transactional_database_operation(operation_name="update_event")
    @log_database_operation("update system event", level="info")
    async def update_event(
        db: AsyncSession, event_id: int, event_data: SystemEventUpdate
    ) -> Optional[SystemEvent]:
        """Update system event."""
        # Get existing event
        stmt = select(SystemEvent).where(SystemEvent.id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            return None

        update_dict = event_data.model_dump(exclude_unset=True)

        # Verify new system_message if provided
        if "system_message_id" in update_dict and update_dict["system_message_id"]:
            stmt = select(SystemMessage).where(
                SystemMessage.id == update_dict["system_message_id"]
            )
            result = await db.execute(stmt)
            if not result.scalar_one_or_none():
                raise ValueError(
                    f"SystemMessage {update_dict['system_message_id']} not found"
                )

        # Update fields
        for field, value in update_dict.items():
            setattr(event, field, value)

        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        stmt = select(SystemEvent).where(SystemEvent.id == event.id).options(
            selectinload(SystemEvent.system_message)
        )
        result = await db.execute(stmt)
        return result.scalar_one()

    @staticmethod
    @transactional_database_operation(operation_name="delete_event")
    @log_database_operation("delete system event", level="warn")
    async def delete_event(db: AsyncSession, event_id: int) -> bool:
        """Delete system event (hard delete - use with caution)."""
        stmt = select(SystemEvent).where(SystemEvent.id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            return False

        await db.delete(event)
        await db.commit()
        return True

    @staticmethod
    @transactional_database_operation(operation_name="toggle_event_status")
    @log_database_operation("toggle event status", level="info")
    async def toggle_event_status(
        db: AsyncSession, event_id: int
    ) -> Optional[SystemEvent]:
        """Toggle is_active status."""
        stmt = select(SystemEvent).where(SystemEvent.id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()

        if not event:
            return None

        event.is_active = not event.is_active
        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        stmt = select(SystemEvent).where(SystemEvent.id == event.id).options(
            selectinload(SystemEvent.system_message)
        )
        result = await db.execute(stmt)
        return result.scalar_one()
