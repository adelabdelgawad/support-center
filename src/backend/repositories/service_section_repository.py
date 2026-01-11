"""
ServiceSection Repository for database operations.

Handles all database queries related to service sections.
"""
from typing import List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.database_models import ServiceSection, TechnicianSection, User
from repositories.base_repository import BaseRepository


class ServiceSectionRepository(BaseRepository[ServiceSection]):
    """Repository for ServiceSection database operations."""

    model = ServiceSection

    @classmethod
    async def find_all_active_sections(
        cls,
        db: AsyncSession,
        *,
        only_active: bool = True,
        only_shown: bool = True,
        order_by_id: bool = True,
        include_technicians: bool = False
    ) -> List[ServiceSection]:
        """
        Find all service sections with filtering.

        Args:
            db: Database session
            only_active: If True, return only active sections
            only_shown: If True, return only sections shown in forms
            order_by_id: If True, order results by ID
            include_technicians: If True, eager load technician assignments

        Returns:
            List of service sections
        """
        stmt = select(ServiceSection).where(ServiceSection.is_deleted == False)

        if only_active:
            stmt = stmt.where(ServiceSection.is_active == True)

        if only_shown:
            stmt = stmt.where(ServiceSection.is_shown == True)

        if include_technicians:
            stmt = stmt.options(selectinload(ServiceSection.technician_assignments).selectinload(TechnicianSection.technician))

        if order_by_id:
            stmt = stmt.order_by(ServiceSection.id)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_by_id_active(
        cls,
        db: AsyncSession,
        section_id: int
    ) -> Optional[ServiceSection]:
        """
        Find a service section by ID (excluding deleted).

        Args:
            db: Database session
            section_id: Section ID

        Returns:
            ServiceSection or None if not found or deleted
        """
        stmt = select(ServiceSection).where(
            ServiceSection.id == section_id,
            ServiceSection.is_deleted == False
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_name(
        cls,
        db: AsyncSession,
        name_en: Optional[str] = None,
        name_ar: Optional[str] = None
    ) -> Optional[ServiceSection]:
        """
        Find a service section by name (English or Arabic).

        Args:
            db: Database session
            name_en: English name
            name_ar: Arabic name

        Returns:
            ServiceSection or None if not found
        """
        if name_en:
            stmt = select(ServiceSection).where(
                ServiceSection.name_en == name_en,
                ServiceSection.is_deleted == False
            )
            result = await db.execute(stmt)
            section = result.scalar_one_or_none()
            if section:
                return section

        if name_ar:
            stmt = select(ServiceSection).where(
                ServiceSection.name_ar == name_ar,
                ServiceSection.is_deleted == False
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

        return None

    @classmethod
    async def list_sections_paginated(
        cls,
        db: AsyncSession,
        *,
        is_active: Optional[bool] = None,
        is_shown: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[ServiceSection], int]:
        """
        List service sections with pagination.

        Args:
            db: Database session
            is_active: Filter by active status
            is_shown: Filter by shown status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of sections, total count)
        """
        filters = {"is_deleted": False}
        if is_active is not None:
            filters["is_active"] = is_active
        if is_shown is not None:
            filters["is_shown"] = is_shown

        return await cls.find_paginated(
            db,
            page=page,
            per_page=per_page,
            filters=filters,
            order_by=ServiceSection.id
        )

    @classmethod
    async def toggle_active_status(
        cls,
        db: AsyncSession,
        section_id: int,
        is_active: bool,
        commit: bool = True
    ) -> Optional[ServiceSection]:
        """
        Toggle the active status of a service section.

        Args:
            db: Database session
            section_id: Section ID
            is_active: New active status
            commit: Whether to commit immediately

        Returns:
            Updated ServiceSection or None if not found
        """
        section = await cls.find_by_id_active(db, section_id)
        if not section:
            return None

        section.is_active = is_active

        if commit:
            await db.commit()
            await db.refresh(section)

        return section

    @classmethod
    async def toggle_shown_status(
        cls,
        db: AsyncSession,
        section_id: int,
        is_shown: bool,
        commit: bool = True
    ) -> Optional[ServiceSection]:
        """
        Toggle the shown status of a service section.

        Args:
            db: Database session
            section_id: Section ID
            is_shown: New shown status
            commit: Whether to commit immediately

        Returns:
            Updated ServiceSection or None if not found
        """
        section = await cls.find_by_id_active(db, section_id)
        if not section:
            return None

        section.is_shown = is_shown

        if commit:
            await db.commit()
            await db.refresh(section)

        return section

    @classmethod
    async def soft_delete(
        cls,
        db: AsyncSession,
        section_id: int,
        commit: bool = True
    ) -> bool:
        """
        Soft delete a service section.

        Args:
            db: Database session
            section_id: Section ID
            commit: Whether to commit immediately

        Returns:
            True if deleted, False if not found
        """
        section = await cls.find_by_id_active(db, section_id)
        if not section:
            return False

        section.is_deleted = True

        if commit:
            await db.commit()

        return True

    @classmethod
    async def find_section_technicians(
        cls,
        db: AsyncSession,
        section_id: int
    ) -> List[dict]:
        """
        Find all technicians assigned to a specific service section.

        Args:
            db: Database session
            section_id: Service section ID

        Returns:
            List of technician dictionaries with id, username, full_name, is_active
        """
        stmt = (
            select(User)
            .join(TechnicianSection, TechnicianSection.technician_id == User.id)
            .where(
                TechnicianSection.section_id == section_id,
                User.is_deleted == False,
                User.is_active == True,
                User.is_technician == True
            )
            .order_by(User.full_name, User.username)
        )

        result = await db.execute(stmt)
        technicians = result.scalars().all()

        return [
            {
                "id": str(tech.id),
                "username": tech.username,
                "full_name": tech.full_name,
                "is_active": tech.is_active
            }
            for tech in technicians
        ]
