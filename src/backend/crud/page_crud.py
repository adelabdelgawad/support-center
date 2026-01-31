"""
Page CRUD for database operations.

Handles all database queries related to pages and page permissions.
"""
from typing import List, Optional, Tuple
from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import Page, PageRole, User, UserRole
from crud.base_repository import BaseCRUD


class PageCRUD(BaseCRUD[Page]):
    """CRUD for Page database operations."""

    model = Page

    @classmethod
    async def find_by_id_with_permissions(
        cls,
        db: AsyncSession,
        page_id: int
    ) -> Optional[Page]:
        """
        Find page by ID with permissions eagerly loaded.

        Args:
            db: Database session
            page_id: Page ID

        Returns:
            Page with permissions or None
        """
        stmt = (
            select(Page)
            .where(Page.id == page_id)
            .options(selectinload(Page.page_permissions).selectinload(PageRole.role))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_path(
        cls,
        db: AsyncSession,
        path: str
    ) -> Optional[Page]:
        """
        Find page by path.

        Args:
            db: Database session
            path: Page path

        Returns:
            Page or None
        """
        stmt = select(Page).where(Page.path == path)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def list_pages_paginated(
        cls,
        db: AsyncSession,
        *,
        title: Optional[str] = None,
        is_active: Optional[bool] = None,
        parent_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[Page], int]:
        """
        List pages with filtering and pagination.

        Args:
            db: Database session
            title: Filter by title (partial match)
            is_active: Filter by active status
            parent_id: Filter by parent page ID
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of pages, total count)
        """
        # Build query
        stmt = select(Page)
        count_stmt = select(func.count(Page.id))

        # Apply filters
        if title:
            title_filter = Page.title.ilike(f"%{title}%")
            stmt = stmt.where(title_filter)
            count_stmt = count_stmt.where(title_filter)

        if is_active is not None:
            stmt = stmt.where(Page.is_active == is_active)
            count_stmt = count_stmt.where(Page.is_active == is_active)

        if parent_id is not None:
            stmt = stmt.where(Page.parent_id == parent_id)
            count_stmt = count_stmt.where(Page.parent_id == parent_id)

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar()

        # Apply pagination
        stmt = (
            stmt.order_by(Page.title)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        pages = list(result.scalars().all())

        return pages, total

    @classmethod
    async def get_pages_for_user(
        cls,
        db: AsyncSession,
        user: User,
        *,
        title: Optional[str] = None,
        is_active: Optional[bool] = None,
        parent_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[Page], int]:
        """
        Get pages accessible to a user based on their permissions.
        Super admins get all pages, regular users get filtered pages.

        Args:
            db: Database session
            user: Current user
            title: Filter by title (partial match)
            is_active: Filter by active status
            parent_id: Filter by parent page ID
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of pages, total count)
        """
        # Super admins get all pages
        if user.is_super_admin:
            return await cls.list_pages_paginated(
                db,
                title=title,
                is_active=is_active,
                parent_id=parent_id,
                page=page,
                per_page=per_page
            )

        # Regular users: filter by their role permissions
        # Get user's roles
        user_roles_stmt = select(UserRole.role_id).where(UserRole.user_id == user.id)
        user_roles_result = await db.execute(user_roles_stmt)
        user_role_ids = [row[0] for row in user_roles_result.all()]

        if not user_role_ids:
            # User has no roles, return empty list
            return [], 0

        # Build query to get pages the user has access to via PageRole
        stmt = (
            select(Page)
            .join(PageRole, Page.id == PageRole.page_id)
            .where(PageRole.role_id.in_(user_role_ids))
            .where(PageRole.is_active.is_(True))
        )
        count_stmt = (
            select(func.count(func.distinct(Page.id)))
            .join(PageRole, Page.id == PageRole.page_id)
            .where(PageRole.role_id.in_(user_role_ids))
            .where(PageRole.is_active.is_(True))
        )

        # Apply filters
        if title:
            title_filter = Page.title.ilike(f"%{title}%")
            stmt = stmt.where(title_filter)
            count_stmt = count_stmt.where(title_filter)

        if is_active is not None:
            stmt = stmt.where(Page.is_active == is_active)
            count_stmt = count_stmt.where(Page.is_active == is_active)

        if parent_id is not None:
            stmt = stmt.where(Page.parent_id == parent_id)
            count_stmt = count_stmt.where(Page.parent_id == parent_id)

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar()

        # Apply pagination and distinct (user might have multiple roles with same page)
        stmt = (
            stmt.distinct()
            .order_by(Page.title)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        pages = list(result.scalars().all())

        return pages, total

    @classmethod
    async def soft_delete(
        cls,
        db: AsyncSession,
        page_id: int,
        commit: bool = True
    ) -> bool:
        """
        Soft delete a page.

        Args:
            db: Database session
            page_id: Page ID
            commit: Whether to commit immediately

        Returns:
            True if deleted, False if not found
        """
        page = await cls.find_by_id(db, page_id)
        if not page:
            return False

        page.is_deleted = True

        if commit:
            await db.commit()

        return True


class PageRoleCRUD(BaseCRUD[PageRole]):
    """CRUD for PageRole database operations."""

    model = PageRole

    @classmethod
    async def list_page_permissions_paginated(
        cls,
        db: AsyncSession,
        *,
        page_id: Optional[int] = None,
        role_id: Optional[UUID] = None,
        include_inactive: bool = False,
        page: int = 1,
        per_page: int = 100
    ) -> Tuple[List[PageRole], int]:
        """
        List page permissions with filtering and pagination.

        Args:
            db: Database session
            page_id: Filter by page ID
            role_id: Filter by role ID
            include_inactive: Include inactive permissions
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of permissions, total count)
        """
        # Build query with relationships
        stmt = select(PageRole).options(
            selectinload(PageRole.role),
            selectinload(PageRole.page)
        )
        count_stmt = select(func.count(PageRole.id))

        # Apply filters
        if page_id is not None:
            stmt = stmt.where(PageRole.page_id == page_id)
            count_stmt = count_stmt.where(PageRole.page_id == page_id)

        if role_id is not None:
            stmt = stmt.where(PageRole.role_id == role_id)
            count_stmt = count_stmt.where(PageRole.role_id == role_id)

        if not include_inactive:
            stmt = stmt.where(PageRole.is_active.is_(True))
            count_stmt = count_stmt.where(PageRole.is_active.is_(True))

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar()

        # Apply pagination
        stmt = stmt.offset((page - 1) * per_page).limit(per_page)

        # Execute query
        result = await db.execute(stmt)
        permissions = list(result.scalars().all())

        return permissions, total

    @classmethod
    async def find_by_id_with_details(
        cls,
        db: AsyncSession,
        permission_id: int
    ) -> Optional[PageRole]:
        """
        Find page permission by ID with role and page loaded.

        Args:
            db: Database session
            permission_id: Permission ID

        Returns:
            PageRole with relationships or None
        """
        stmt = (
            select(PageRole)
            .where(PageRole.id == permission_id)
            .options(selectinload(PageRole.role), selectinload(PageRole.page))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def toggle_active_status(
        cls,
        db: AsyncSession,
        permission_id: int,
        is_active: bool,
        updated_by: Optional[int] = None,
        commit: bool = True
    ) -> Optional[PageRole]:
        """
        Toggle active status of a page permission.

        Args:
            db: Database session
            permission_id: Permission ID
            is_active: New active status
            updated_by: ID of user updating
            commit: Whether to commit immediately

        Returns:
            Updated PageRole or None if not found
        """
        from datetime import datetime

        permission = await cls.find_by_id(db, permission_id)
        if not permission:
            return None

        permission.is_active = is_active
        permission.updated_at = datetime.utcnow()
        if updated_by:
            permission.updated_by = updated_by

        if commit:
            await db.commit()
            await db.refresh(permission)

        return permission
