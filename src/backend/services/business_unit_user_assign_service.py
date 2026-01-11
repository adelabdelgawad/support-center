"""
Business Unit User Assignment service.
Manages assignment of technicians to business units.
"""
import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import BusinessUnit, BusinessUnitUserAssign, User
from schemas.business_unit_user_assign import (
    BusinessUnitUserAssignCreate,
    BusinessUnitUserAssignUpdate,
)
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class BusinessUnitUserAssignService:
    """Service for managing business unit user assignments."""

    @staticmethod
    @safe_database_query("list_business_unit_user_assigns", default_return=([], 0, 0, 0))
    @log_database_operation("business unit user assignment listing", level="debug")
    async def list_assignments(
        db: AsyncSession,
        user_id: Optional[UUID] = None,
        business_unit_id: Optional[int] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[BusinessUnitUserAssign], int, int, int]:
        """
        List business unit user assignments with filtering and pagination.

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
            .where(BusinessUnitUserAssign.is_deleted == False)
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
        ).where(BusinessUnitUserAssign.is_deleted == False)

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

    @staticmethod
    @safe_database_query("get_business_unit_user_assign")
    @log_database_operation("business unit user assignment retrieval", level="debug")
    async def get_assignment(
        db: AsyncSession, assignment_id: int
    ) -> Optional[BusinessUnitUserAssign]:
        """
        Get a business unit user assignment by ID.

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

    @staticmethod
    @safe_database_query("check_existing_assignment")
    @log_database_operation("checking existing assignment", level="debug")
    async def check_existing_assignment(
        db: AsyncSession, user_id: UUID, business_unit_id: int
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
                BusinessUnitUserAssign.is_deleted == False,
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_business_unit_user_assign")
    @log_database_operation("business unit user assignment creation", level="debug")
    async def create_assignment(
        db: AsyncSession,
        assignment_data: BusinessUnitUserAssignCreate,
        created_by: Optional[UUID] = None,
    ) -> BusinessUnitUserAssign:
        """
        Create a new business unit user assignment.

        Args:
            db: Database session
            assignment_data: Assignment creation data
            created_by: ID of user creating the assignment

        Returns:
            Created assignment

        Raises:
            ValueError: If assignment already exists
        """
        # Check if assignment already exists
        existing = await BusinessUnitUserAssignService.check_existing_assignment(
            db, assignment_data.user_id, assignment_data.business_unit_id
        )

        if existing:
            raise ValueError(
                f"User {assignment_data.user_id} is already assigned to business unit {assignment_data.business_unit_id}"
            )

        assignment = BusinessUnitUserAssign(
            technician_id=assignment_data.user_id,
            business_unit_id=assignment_data.business_unit_id,
            created_by=created_by
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)

        return assignment

    @staticmethod
    @transactional_database_operation("update_business_unit_user_assign")
    @log_database_operation("business unit user assignment update", level="debug")
    async def update_assignment(
        db: AsyncSession,
        assignment_id: int,
        update_data: BusinessUnitUserAssignUpdate,
        updated_by: Optional[UUID] = None,
    ) -> Optional[BusinessUnitUserAssign]:
        """
        Update a business unit user assignment.

        Args:
            db: Database session
            assignment_id: Assignment ID
            update_data: Update data
            updated_by: ID of user updating the assignment

        Returns:
            Updated assignment or None
        """
        stmt = select(BusinessUnitUserAssign).where(
            BusinessUnitUserAssign.id == assignment_id
        )
        result = await db.execute(stmt)
        assignment = result.scalar_one_or_none()

        if not assignment:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(assignment, field, value)

        assignment.updated_at = datetime.utcnow()
        assignment.updated_by = updated_by

        await db.commit()
        await db.refresh(assignment)

        return assignment

    @staticmethod
    @transactional_database_operation("toggle_assignment_status")
    @log_database_operation("assignment status toggle", level="debug")
    async def toggle_assignment_status(
        db: AsyncSession, assignment_id: int, updated_by: Optional[UUID] = None
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
        stmt = select(BusinessUnitUserAssign).where(
            BusinessUnitUserAssign.id == assignment_id
        )
        result = await db.execute(stmt)
        assignment = result.scalar_one_or_none()

        if not assignment:
            return None

        assignment.is_active = not assignment.is_active
        assignment.updated_at = datetime.utcnow()
        assignment.updated_by = updated_by

        await db.commit()
        await db.refresh(assignment)

        return assignment

    @staticmethod
    @transactional_database_operation("delete_business_unit_user_assign")
    @log_database_operation("business unit user assignment deletion", level="debug")
    async def delete_assignment(db: AsyncSession, assignment_id: int) -> bool:
        """
        Delete a business unit user assignment (soft delete).

        Args:
            db: Database session
            assignment_id: Assignment ID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(BusinessUnitUserAssign).where(
            BusinessUnitUserAssign.id == assignment_id
        )
        result = await db.execute(stmt)
        assignment = result.scalar_one_or_none()

        if not assignment:
            return False

        assignment.is_deleted = True
        assignment.updated_at = datetime.utcnow()

        await db.commit()

        return True

    @staticmethod
    @safe_database_query("get_user_business_units", default_return=[])
    @log_database_operation("get user's assigned business units", level="debug")
    async def get_user_business_units(
        db: AsyncSession, user_id: UUID, is_active: bool = True
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
                    BusinessUnitUserAssign.is_deleted == False,
                )
            )
        )

        if is_active:
            stmt = stmt.where(BusinessUnitUserAssign.is_active == True)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    @safe_database_query("get_business_unit_users", default_return=[])
    @log_database_operation("get business unit's assigned users", level="debug")
    async def get_business_unit_users(
        db: AsyncSession, business_unit_id: int, is_active: bool = True
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
                    BusinessUnitUserAssign.is_deleted == False,
                )
            )
        )

        if is_active:
            stmt = stmt.where(BusinessUnitUserAssign.is_active == True)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    @transactional_database_operation("bulk_assign_users_to_business_unit")
    @log_database_operation("bulk user assignment to business unit", level="debug")
    async def bulk_assign_users(
        db: AsyncSession,
        user_ids: List[UUID],
        business_unit_id: int,
        created_by: Optional[UUID] = None,
    ) -> List[BusinessUnitUserAssign]:
        """
        Bulk assign multiple users to a business unit.

        Args:
            db: Database session
            user_ids: List of user IDs
            business_unit_id: Business unit ID
            created_by: ID of user creating the assignments

        Returns:
            List of created assignments (skips duplicates)
        """
        created_assignments = []

        for user_id in user_ids:
            # Check if assignment already exists
            existing = await BusinessUnitUserAssignService.check_existing_assignment(
                db, user_id, business_unit_id
            )

            if existing:
                logger.info(
                    f"Skipping duplicate assignment: user {user_id} already assigned to BU {business_unit_id}"
                )
                continue

            assignment = BusinessUnitUserAssign(
                technician_id=user_id,
                business_unit_id=business_unit_id,
                created_by=created_by,
            )
            db.add(assignment)
            created_assignments.append(assignment)

        await db.commit()

        # Refresh all created assignments
        for assignment in created_assignments:
            await db.refresh(assignment)

        return created_assignments

    @staticmethod
    @transactional_database_operation("bulk_remove_users_from_business_unit")
    @log_database_operation("bulk user removal from business unit", level="debug")
    async def bulk_remove_users(
        db: AsyncSession, user_ids: List[UUID], business_unit_id: int
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
                BusinessUnitUserAssign.is_deleted == False,
            )
        )
        result = await db.execute(stmt)
        assignments = result.scalars().all()

        for assignment in assignments:
            assignment.is_deleted = True
            assignment.updated_at = datetime.utcnow()

        await db.commit()

        return len(assignments)
