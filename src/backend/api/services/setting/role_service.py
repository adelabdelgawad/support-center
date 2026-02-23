"""
Role service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
from datetime import datetime
from typing import Any, List, Optional, Tuple, cast
from uuid import UUID
import logging

from core.decorators import (
    safe_database_query,
    transactional_database_operation,
    log_database_operation,
)
from db import Role, User, Page
from api.schemas.role import (
    RoleCreate,
    RoleUpdate,
    RoleWithPagesAndUsers,
)
from api.repositories.setting.role_repository import RoleRepository
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class RoleService:
    """Service for managing roles with performance optimizations."""

    @staticmethod
    @transactional_database_operation("create_role")
    @log_database_operation("role creation", level="debug")
    async def create_role(
        db: AsyncSession, role_data: RoleCreate, created_by: Optional[int] = None
    ) -> Role:
        """
        Create a new role.

        Args:
            db: Database session
            role_data: Role creation data
            created_by: ID of user creating the role

        Returns:
            Created role
        """
        role = await RoleRepository.create(
            db,
            obj_in={**role_data.model_dump(), "created_by": created_by},
            commit=True
        )
        return role

    @staticmethod
    @safe_database_query("get_role")
    @log_database_operation("role retrieval", level="debug")
    async def get_role(db: AsyncSession, role_id: int) -> Optional[Role]:
        """
        Get a role by ID with relationships.

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            Role or None
        """
        return await RoleRepository.find_by_id_with_relations(db, role_id)

    @staticmethod
    @safe_database_query("get_role_by_name")
    @log_database_operation("role lookup by name", level="debug")
    async def get_role_by_name(db: AsyncSession, name: str) -> Optional[Role]:
        """
        Get a role by name.

        Args:
            db: Database session
            name: Role name

        Returns:
            Role or None
        """
        return await RoleRepository.find_by_name(db, name)

    @staticmethod
    @safe_database_query("list_roles", default_return=([], 0, 0, 0))
    @log_database_operation("role listing", level="debug")
    async def list_roles(
        db: AsyncSession,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        page_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[RoleWithPagesAndUsers], int, int, int]:
        """
        List roles with filtering and pagination.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status
            page_id: Filter by page permission
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of roles with details, total, active_count, inactive_count)
        """
        # Get roles with relationships from repository
        roles, total, active_count, inactive_count = await RoleRepository.find_with_filters_paginated(
            db,
            name=name,
            is_active=is_active,
            page_id=page_id,
            page=page,
            per_page=per_page,
        )

        # Build response using already-loaded relationships (no N+1 queries)
        role_items = []
        for role in roles:
            # Extract active page paths from eagerly-loaded relationships
            page_paths = [
                perm.page.path
                for perm in role.page_permissions
                if perm.is_active and perm.page and perm.page.is_active and perm.page.path
            ]

            # Count users from eagerly-loaded relationships (include all users)
            total_users = len([
                ur for ur in role.user_roles
                if ur.user is not None
            ])

            role_items.append(
                RoleWithPagesAndUsers(
                    id=role.id,
                    name=role.name,
                    description=role.description,
                    is_active=role.is_active,
                    created_at=role.created_at,
                    updated_at=role.updated_at,
                    created_by=role.created_by,
                    updated_by=role.updated_by,
                    page_paths=page_paths,
                    total_users=total_users,
                )
            )

        return role_items, total, active_count, inactive_count

    @staticmethod
    @transactional_database_operation("update_role")
    @log_database_operation("role update", level="debug")
    async def update_role(
        db: AsyncSession,
        role_id: int,
        update_data: RoleUpdate,
        updated_by: Optional[int] = None,
    ) -> Optional[Role]:
        """
        Update a role.

        Args:
            db: Database session
            role_id: Role ID
            update_data: Update data
            updated_by: ID of user updating the role

        Returns:
            Updated role or None
        """
        # Update fields (filter None to protect NOT NULL columns)
        update_dict = {
            k: v
            for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        update_dict["updated_at"] = datetime.utcnow()
        update_dict["updated_by"] = updated_by

        return await RoleRepository.update(
            db,
            id_value=role_id,
            obj_in=update_dict,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("toggle_role_status")
    @log_database_operation("role status toggle", level="debug")
    async def toggle_role_status(
        db: AsyncSession, role_id: int, updated_by: Optional[int] = None
    ) -> Optional[Role]:
        """
        Toggle role active status.

        Args:
            db: Database session
            role_id: Role ID
            updated_by: ID of user toggling the status

        Returns:
            Updated role or None
        """
        return await RoleRepository.toggle_active_status(db, role_id, cast(Optional[UUID], updated_by))

    @staticmethod
    @transactional_database_operation("delete_role")
    @log_database_operation("role deletion", level="debug")
    async def delete_role(db: AsyncSession, role_id: int) -> bool:
        """
        Delete a role (soft delete).

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            True if deleted, False if not found
        """
        return await RoleRepository.soft_delete(db, role_id)

    @staticmethod
    @safe_database_query("get_role_pages", default_return=[])
    @log_database_operation("role pages retrieval", level="debug")
    async def get_role_pages(
        db: AsyncSession, role_id: int, include_inactive: bool = False
    ) -> List[Page]:
        """
        Get all pages accessible by a role.

        Args:
            db: Database session
            role_id: Role ID
            include_inactive: Include inactive pages

        Returns:
            List of pages
        """
        role = await RoleService.get_role(db, role_id)
        if not role:
            return []

        return await role.get_pages(include_inactive=include_inactive)

    @staticmethod
    @safe_database_query("get_role_users", default_return=[])
    @log_database_operation("role users retrieval", level="debug")
    async def get_role_users(
        db: AsyncSession, role_id: int, include_inactive: bool = False
    ) -> List[User]:
        """
        Get all users assigned to a role.

        Args:
            db: Database session
            role_id: Role ID
            include_inactive: Include inactive users

        Returns:
            List of users
        """
        role = await RoleService.get_role(db, role_id)
        if not role:
            return []

        return await role.get_users(include_inactive=include_inactive)

    @staticmethod
    @transactional_database_operation("assign_pages_to_role")
    @log_database_operation("role page assignment", level="debug")
    async def assign_pages_to_role(
        db: AsyncSession,
        role_id: int,
        page_ids: List[int],
        created_by: Optional[int] = None,
    ) -> int:
        """
        Assign pages to a role.

        Args:
            db: Database session
            role_id: Role ID
            page_ids: List of page IDs to assign
            created_by: ID of user creating the assignment

        Returns:
            Number of new assignments created
        """
        return await RoleRepository.assign_pages(db, role_id, page_ids, cast(Optional[UUID], created_by))

    @staticmethod
    @transactional_database_operation("remove_pages_from_role")
    @log_database_operation("role page removal", level="debug")
    async def remove_pages_from_role(
        db: AsyncSession, role_id: int, page_ids: List[int]
    ) -> int:
        """
        Remove pages from a role.

        Args:
            db: Database session
            role_id: Role ID
            page_ids: List of page IDs to remove

        Returns:
            Number of assignments removed
        """
        return await RoleRepository.remove_pages(db, role_id, page_ids)

    @staticmethod
    @transactional_database_operation("assign_users_to_role")
    @log_database_operation("role user assignment", level="debug")
    async def assign_users_to_role(
        db: AsyncSession,
        role_id: int,
        user_ids: List[int],
        created_by: Optional[int] = None,
    ) -> int:
        """
        Assign users to a role.

        Args:
            db: Database session
            role_id: Role ID
            user_ids: List of user IDs to assign
            created_by: ID of user creating the assignment

        Returns:
            Number of new assignments created
        """
        return await RoleRepository.assign_users(db, role_id, cast(List[UUID], user_ids), cast(Optional[UUID], created_by))

    @staticmethod
    @transactional_database_operation("remove_users_from_role")
    @log_database_operation("role user removal", level="debug")
    async def remove_users_from_role(
        db: AsyncSession, role_id: int, user_ids: List[int]
    ) -> int:
        """
        Remove users from a role.

        Args:
            db: Database session
            role_id: Role ID
            user_ids: List of user IDs to remove

        Returns:
            Number of assignments removed
        """
        return await RoleRepository.remove_users(db, role_id, cast(List[UUID], user_ids))
