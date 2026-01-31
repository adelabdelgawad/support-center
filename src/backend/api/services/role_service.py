"""
Role service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
from datetime import datetime
from typing import List, Optional, Tuple
import logging

from core.decorators import (
    safe_database_query,
    transactional_database_operation,
    log_database_operation,
)
from db import Role, UserRole, PageRole, User, Page
from api.schemas.role import (
    RoleCreate,
    RoleUpdate,
    RoleWithPagesAndUsers,
)
from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
        role = Role(**role_data.model_dump(), created_by=created_by)
        db.add(role)
        await db.commit()
        await db.refresh(role)

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
        stmt = (
            select(Role)
            .where(Role.id == role_id)
            .options(
                selectinload(Role.page_permissions).selectinload(PageRole.page),
                selectinload(Role.user_roles).selectinload(UserRole.user),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

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
        stmt = select(Role).where(Role.name == name)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

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
        # Build query
        stmt = select(Role).options(
            selectinload(Role.page_permissions).selectinload(PageRole.page),
            selectinload(Role.user_roles).selectinload(UserRole.user),
        )

        # Build count query
        count_stmt = select(
            func.count(Role.id).label("total"),
            func.count(case((Role.is_active.is_(True), 1))).label("active_count"),
            func.count(case((Role.is_active.is_(False), 1))).label("inactive_count"),
        )

        # Apply filters
        if name:
            name_filter = Role.name.ilike(f"%{name}%")
            stmt = stmt.where(name_filter)
            count_stmt = count_stmt.where(name_filter)

        if is_active is not None:
            stmt = stmt.where(Role.is_active == is_active)
            count_stmt = count_stmt.where(Role.is_active == is_active)

        if page_id is not None:
            stmt = stmt.join(PageRole).where(PageRole.page_id == page_id)
            count_stmt = count_stmt.join(PageRole).where(PageRole.page_id == page_id)
            stmt = stmt.distinct()

        # Get counts
        count_result = await db.execute(count_stmt)
        counts = count_result.one()
        total = counts.total or 0
        active_count = counts.active_count or 0
        inactive_count = counts.inactive_count or 0

        # Apply pagination
        stmt = (
            stmt.order_by(Role.name)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        roles = result.scalars().all()

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
        stmt = select(Role).where(Role.id == role_id)
        result = await db.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            return None

        # Update fields
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(role, field, value)

        role.updated_at = datetime.utcnow()
        role.updated_by = updated_by

        await db.commit()
        await db.refresh(role)

        return role

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
        stmt = select(Role).where(Role.id == role_id)
        result = await db.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            return None

        role.is_active = not role.is_active
        role.updated_at = datetime.utcnow()
        role.updated_by = updated_by

        await db.commit()
        await db.refresh(role)

        return role

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
        stmt = select(Role).where(Role.id == role_id)
        result = await db.execute(stmt)
        role = result.scalar_one_or_none()

        if not role:
            return False

        role.is_deleted = True
        role.updated_at = datetime.utcnow()

        await db.commit()

        return True

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
        # Get existing assignments
        existing_stmt = select(PageRole.page_id).where(PageRole.role_id == role_id)
        existing_result = await db.execute(existing_stmt)
        existing_page_ids = {row[0] for row in existing_result.fetchall()}

        # Find new page IDs
        new_page_ids = [pid for pid in page_ids if pid not in existing_page_ids]

        if not new_page_ids:
            return 0

        # Create new assignments
        page_roles = [
            PageRole(role_id=role_id, page_id=page_id, created_by=created_by)
            for page_id in new_page_ids
        ]

        db.add_all(page_roles)
        await db.commit()

        return len(new_page_ids)

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
        from sqlalchemy import delete

        stmt = delete(PageRole).where(
            PageRole.role_id == role_id, PageRole.page_id.in_(page_ids)
        )

        result = await db.execute(stmt)
        await db.commit()

        return result.rowcount

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
        # Get existing assignments
        existing_stmt = select(UserRole.user_id).where(UserRole.role_id == role_id)
        existing_result = await db.execute(existing_stmt)
        existing_user_ids = {row[0] for row in existing_result.fetchall()}

        # Find new user IDs
        new_user_ids = [uid for uid in user_ids if uid not in existing_user_ids]

        if not new_user_ids:
            return 0

        # Create new assignments
        user_roles = [
            UserRole(role_id=role_id, user_id=user_id, created_by=created_by)
            for user_id in new_user_ids
        ]

        db.add_all(user_roles)
        await db.commit()

        return len(new_user_ids)

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
        from sqlalchemy import delete

        stmt = delete(UserRole).where(
            UserRole.role_id == role_id, UserRole.user_id.in_(user_ids)
        )

        result = await db.execute(stmt)
        await db.commit()

        return result.rowcount
