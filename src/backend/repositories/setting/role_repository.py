"""
Role repository with specialized queries.
"""

from typing import List, Optional, Set, Tuple

from db import Page, PageRole, Role, User, UserRole
from repositories.base_repository import BaseRepository
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


class RoleRepository(BaseRepository[Role]):
    model = Role

    @classmethod
    async def find_by_id_with_relations(
        cls,
        db: AsyncSession,
        role_id: int,
    ) -> Optional[Role]:
        """
        Find a role by ID with all relationships loaded.

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            Role with relationships or None
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

    @classmethod
    async def find_by_name(
        cls,
        db: AsyncSession,
        name: str,
    ) -> Optional[Role]:
        """
        Find a role by name.

        Args:
            db: Database session
            name: Role name

        Returns:
            Role or None
        """
        stmt = select(Role).where(Role.name == name)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_with_filters_paginated(
        cls,
        db: AsyncSession,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        page_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[Role], int, int, int]:
        """
        Find roles with filtering and pagination.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status
            page_id: Filter by page permission
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (roles with relationships, total, active_count, inactive_count)
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
        roles = list(result.scalars().all())

        return roles, total, active_count, inactive_count

    @classmethod
    async def toggle_active_status(
        cls,
        db: AsyncSession,
        role_id: int,
        updated_by: Optional[int] = None,
    ) -> Optional[Role]:
        """
        Toggle role active status.

        Args:
            db: Database session
            role_id: Role ID
            updated_by: ID of user toggling the status

        Returns:
            Updated role or None if not found
        """
        from datetime import datetime

        role = await cls.find_by_id(db, role_id)
        if not role:
            return None

        role.is_active = not role.is_active
        role.updated_at = datetime.utcnow()
        role.updated_by = updated_by

        await db.commit()
        await db.refresh(role)

        return role

    @classmethod
    async def soft_delete(
        cls,
        db: AsyncSession,
        role_id: int,
    ) -> bool:
        """
        Soft delete a role.

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            True if deleted, False if not found
        """
        from datetime import datetime

        role = await cls.find_by_id(db, role_id)
        if not role:
            return False

        role.is_deleted = True
        role.updated_at = datetime.utcnow()

        await db.commit()

        return True

    @classmethod
    async def get_existing_page_assignments(
        cls,
        db: AsyncSession,
        role_id: int,
    ) -> Set[int]:
        """
        Get existing page IDs assigned to a role.

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            Set of page IDs
        """
        stmt = select(PageRole.page_id).where(PageRole.role_id == role_id)
        result = await db.execute(stmt)
        return {row[0] for row in result.fetchall()}

    @classmethod
    async def assign_pages(
        cls,
        db: AsyncSession,
        role_id: int,
        page_ids: List[int],
        created_by: Optional[int] = None,
    ) -> int:
        """
        Assign pages to a role (only new assignments).

        Args:
            db: Database session
            role_id: Role ID
            page_ids: List of page IDs to assign
            created_by: ID of user creating the assignment

        Returns:
            Number of new assignments created
        """
        # Get existing assignments
        existing_page_ids = await cls.get_existing_page_assignments(db, role_id)

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

    @classmethod
    async def remove_pages(
        cls,
        db: AsyncSession,
        role_id: int,
        page_ids: List[int],
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
        stmt = delete(PageRole).where(
            PageRole.role_id == role_id, PageRole.page_id.in_(page_ids)
        )

        result = await db.execute(stmt)
        await db.commit()

        return result.rowcount

    @classmethod
    async def get_existing_user_assignments(
        cls,
        db: AsyncSession,
        role_id: int,
    ) -> Set[int]:
        """
        Get existing user IDs assigned to a role.

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            Set of user IDs
        """
        stmt = select(UserRole.user_id).where(UserRole.role_id == role_id)
        result = await db.execute(stmt)
        return {row[0] for row in result.fetchall()}

    @classmethod
    async def assign_users(
        cls,
        db: AsyncSession,
        role_id: int,
        user_ids: List[int],
        created_by: Optional[int] = None,
    ) -> int:
        """
        Assign users to a role (only new assignments).

        Args:
            db: Database session
            role_id: Role ID
            user_ids: List of user IDs to assign
            created_by: ID of user creating the assignment

        Returns:
            Number of new assignments created
        """
        # Get existing assignments
        existing_user_ids = await cls.get_existing_user_assignments(db, role_id)

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

    @classmethod
    async def remove_users(
        cls,
        db: AsyncSession,
        role_id: int,
        user_ids: List[int],
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
        stmt = delete(UserRole).where(
            UserRole.role_id == role_id, UserRole.user_id.in_(user_ids)
        )

        result = await db.execute(stmt)
        await db.commit()

        return result.rowcount

    @classmethod
    async def find_with_user_counts(
        cls,
        db: AsyncSession,
    ) -> Tuple[List[Role], int, int, int]:
        """
        Find all roles with user counts.

        Note: This method provides the base query structure.
        The service layer is responsible for building response DTOs
        with page_paths and total_users.

        Args:
            db: Database session

        Returns:
            Tuple of (list of roles, total, active_count, inactive_count)
        """
        # Build query
        stmt = select(Role).order_by(Role.name)

        # Build count query
        count_stmt = select(
            func.count(Role.id).label("total"),
            func.count(case((Role.is_active.is_(True), 1))).label("active_count"),
            func.count(case((Role.is_active.is_(False), 1))).label("inactive_count"),
        )

        # Get counts
        count_result = await db.execute(count_stmt)
        counts = count_result.one()
        total = counts.total or 0
        active_count = counts.active_count or 0
        inactive_count = counts.inactive_count or 0

        # Execute query
        result = await db.execute(stmt)
        roles = result.scalars().all()

        return list(roles), total, active_count, inactive_count

    @classmethod
    async def find_all_active(
        cls,
        db: AsyncSession,
    ) -> List[Role]:
        """
        Find all active roles.

        Args:
            db: Database session

        Returns:
            List of active roles
        """
        stmt = select(Role).where(Role.is_active).order_by(Role.name)

        result = await db.execute(stmt)
        roles = result.scalars().all()

        return list(roles)
