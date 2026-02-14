"""
Section service for managing service sections.

Handles business logic for service section read operations.
"""

import logging
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
)
from db.models import Section
from repositories.setting.section_repository import SectionRepository

logger = logging.getLogger(__name__)


class SectionService:
    """Service for managing service sections."""

    @staticmethod
    @safe_database_query("get_all_sections", default_return=[])
    @log_database_operation("get all sections", level="debug")
    async def get_all_sections(
        db: AsyncSession,
        only_active: bool = True,
        only_shown: bool = True,
        include_technicians: bool = False,
    ) -> List[Section]:
        """
        Get all service sections with optional filtering.

        Args:
            db: Database session
            only_active: If True, return only active sections (default: True)
            only_shown: If True, return only sections shown in forms (default: True)
            include_technicians: If True, include technician assignments

        Returns:
            List of service sections with optional technician data
        """
        sections = await SectionRepository.find_all_active_sections(
            db,
            only_active=only_active,
            only_shown=only_shown,
            order_by_id=True,
            include_technicians=include_technicians,
        )

        logger.debug(f"Retrieved {len(sections)} sections")
        return sections

    @staticmethod
    @safe_database_query("get_section_by_id", default_return=None)
    @log_database_operation("get section by ID", level="debug")
    async def get_section_by_id(
        db: AsyncSession,
        section_id: int,
    ) -> Optional[Section]:
        """
        Get a specific service section by ID.

        Args:
            db: Database session
            section_id: Service section ID

        Returns:
            Service section or None if not found
        """
        section = await SectionRepository.find_by_id_active(db, section_id)

        if section:
            logger.debug(f"Retrieved section: {section.name} (ID: {section.id})")

        return section

    @staticmethod
    @safe_database_query("get_section_technicians", default_return=[])
    @log_database_operation("get section technicians", level="debug")
    async def get_section_technicians(
        db: AsyncSession,
        section_id: int,
    ) -> List[dict]:
        """
        Get all technicians assigned to a specific service section.

        Args:
            db: Database session
            section_id: Service section ID

        Returns:
            List of technician dictionaries with id, username, full_name, is_active
        """
        technicians = await SectionRepository.find_section_technicians(db, section_id)

        logger.debug(f"Retrieved {len(technicians)} technicians for section {section_id}")
        return technicians
