"""
User service with performance optimizations.
Enhanced with centralized logging and error handling.

REFACTORED:
- Replaced UserRole enum with is_technician boolean field
- Renamed get_online_agents to get_online_technicians
- Migrated database operations to UserRepository (repository pattern)
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    critical_database_operation,
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import User
from repositories.user_repository import UserRepository
from schemas.user.user import UserCreate, UserListItem, UserUpdate

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class UserService:
    """Service for managing users with performance optimizations."""

    @staticmethod
    @transactional_database_operation("create_user")
    @log_database_operation("user creation", level="debug")
    async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
        """
        Create a new user.

        Args:
            db: Database session
            user_data: User creation data

        Returns:
            Created user
        """
        # Business logic: validate unique constraints could go here
        # For now, delegate to repository
        user = await UserRepository.create(
            db, obj_in=user_data.model_dump(), commit=True
        )
        return user

    @staticmethod
    @safe_database_query("get_user")
    @log_database_operation("user retrieval", level="debug")
    async def get_user(db: AsyncSession, user_id: int) -> Optional[User]:
        """
        Get a user by ID with caching.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            User or None
        """
        return await UserRepository.find_by_id(db, user_id)

    @staticmethod
    @safe_database_query("get_user_by_username")
    @log_database_operation("user lookup by username", level="debug")
    async def get_user_by_username(
        db: AsyncSession, username: str
    ) -> Optional[User]:
        """
        Get a user by username.

        Args:
            db: Database session
            username: Username

        Returns:
            User or None
        """
        return await UserRepository.find_by_username(db, username)

    @staticmethod
    @safe_database_query("get_user_by_email")
    @log_database_operation("user lookup by email", level="debug")
    async def get_user_by_email(
        db: AsyncSession, email: str
    ) -> Optional[User]:
        """
        Get a user by email.

        Args:
            db: Database session
            email: Email address

        Returns:
            User or None
        """
        return await UserRepository.find_by_email(db, email)

    @staticmethod
    @safe_database_query("list_users", default_return=([], 0))
    @log_database_operation("user listing", level="debug")
    async def list_users(
        db: AsyncSession,
        is_technician: Optional[bool] = None,
        is_active: Optional[bool] = None,
        is_online: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[List[UserListItem], int]:
        """
        List users with filtering and pagination.

        Args:
            db: Database session
            is_technician: Filter by technician status
            is_active: Filter by active status
            is_online: Filter by online status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of users, total count)
        """
        # Delegate to repository
        users, total = await UserRepository.list_users_paginated(
            db,
            is_technician=is_technician,
            is_active=is_active,
            is_online=is_online,
            page=page,
            per_page=per_page,
        )

        # Convert to list items (business logic: data transformation)
        items = [UserListItem.model_validate(user) for user in users]

        return items, total

    @staticmethod
    @transactional_database_operation("update_user")
    @log_database_operation("user update", level="debug")
    async def update_user(
        db: AsyncSession, user_id: int, update_data: UserUpdate
    ) -> Optional[User]:
        """
        Update a user.

        Args:
            db: Database session
            user_id: User ID
            update_data: Update data

        Returns:
            Updated user or None
        """
        # Business logic: add updated_at timestamp
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()

        # Delegate to repository
        return await UserRepository.update(
            db, id_value=user_id, obj_in=update_dict, commit=True
        )

    @staticmethod
    @transactional_database_operation("update_online_status")
    @log_database_operation("online status update", level="debug")
    async def update_online_status(
        db: AsyncSession, user_id: str | UUID, is_online: bool
    ) -> Optional[User]:
        """
        Update user online status.

        Args:
            db: Database session
            user_id: User ID as UUID string or UUID object
            is_online: Online status

        Returns:
            Updated user or None
        """
        # Convert to string for consistency (repository will convert to UUID)
        user_id_str = str(user_id) if isinstance(user_id, UUID) else user_id

        # Business logic: update last_seen when status changes
        user = await UserRepository.update_online_status(
            db, user_id_str, is_online, commit=False
        )

        if user:
            user.last_seen = datetime.utcnow()
            await db.commit()
            await db.refresh(user)

        return user

    @staticmethod
    @transactional_database_operation("delete_user")
    @log_database_operation("user deletion", level="debug")
    async def delete_user(db: AsyncSession, user_id: int) -> bool:
        """
        Soft delete a user by marking them as deleted.
        Sets is_deleted = True instead of permanently deleting the record.
        This preserves data integrity and allows for recovery if needed.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            True if deleted, False if not found
        """
        return await UserRepository.soft_delete(db, user_id, commit=True)

    @staticmethod
    @safe_database_query("get_online_technicians", default_return=[])
    @log_database_operation("online technicians retrieval", level="debug")
    async def get_online_technicians(db: AsyncSession) -> List[UserListItem]:
        """
        Get all online technicians (including supervisors).

        Args:
            db: Database session

        Returns:
            List of online technicians
        """
        users = await UserRepository.get_online_technicians(db)

        # Convert to list items (business logic: data transformation)
        items = [UserListItem.model_validate(user) for user in users]

        return items
