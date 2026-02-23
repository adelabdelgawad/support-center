"""
System Event Service for managing system event configurations.

This service handles system events that trigger automated actions like notifications
or workflows when specific conditions occur.
"""

import logging
from typing import Any, List, Optional, Tuple, cast

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import SystemEvent, SystemMessage
from api.repositories.management.system_event_repository import SystemEventRepository

logger = logging.getLogger(__name__)


class SystemEventService:
    """Service for managing system event configurations."""

    @staticmethod
    @safe_database_query("list_system_events", default_return=([], 0, 0, 0))
    @log_database_operation("list system events", level="debug")
    async def list_events(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None,
    ) -> Tuple[List[SystemEvent], int, int, int]:
        """
        List all system events with pagination.

        Args:
            db: Database session
            skip: Number of records to skip (pagination offset)
            limit: Max records to return (1-100)
            is_active: Optional filter by active status

        Returns:
            Tuple of (events list, total count, active_count, inactive_count)
        """
        return await SystemEventRepository.find_paginated_with_filters(
            db, skip=skip, limit=limit, is_active=is_active
        )

    @staticmethod
    @safe_database_query("get_system_event")
    @log_database_operation("get system event by ID", level="debug")
    async def get_event_by_id(
        db: AsyncSession, event_id: int
    ) -> Optional[SystemEvent]:
        """
        Get system event by ID with relationships loaded.

        Args:
            db: Database session
            event_id: Event ID

        Returns:
            SystemEvent with system_message, creator, updater loaded
        """
        stmt = select(SystemEvent).where(
            cast(ColumnElement[bool], SystemEvent.id == event_id)
        ).options(
            selectinload(cast(Any, SystemEvent.system_message)),
            selectinload(cast(Any, SystemEvent.creator)),
            selectinload(cast(Any, SystemEvent.updater)),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_system_event")
    @log_database_operation("create system event", level="info")
    async def create_event(
        db: AsyncSession,
        event_key: str,
        name: str,
        description: Optional[str] = None,
        system_message_id: Optional[int] = None,
        is_active: bool = True,
    ) -> SystemEvent:
        """
        Create a new system event.

        Args:
            db: Database session
            event_key: Unique key for event lookup
            name: Display name
            description: Optional description
            system_message_id: Optional associated system message template
            is_active: Active status (default: true)

        Returns:
            Created SystemEvent

        Raises:
            ValueError: If system_message not found
        """
        # Verify system_message exists if provided
        if system_message_id:
            msg_stmt = select(SystemMessage).where(cast(ColumnElement[bool], SystemMessage.id == system_message_id))
            msg_result = await db.execute(msg_stmt)
            if not msg_result.scalar_one_or_none():
                raise ValueError(f"SystemMessage {system_message_id} not found")

        # Create event
        event = SystemEvent(
            event_key=event_key,
            name=name,
            description=description,
            system_message_id=system_message_id,
            is_active=is_active,
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        event_stmt = select(SystemEvent).where(cast(ColumnElement[bool], SystemEvent.id == event.id)).options(
            selectinload(cast(Any, SystemEvent.system_message)),
            selectinload(cast(Any, SystemEvent.creator)),
            selectinload(cast(Any, SystemEvent.updater)),
        )
        result = await db.execute(event_stmt)
        return result.scalar_one()

    @staticmethod
    @transactional_database_operation("update_system_event")
    @log_database_operation("update system event", level="info")
    async def update_event(
        db: AsyncSession,
        event_id: int,
        event_key: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        system_message_id: Optional[int] = None,
        is_active: Optional[bool] = None,
    ) -> SystemEvent:
        """
        Update system event.

        All fields are optional. Only provided fields will be updated.

        Args:
            db: Database session
            event_id: Event ID
            event_key: Optional new event key
            name: Optional new name
            description: Optional new description
            system_message_id: Optional new system message
            is_active: Optional active status

        Returns:
            Updated SystemEvent

        Raises:
            ValueError: If event not found or system_message not found
        """
        # Get existing event
        event = await SystemEventRepository.find_by_id(db, event_id)
        if not event:
            raise ValueError(f"System event {event_id} not found")

        # Verify new system_message if provided
        if system_message_id is not None:
            msg_stmt = select(SystemMessage).where(cast(ColumnElement[bool], SystemMessage.id == system_message_id))
            msg_result = await db.execute(msg_stmt)
            if not msg_result.scalar_one_or_none():
                raise ValueError(f"SystemMessage {system_message_id} not found")

        # Update fields
        if event_key is not None:
            event.event_key = event_key
        if name is not None:
            event.name = name
        if description is not None:
            event.description = description
        if system_message_id is not None:
            event.system_message_id = system_message_id
        if is_active is not None:
            event.is_active = is_active

        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        event_stmt = select(SystemEvent).where(cast(ColumnElement[bool], SystemEvent.id == event.id)).options(
            selectinload(cast(Any, SystemEvent.system_message)),
            selectinload(cast(Any, SystemEvent.creator)),
            selectinload(cast(Any, SystemEvent.updater)),
        )
        event_result = await db.execute(event_stmt)
        return event_result.scalar_one()

    @staticmethod
    @transactional_database_operation("delete_system_event")
    @log_database_operation("delete system event", level="warning")
    async def delete_event(db: AsyncSession, event_id: int) -> bool:
        """
        Delete system event (hard delete).

        Args:
            db: Database session
            event_id: Event ID

        Returns:
            True if deleted, False if not found
        """
        event = await SystemEventRepository.find_by_id(db, event_id)
        if not event:
            return False

        await db.delete(event)
        await db.commit()
        return True

    @staticmethod
    @transactional_database_operation("toggle_system_event_status")
    @log_database_operation("toggle system event status", level="info")
    async def toggle_event_status(
        db: AsyncSession, event_id: int
    ) -> SystemEvent:
        """
        Toggle system event is_active status.

        Args:
            db: Database session
            event_id: Event ID

        Returns:
            Updated SystemEvent

        Raises:
            ValueError: If event not found
        """
        event = await SystemEventRepository.find_by_id(db, event_id)
        if not event:
            raise ValueError(f"System event {event_id} not found")

        event.is_active = not event.is_active
        await db.commit()
        await db.refresh(event)

        # Eager load relationships
        toggle_stmt = select(SystemEvent).where(cast(ColumnElement[bool], SystemEvent.id == event.id)).options(
            selectinload(cast(Any, SystemEvent.system_message)),
            selectinload(cast(Any, SystemEvent.creator)),
            selectinload(cast(Any, SystemEvent.updater)),
        )
        toggle_result = await db.execute(toggle_stmt)
        return toggle_result.scalar_one()

    @staticmethod
    @safe_database_query("get_event_by_key")
    @log_database_operation("get event by key", level="debug")
    async def get_event_by_key(
        db: AsyncSession, event_key: str
    ) -> Optional[SystemEvent]:
        """
        Get active system event by event_key.

        Args:
            db: Database session
            event_key: Event key identifier

        Returns:
            SystemEvent or None
        """
        stmt = select(SystemEvent).where(
            cast(ColumnElement[bool], SystemEvent.event_key == event_key),
            cast(ColumnElement[bool], SystemEvent.is_active == True),  # noqa: E712
        ).options(selectinload(cast(Any, SystemEvent.system_message)))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
