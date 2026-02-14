"""
Business Unit User Assignment repository with specialized queries.
"""

from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from db import BusinessUnit, BusinessUnitUserAssign, User
from api.repositories.base_repository import BaseRepository
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


class BusinessUnitUserAssignRepository(BaseRepository[BusinessUnitUserAssign]):
    model = BusinessUnitUserAssign

    @classmethod
    async def find_by_technician(
        cls,
        db: AsyncSession,
        technician_id: int,
        is_active: bool = True,
    ) -> List[BusinessUnit]:
        """
        Get all business units assigned to a technician.

        Args:
            db: Database session
            technician_id: Technician ID (user ID)
            is_active: Filter by active assignments only

        Returns:
            List of business units
        """
        stmt = (
            select(BusinessUnit)
            .join(
                BusinessUnitUserAssign,
                BusinessUnit.id == BusinessUnitUserAssign.business_unit_id,
            )
            .where(
                and_(
                    BusinessUnitUserAssign.technician_id == technician_id,
                    not BusinessUnitUserAssign.is_deleted,
                )
            )
        )

        if is_active:
            stmt = stmt.where(BusinessUnitUserAssign.is_active)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def assign(
        cls,
        db: AsyncSession,
        technician_id: int,
        business_unit_id: int,
    ) -> BusinessUnitUserAssign:
        """
        Assign a technician to a business unit.

        Args:
            db: Database session
            technician_id: Technician ID (user ID)
            business_unit_id: Business unit ID

        Returns:
            Created assignment

        Raises:
            ValueError: If assignment already exists
        """
        # Check if assignment already exists
        stmt = select(BusinessUnitUserAssign).where(
            and_(
                BusinessUnitUserAssign.technician_id == technician_id,
                BusinessUnitUserAssign.business_unit_id == business_unit_id,
                not BusinessUnitUserAssign.is_deleted,
            )
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            raise ValueError(
                f"Technician {technician_id} is already assigned to business unit {business_unit_id}"
            )

        assignment = BusinessUnitUserAssign(
            technician_id=technician_id,
            business_unit_id=business_unit_id,
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)

        return assignment

    @classmethod
    async def unassign(
        cls,
        db: AsyncSession,
        technician_id: int,
        business_unit_id: int,
    ) -> bool:
        """
        Unassign a technician from a business unit.

        Args:
            db: Database session
            technician_id: Technician ID (user ID)
            business_unit_id: Business unit ID

        Returns:
            True if assignment was removed, False if not found
        """
        stmt = select(BusinessUnitUserAssign).where(
            and_(
                BusinessUnitUserAssign.technician_id == technician_id,
                BusinessUnitUserAssign.business_unit_id == business_unit_id,
                not BusinessUnitUserAssign.is_deleted,
            )
        )
        result = await db.execute(stmt)
        assignment = result.scalar_one_or_none()

        if not assignment:
            return False

        assignment.is_deleted = True
        await db.commit()

        return True

    @classmethod
    async def find_paginated_with_counts(
        cls,
        db: AsyncSession,
        user_id: Optional[UUID] = None,
        business_unit_id: Optional[int] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[BusinessUnitUserAssign], int, int, int]:
        """
        List business unit user assignments with filtering, pagination, and counts.

        Args:
            db: Database session
            user_id: Filter by user ID
            business_unit_id: Filter by business unit ID
            is_active: Filter by active status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of assignments, total, active_count, inactive_count)
        """
        # Build main query
        stmt = (
            select(BusinessUnitUserAssign)
            .where(not BusinessUnitUserAssign.is_deleted)
            .options(
                selectinload(BusinessUnitUserAssign.user),
                selectinload(BusinessUnitUserAssign.business_unit),
            )
        )

        # Build count query
        count_stmt = select(
            func.count(BusinessUnitUserAssign.id).label("total"),
            func.count(
                case((BusinessUnitUserAssign.is_active.is_(True), 1))
            ).label("active_count"),
            func.count(
                case((BusinessUnitUserAssign.is_active.is_(False), 1))
            ).label("inactive_count"),
        ).where(not BusinessUnitUserAssign.is_deleted)

        # Apply filters
        if user_id is not None:
            user_filter = BusinessUnitUserAssign.technician_id == user_id
            stmt = stmt.where(user_filter)
            count_stmt = count_stmt.where(user_filter)

        if business_unit_id is not None:
            bu_filter = BusinessUnitUserAssign.business_unit_id == business_unit_id
            stmt = stmt.where(bu_filter)
            count_stmt = count_stmt.where(bu_filter)

        if is_active is not None:
            active_filter = BusinessUnitUserAssign.is_active == is_active
            stmt = stmt.where(active_filter)
            count_stmt = count_stmt.where(active_filter)

        # Get counts
        count_result = await db.execute(count_stmt)
        counts = count_result.one()
        total = counts.total or 0
        active_count = counts.active_count or 0
        inactive_count = counts.inactive_count or 0

        # Apply pagination and ordering
        stmt = (
            stmt.order_by(BusinessUnitUserAssign.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        assignments = list(result.scalars().all())

        return assignments, total, active_count, inactive_count

    @classmethod
    async def find_by_id_with_relationships(
        cls, db: AsyncSession, assignment_id: int
    ) -> Optional[BusinessUnitUserAssign]:
        """
        Get a business unit user assignment by ID with relationships loaded.

        Args:
            db: Database session
            assignment_id: Assignment ID

        Returns:
            Assignment or None
        """
        stmt = (
            select(BusinessUnitUserAssign)
            .where(BusinessUnitUserAssign.id == assignment_id)
            .options(
                selectinload(BusinessUnitUserAssign.user),
                selectinload(BusinessUnitUserAssign.business_unit),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def check_existing_assignment(
        cls, db: AsyncSession, user_id: UUID, business_unit_id: int
    ) -> Optional[BusinessUnitUserAssign]:
        """
        Check if an assignment already exists for a user and business unit.

        Args:
            db: Database session
            user_id: User ID
            business_unit_id: Business unit ID

        Returns:
            Existing assignment or None
        """
        stmt = select(BusinessUnitUserAssign).where(
            and_(
                BusinessUnitUserAssign.technician_id == user_id,
                BusinessUnitUserAssign.business_unit_id == business_unit_id,
                not BusinessUnitUserAssign.is_deleted,
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def toggle_status(
        cls, db: AsyncSession, assignment_id: int, updated_by: Optional[UUID] = None
    ) -> Optional[BusinessUnitUserAssign]:
        """
        Toggle assignment active status.

        Args:
            db: Database session
            assignment_id: Assignment ID
            updated_by: ID of user toggling the status

        Returns:
            Updated assignment or None
        """
        assignment = await cls.find_by_id(db, assignment_id)

        if not assignment:
            return None

        assignment.is_active = not assignment.is_active
        assignment.updated_at = datetime.utcnow()
        assignment.updated_by = updated_by

        await db.commit()
        await db.refresh(assignment)

        return assignment

    @classmethod
    async def soft_delete(cls, db: AsyncSession, assignment_id: int) -> bool:
        """
        Delete a business unit user assignment (soft delete).

        Args:
            db: Database session
            assignment_id: Assignment ID

        Returns:
            True if deleted, False if not found
        """
        assignment = await cls.find_by_id(db, assignment_id)

        if not assignment:
            return False

        assignment.is_deleted = True
        assignment.updated_at = datetime.utcnow()

        await db.commit()

        return True

    @classmethod
    async def find_business_units_by_user(
        cls, db: AsyncSession, user_id: UUID, is_active: bool = True
    ) -> List[BusinessUnit]:
        """
        Get all business units assigned to a user.

        Args:
            db: Database session
            user_id: User ID
            is_active: Filter by active assignments only

        Returns:
            List of business units
        """
        stmt = (
            select(BusinessUnit)
            .join(
                BusinessUnitUserAssign,
                BusinessUnit.id == BusinessUnitUserAssign.business_unit_id,
            )
            .where(
                and_(
                    BusinessUnitUserAssign.technician_id == user_id,
                    not BusinessUnitUserAssign.is_deleted,
                )
            )
        )

        if is_active:
            stmt = stmt.where(BusinessUnitUserAssign.is_active)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_users_by_business_unit(
        cls, db: AsyncSession, business_unit_id: int, is_active: bool = True
    ) -> List[User]:
        """
        Get all users assigned to a business unit.

        Args:
            db: Database session
            business_unit_id: Business unit ID
            is_active: Filter by active assignments only

        Returns:
            List of users
        """
        stmt = (
            select(User)
            .join(
                BusinessUnitUserAssign,
                User.id == BusinessUnitUserAssign.technician_id,
            )
            .where(
                and_(
                    BusinessUnitUserAssign.business_unit_id == business_unit_id,
                    not BusinessUnitUserAssign.is_deleted,
                )
            )
        )

        if is_active:
            stmt = stmt.where(BusinessUnitUserAssign.is_active)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def bulk_remove_users(
        cls, db: AsyncSession, user_ids: List[UUID], business_unit_id: int
    ) -> int:
        """
        Bulk remove users from a business unit (soft delete).

        Args:
            db: Database session
            user_ids: List of user IDs
            business_unit_id: Business unit ID

        Returns:
            Number of assignments deleted
        """
        stmt = select(BusinessUnitUserAssign).where(
            and_(
                BusinessUnitUserAssign.technician_id.in_(user_ids),
                BusinessUnitUserAssign.business_unit_id == business_unit_id,
                not BusinessUnitUserAssign.is_deleted,
            )
        )
        result = await db.execute(stmt)
        assignments = result.scalars().all()

        for assignment in assignments:
            assignment.is_deleted = True
            assignment.updated_at = datetime.utcnow()

        await db.commit()

        return len(assignments)
