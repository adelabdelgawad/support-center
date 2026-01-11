"""
ServiceSection service for business logic.

Handles business operations for service sections.
"""
from typing import List, Optional
import logging

from core.decorators import (
    safe_database_query,
    transactional_database_operation,
    log_database_operation
)
from models.database_models import ServiceSection
from repositories.service_section_repository import ServiceSectionRepository
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger
logger = logging.getLogger(__name__)


class ServiceSectionService:
    """Service for managing service sections."""

    @staticmethod
    @safe_database_query("get_service_sections", default_return=[])
    @log_database_operation("service sections retrieval", level="debug")
    async def get_service_sections(
        db: AsyncSession,
        *,
        only_active: bool = True,
        only_shown: bool = True,
        include_technicians: bool = False
    ) -> List[ServiceSection]:
        """
        Get all service sections with filtering.

        Args:
            db: Database session
            only_active: If True, return only active sections
            only_shown: If True, return only sections shown in forms
            include_technicians: If True, include technician assignments

        Returns:
            List of service sections
        """
        return await ServiceSectionRepository.find_all_active_sections(
            db,
            only_active=only_active,
            only_shown=only_shown,
            order_by_id=True,
            include_technicians=include_technicians
        )

    @staticmethod
    @safe_database_query("get_service_section")
    @log_database_operation("service section retrieval", level="debug")
    async def get_service_section(
        db: AsyncSession,
        section_id: int
    ) -> Optional[ServiceSection]:
        """
        Get a specific service section by ID.

        Args:
            db: Database session
            section_id: Section ID

        Returns:
            ServiceSection or None if not found
        """
        return await ServiceSectionRepository.find_by_id_active(db, section_id)

    @staticmethod
    @transactional_database_operation("create_service_section")
    @log_database_operation("service section creation", level="info")
    async def create_service_section(
        db: AsyncSession,
        section_data: dict,
        created_by: Optional[int] = None
    ) -> ServiceSection:
        """
        Create a new service section.

        Args:
            db: Database session
            section_data: Section data dictionary
            created_by: ID of user creating the section

        Returns:
            Created ServiceSection
        """
        # Business logic: Set created_by if provided
        if created_by:
            section_data["created_by"] = created_by

        return await ServiceSectionRepository.create(
            db,
            obj_in=section_data,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("update_service_section")
    @log_database_operation("service section update", level="info")
    async def update_service_section(
        db: AsyncSession,
        section_id: int,
        update_data: dict,
        updated_by: Optional[int] = None
    ) -> Optional[ServiceSection]:
        """
        Update a service section.

        Args:
            db: Database session
            section_id: Section ID
            update_data: Update data dictionary
            updated_by: ID of user updating the section

        Returns:
            Updated ServiceSection or None if not found
        """
        # Business logic: Set updated_by if provided
        if updated_by:
            update_data["updated_by"] = updated_by

        return await ServiceSectionRepository.update(
            db,
            id_value=section_id,
            obj_in=update_data,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("toggle_section_active_status")
    @log_database_operation("service section status toggle", level="info")
    async def toggle_active_status(
        db: AsyncSession,
        section_id: int,
        is_active: bool
    ) -> Optional[ServiceSection]:
        """
        Toggle the active status of a service section.

        Args:
            db: Database session
            section_id: Section ID
            is_active: New active status

        Returns:
            Updated ServiceSection or None if not found
        """
        return await ServiceSectionRepository.toggle_active_status(
            db,
            section_id,
            is_active,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("toggle_section_shown_status")
    @log_database_operation("service section shown toggle", level="info")
    async def toggle_shown_status(
        db: AsyncSession,
        section_id: int,
        is_shown: bool
    ) -> Optional[ServiceSection]:
        """
        Toggle the shown status of a service section.

        Args:
            db: Database session
            section_id: Section ID
            is_shown: New shown status

        Returns:
            Updated ServiceSection or None if not found
        """
        return await ServiceSectionRepository.toggle_shown_status(
            db,
            section_id,
            is_shown,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("delete_service_section")
    @log_database_operation("service section deletion", level="info")
    async def delete_service_section(
        db: AsyncSession,
        section_id: int
    ) -> bool:
        """
        Soft delete a service section.

        Args:
            db: Database session
            section_id: Section ID

        Returns:
            True if deleted, False if not found
        """
        return await ServiceSectionRepository.soft_delete(
            db,
            section_id,
            commit=True
        )

    @staticmethod
    @safe_database_query("check_section_exists")
    @log_database_operation("service section existence check", level="debug")
    async def section_exists(
        db: AsyncSession,
        name_en: Optional[str] = None,
        name_ar: Optional[str] = None
    ) -> bool:
        """
        Check if a service section exists by name.

        Args:
            db: Database session
            name_en: English name to check
            name_ar: Arabic name to check

        Returns:
            True if section exists
        """
        section = await ServiceSectionRepository.find_by_name(
            db,
            name_en=name_en,
            name_ar=name_ar
        )
        return section is not None

    @staticmethod
    @safe_database_query("get_section_technicians", default_return=[])
    @log_database_operation("section technicians retrieval", level="debug")
    async def get_section_technicians(
        db: AsyncSession,
        section_id: int
    ) -> List[dict]:
        """
        Get all technicians assigned to a specific service section.

        Args:
            db: Database session
            section_id: Service section ID

        Returns:
            List of technician dictionaries with id, username, full_name
        """
        return await ServiceSectionRepository.find_section_technicians(db, section_id)
