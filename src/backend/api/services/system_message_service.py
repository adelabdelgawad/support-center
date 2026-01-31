"""System Message Service for managing bilingual message templates."""

import logging
from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import SystemMessage

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

    async def get_template(
        self, message_type: str
    ) -> Optional[SystemMessage]:
        """
        Get a system message template by type.

        Args:
            message_type: Message type identifier (e.g., "new_request", "ticket_assigned")

        Returns:
            SystemMessage or None if not found
        """
        try:
            stmt = select(SystemMessage).where(
                (SystemMessage.message_type == message_type)
                & (SystemMessage.is_active)
            )
            result = await self.db.execute(stmt)
            return result.scalar_one_or_none()
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
        self,
        message_type: str,
        placeholders: Dict[str, str]
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
            logger.warning(f"Template not found for message type: {message_type}, using fallback")
            return fallback, fallback

        msg_en = self.format_message(template.template_en, placeholders)
        msg_ar = self.format_message(template.template_ar, placeholders)

        return msg_en, msg_ar
