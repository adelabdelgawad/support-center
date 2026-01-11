"""
Page and PageRole service with performance optimizations.
Enhanced with centralized logging and error handling.

REFACTORED:
- Migrated database operations to PageRepository and PageRoleRepository (repository pattern)
"""
from datetime import datetime
from typing import List, Optional, Tuple
import logging
from uuid import UUID

from core.decorators import (
    safe_database_query,
    transactional_database_operation,
    log_database_operation,
)
from models import Page, PageRole, User
from repositories.page_repository import PageRepository, PageRoleRepository
from schemas.page import (
    PageCreate,
    PageUpdate,
    PageRoleCreate,
    PageRoleDetailedResponse,
)
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class PageService:
    """Service for managing pages with performance optimizations."""

    @staticmethod
    @transactional_database_operation("create_page")
    @log_database_operation("page creation", level="debug")
    async def create_page(
        db: AsyncSession, page_data: PageCreate, created_by: Optional[int] = None
    ) -> Page:
        """
        Create a new page.

        Args:
            db: Database session
            page_data: Page creation data
            created_by: ID of user creating the page

        Returns:
            Created page
        """
        obj_in = page_data.model_dump()
        if created_by:
            obj_in["created_by"] = created_by

        return await PageRepository.create(db, obj_in=obj_in, commit=True)

    @staticmethod
    @safe_database_query("get_page")
    @log_database_operation("page retrieval", level="debug")
    async def get_page(db: AsyncSession, page_id: int) -> Optional[Page]:
        """
        Get a page by ID with relationships.

        Args:
            db: Database session
            page_id: Page ID

        Returns:
            Page or None
        """
        return await PageRepository.find_by_id_with_permissions(db, page_id)

    @staticmethod
    @safe_database_query("get_page_by_path")
    @log_database_operation("page lookup by path", level="debug")
    async def get_page_by_path(db: AsyncSession, path: str) -> Optional[Page]:
        """
        Get a page by path.

        Args:
            db: Database session
            path: Page path

        Returns:
            Page or None
        """
        return await PageRepository.find_by_path(db, path)

    @staticmethod
    @safe_database_query("get_pages_for_user", default_return=([], 0))
    @log_database_operation("user page access", level="debug")
    async def get_pages_for_user(
        db: AsyncSession,
        user: User,
        title: Optional[str] = None,
        is_active: Optional[bool] = None,
        parent_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50,
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
        return await PageRepository.get_pages_for_user(
            db,
            user,
            title=title,
            is_active=is_active,
            parent_id=parent_id,
            page=page,
            per_page=per_page
        )

    @staticmethod
    @safe_database_query("list_pages", default_return=([], 0))
    @log_database_operation("page listing", level="debug")
    async def list_pages(
        db: AsyncSession,
        title: Optional[str] = None,
        is_active: Optional[bool] = None,
        parent_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50,
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
        return await PageRepository.list_pages_paginated(
            db,
            title=title,
            is_active=is_active,
            parent_id=parent_id,
            page=page,
            per_page=per_page
        )

    @staticmethod
    @transactional_database_operation("update_page")
    @log_database_operation("page update", level="debug")
    async def update_page(
        db: AsyncSession,
        page_id: int,
        update_data: PageUpdate,
        updated_by: Optional[int] = None,
    ) -> Optional[Page]:
        """
        Update a page.

        Args:
            db: Database session
            page_id: Page ID
            update_data: Update data
            updated_by: ID of user updating the page

        Returns:
            Updated page or None
        """
        # Business logic: add updated_at and updated_by
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()
        if updated_by:
            update_dict["updated_by"] = updated_by

        return await PageRepository.update(
            db,
            id_value=page_id,
            obj_in=update_dict,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("delete_page")
    @log_database_operation("page deletion", level="debug")
    async def delete_page(db: AsyncSession, page_id: int) -> bool:
        """
        Delete a page (soft delete).

        Args:
            db: Database session
            page_id: Page ID

        Returns:
            True if deleted, False if not found
        """
        return await PageRepository.soft_delete(db, page_id, commit=True)


class PageRoleService:
    """Service for managing page-role permissions."""

    @staticmethod
    @transactional_database_operation("create_page_permission")
    @log_database_operation("page permission creation", level="debug")
    async def create_page_permission(
        db: AsyncSession,
        permission_data: PageRoleCreate,
        created_by: Optional[int] = None,
    ) -> PageRole:
        """
        Create a new page-role permission.

        Args:
            db: Database session
            permission_data: Permission creation data
            created_by: ID of user creating the permission

        Returns:
            Created permission
        """
        obj_in = permission_data.model_dump()
        if created_by:
            obj_in["created_by"] = created_by

        return await PageRoleRepository.create(db, obj_in=obj_in, commit=True)

    @staticmethod
    @safe_database_query("list_page_permissions", default_return=([], 0))
    @log_database_operation("page permission listing", level="debug")
    async def list_page_permissions(
        db: AsyncSession,
        page_id: Optional[int] = None,
        role_id: Optional[int] = None,
        include_inactive: bool = False,
        page: int = 1,
        per_page: int = 100,
    ) -> Tuple[List[PageRoleDetailedResponse], int]:
        """
        List page permissions with filtering.

        Args:
            db: Database session
            page_id: Filter by page ID
            role_id: Filter by role ID
            include_inactive: Include inactive permissions
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of permissions with details, total count)
        """
        permissions, total = await PageRoleRepository.list_page_permissions_paginated(
            db,
            page_id=page_id,
            role_id=role_id,
            include_inactive=include_inactive,
            page=page,
            per_page=per_page
        )

        # Business logic: Build detailed response
        permission_items = [
            PageRoleDetailedResponse(
                id=perm.id,
                role_id=perm.role_id,
                page_id=perm.page_id,
                is_active=perm.is_active,
                role_name=perm.role.name if perm.role else None,
                page_title=perm.page.title if perm.page else None,
            )
            for perm in permissions
        ]

        return permission_items, total

    @staticmethod
    @transactional_database_operation("deactivate_page_permission")
    @log_database_operation("page permission deactivation", level="debug")
    async def deactivate_page_permission(
        db: AsyncSession, permission_id: int, updated_by: Optional[int] = None
    ) -> Optional[PageRole]:
        """
        Deactivate a page permission.

        Args:
            db: Database session
            permission_id: Permission ID
            updated_by: ID of user deactivating the permission

        Returns:
            Updated permission or None
        """
        return await PageRoleRepository.toggle_active_status(
            db,
            permission_id,
            is_active=False,
            updated_by=updated_by,
            commit=True
        )

    @staticmethod
    @transactional_database_operation("activate_page_permission")
    @log_database_operation("page permission activation", level="debug")
    async def activate_page_permission(
        db: AsyncSession, permission_id: int, updated_by: Optional[int] = None
    ) -> Optional[PageRole]:
        """
        Activate a page permission.

        Args:
            db: Database session
            permission_id: Permission ID
            updated_by: ID of user activating the permission

        Returns:
            Updated permission or None
        """
        return await PageRoleRepository.toggle_active_status(
            db,
            permission_id,
            is_active=True,
            updated_by=updated_by,
            commit=True
        )
