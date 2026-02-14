"""
User Section CRUD operations using TechnicianSection table.

Users are linked to sections through the technician_sections table.
"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.repositories.base_repository import BaseRepository
from db import TechnicianSection


class UserSectionRepository(BaseRepository[TechnicianSection]):
    """Repository for user-section assignments via technician_sections table."""

    model = TechnicianSection

    @classmethod
    async def get_sections_for_user(
        cls,
        db: AsyncSession,
        user_id: UUID,
    ) -> List[TechnicianSection]:
        """Get all section assignments for a user with section details."""
        stmt = (
            select(TechnicianSection)
            .options(selectinload(TechnicianSection.section))
            .where(TechnicianSection.technician_id == user_id)
            .order_by(TechnicianSection.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_section_ids_for_user(cls, db: AsyncSession, user_id: UUID) -> List[int]:
        """Get all section IDs assigned to a user."""
        stmt = (
            select(TechnicianSection.section_id)
            .where(TechnicianSection.technician_id == user_id)
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    @classmethod
    async def get_assignment(
        cls,
        db: AsyncSession,
        user_id: UUID,
        section_id: int,
    ) -> Optional[TechnicianSection]:
        """Get a specific user-section assignment."""
        stmt = (
            select(TechnicianSection)
            .where(
                TechnicianSection.technician_id == user_id,
                TechnicianSection.section_id == section_id,
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def assign_section(
        cls,
        db: AsyncSession,
        user_id: UUID,
        section_id: int,
        assigned_by: UUID,
    ) -> TechnicianSection:
        """Assign a section to a user. Caller must commit."""
        assignment = TechnicianSection(
            technician_id=user_id,
            section_id=section_id,
            assigned_by=assigned_by,
        )
        db.add(assignment)
        await db.flush()
        await db.refresh(assignment)
        return assignment

    @classmethod
    async def remove_section(
        cls,
        db: AsyncSession,
        user_id: UUID,
        section_id: int,
    ) -> bool:
        """Remove a section assignment. Caller must commit."""
        stmt = (
            delete(TechnicianSection)
            .where(
                TechnicianSection.technician_id == user_id,
                TechnicianSection.section_id == section_id,
            )
        )
        result = await db.execute(stmt)
        return result.rowcount > 0

    @classmethod
    async def set_sections(
        cls,
        db: AsyncSession,
        user_id: UUID,
        section_ids: List[int],
        assigned_by: UUID,
    ) -> List[TechnicianSection]:
        """Replace all section assignments for a user. Caller must commit."""
        # Get existing assignments
        existing_ids = set(await cls.get_section_ids_for_user(db, user_id))
        new_ids = set(section_ids)

        # Remove assignments no longer in list
        to_remove = existing_ids - new_ids
        if to_remove:
            stmt = (
                delete(TechnicianSection)
                .where(
                    TechnicianSection.technician_id == user_id,
                    TechnicianSection.section_id.in_(to_remove),
                )
            )
            await db.execute(stmt)

        # Add new assignments
        to_add = new_ids - existing_ids
        for section_id in to_add:
            assignment = TechnicianSection(
                technician_id=user_id,
                section_id=section_id,
                assigned_by=assigned_by,
            )
            db.add(assignment)

        await db.flush()

        # Return updated list
        return await cls.get_sections_for_user(db, user_id)
