"""System Message Service for managing bilingual message templates."""

import logging
from typing import Any, cast, Dict, List, Optional

from sqlalchemy import desc
from sqlalchemy.ext.asyncio import AsyncSession

from db import SystemMessage
from api.repositories.setting.system_message_repository import SystemMessageRepository
from api.schemas.system_message import SystemMessageListResponse, SystemMessageRead

logger = logging.getLogger(__name__)


class SystemMessageService:
    """Service for managing and formatting system message templates."""

    def __init__(self, session: AsyncSession):
        """
        Initialize service with database session.

        Args:
            session: Database session
        """
        self.db = session

    async def list_messages(
        self,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None,
    ) -> SystemMessageListResponse:
        """List system messages with pagination and counts."""
        filters: dict[str, Any] = {}
        if is_active is not None:
            filters["is_active"] = is_active

        messages = await SystemMessageRepository.find_all(
            self.db,
            filters=filters,
            order_by=desc(cast(Any, SystemMessage.created_at)),
            offset=skip,
            limit=limit,
        )
        total = await SystemMessageRepository.count(self.db, filters=filters)
        active_count = await SystemMessageRepository.count(
            self.db, filters={"is_active": True}
        )
        inactive_count = await SystemMessageRepository.count(
            self.db, filters={"is_active": False}
        )
        return SystemMessageListResponse(
            messages=[SystemMessageRead.model_validate(m) for m in messages],
            total=total or 0,
            active_count=active_count or 0,
            inactive_count=inactive_count or 0,
        )

    async def get_by_id(self, message_id: int) -> Optional[SystemMessage]:
        """Get system message by ID."""
        return await SystemMessageRepository.find_by_id(self.db, message_id)

    async def create_message(self, message_data: Dict[str, Any]) -> SystemMessage:
        """Create a new system message. Caller must not pass is_active if not set."""
        existing = await SystemMessageRepository.find_one(
            self.db, filters={"message_type": message_data["message_type"]}
        )
        if existing:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"Message type '{message_data['message_type']}' already exists",
            )
        return await SystemMessageRepository.create(self.db, obj_in=message_data)

    async def update_message(
        self, message_id: int, update_data: Dict[str, Any]
    ) -> Optional[SystemMessage]:
        """Update a system message by ID."""
        return await SystemMessageRepository.update(
            self.db, id_value=message_id, obj_in=update_data
        )

    async def toggle_status(self, message_id: int) -> Optional[SystemMessage]:
        """Toggle is_active status of a system message."""
        message = await SystemMessageRepository.find_by_id(self.db, message_id)
        if not message:
            return None
        message.is_active = not message.is_active
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def bulk_update_status(
        self, message_ids: List[int], is_active: bool
    ) -> List[SystemMessage]:
        """Bulk update is_active for a list of message IDs."""
        from sqlmodel import select as sqlmodel_select
        stmt = sqlmodel_select(SystemMessage).where(
            SystemMessage.id.in_(message_ids)  # type: ignore[union-attr]
        )
        result = await self.db.execute(stmt)
        messages = list(result.scalars().all())
        if not messages:
            return []
        for message in messages:
            message.is_active = is_active
        await self.db.commit()
        for message in messages:
            await self.db.refresh(message)
        return messages

    async def delete_message(self, message_id: int) -> bool:
        """Hard-delete a system message. Returns True if deleted."""
        deleted = await SystemMessageRepository.delete(
            self.db, id_value=message_id, soft_delete=False
        )
        return bool(deleted)

    async def get_template(self, message_type: str) -> Optional[SystemMessage]:
        """
        Get a system message template by type.

        Args:
            message_type: Message type identifier (e.g., "new_request", "ticket_assigned")

        Returns:
            SystemMessage or None if not found
        """
        try:
            return await SystemMessageRepository.find_by_message_type(
                self.db, message_type
            )
        except Exception as e:
            logger.error(f"Failed to get template for {message_type}: {e}")
            return None

    @staticmethod
    def format_message(template: str, placeholders: Dict[str, str]) -> str:
        """
        Format a message template with placeholders.

        Args:
            template: Template string with {placeholder} syntax
            placeholders: Dictionary of placeholder values

        Returns:
            Formatted message string

        Example:
            template = "Status changed from '{old_status}' to '{new_status}'"
            placeholders = {"old_status": "Pending", "new_status": "In Progress"}
            returns: "Status changed from 'Pending' to 'In Progress'"
        """
        try:
            return template.format(**placeholders)
        except KeyError as e:
            logger.warning(f"Missing placeholder in template: {e}")
            return template
        except Exception as e:
            logger.error(f"Error formatting message template: {e}")
            return template

    async def get_bilingual_message(
        self, message_type: str, placeholders: Dict[str, str]
    ) -> tuple[str, str]:
        """
        Get formatted bilingual messages (English and Arabic).

        Args:
            message_type: Message type identifier
            placeholders: Dictionary of placeholder values

        Returns:
            Tuple of (english_message, arabic_message)

        Example:
            en, ar = await service.get_bilingual_message(
                "new_request",
                {"request_title": "Fix login issue", "requester_name": "John"}
            )
        """
        template = await self.get_template(message_type)

        if not template:
            # Fallback to simple message if template not found
            fallback = " -> ".join(placeholders.values())
            logger.warning(
                f"Template not found for message type: {message_type}, using fallback"
            )
            return fallback, fallback

        msg_en = self.format_message(template.template_en, placeholders)
        msg_ar = self.format_message(template.template_ar, placeholders)

        return msg_en, msg_ar
