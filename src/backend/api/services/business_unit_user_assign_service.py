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
from db import BusinessUnit, BusinessUnitUserAssign, User
from api.schemas.business_unit_user_assign import (
    BusinessUnitUserAssignCreate,
    BusinessUnitUserAssignUpdate,
)
from repositories.setting.business_unit_user_assign_repository import BusinessUnitUserAssignRepository
from sqlalchemy.ext.asyncio import AsyncSession

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
        return await BusinessUnitUserAssignRepository.find_paginated_with_counts(
            db, user_id, business_unit_id, is_active, page, per_page
        )

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
        return await BusinessUnitUserAssignRepository.find_by_id_with_relationships(
            db, assignment_id
        )

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
        return await BusinessUnitUserAssignRepository.check_existing_assignment(
            db, user_id, business_unit_id
        )

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
        assignment = await BusinessUnitUserAssignRepository.find_by_id(db, assignment_id)

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
        return await BusinessUnitUserAssignRepository.toggle_status(
            db, assignment_id, updated_by
        )

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
        return await BusinessUnitUserAssignRepository.soft_delete(db, assignment_id)

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
        return await BusinessUnitUserAssignRepository.find_business_units_by_user(
            db, user_id, is_active
        )

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
        return await BusinessUnitUserAssignRepository.find_users_by_business_unit(
            db, business_unit_id, is_active
        )

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
        return await BusinessUnitUserAssignRepository.bulk_remove_users(
            db, user_ids, business_unit_id
        )
