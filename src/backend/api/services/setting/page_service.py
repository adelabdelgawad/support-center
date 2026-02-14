"""
Page service for managing pages and page permissions.

Handles business logic for page CRUD operations and page-role permission assignments.
"""

import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db.models import Page, PageRole, User
from api.repositories.setting.page_repository import PageRepository, PageRoleRepository
from api.schemas.page import (
    PageCreate,
    PageUpdate,
    PageRoleCreate,
)

logger = logging.getLogger(__name__)


class PageService:
    """Service for managing pages and page permissions."""

    @staticmethod
    @transactional_database_operation("create_page")
    @log_database_operation("create page", level="info")
    async def create_page(
        db: AsyncSession,
        page_data: PageCreate,
        created_by: int,
    ) -> Page:
        """
        Create a new page.

        Args:
            db: Database session
            page_data: Page creation data
            created_by: User ID creating the page

        Returns:
            Created page

        Raises:
            ValueError: If page path already exists
        """
        # Check if path exists
        if page_data.path:
            existing = await PageRepository.find_by_path(db, page_data.path)
            if existing:
                raise ValueError("Page path already exists")

        obj_in = page_data.model_dump()
        obj_in["created_by"] = created_by
        page = await PageRepository.create(db, obj_in=obj_in, commit=True)

        logger.info(f"Created page: {page.title} (ID: {page.id})")
        return page

    @staticmethod
    @safe_database_query("get_pages_for_user", default_return=([], 0))
    @log_database_operation("get pages for user", level="debug")
    async def get_pages_for_user(
        db: AsyncSession,
        current_user: User,
        title: Optional[str] = None,
        is_active: Optional[bool] = None,
        parent_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[Page], int]:
        """
        Get pages accessible to a user.

        Super admins see all pages. Regular users see only pages they have
        access to via their assigned roles.

        Args:
            db: Database session
            current_user: Current user
            title: Optional partial title match filter
            is_active: Optional boolean status filter
            parent_id: Optional parent page filter
            page: Page number (1-indexed)
            per_page: Items per page (max 100)

        Returns:
            Tuple of (list of accessible pages, total count)
        """
        return await PageRepository.get_pages_for_user(
            db,
            current_user,
            title=title,
            is_active=is_active,
            parent_id=parent_id,
            page=page,
            per_page=per_page,
        )

    @staticmethod
    @safe_database_query("get_page_by_id", default_return=None)
    @log_database_operation("get page by ID", level="debug")
    async def get_page_by_id(db: AsyncSession, page_id: int) -> Optional[Page]:
        """
        Get a page by ID with permissions.

        Args:
            db: Database session
            page_id: Page ID

        Returns:
            Page with permissions or None if not found
        """
        return await PageRepository.find_by_id_with_permissions(db, page_id)

    @staticmethod
    @transactional_database_operation("update_page")
    @log_database_operation("update page", level="info")
    async def update_page(
        db: AsyncSession,
        page_id: int,
        update_data: PageUpdate,
        updated_by: int,
    ) -> Optional[Page]:
        """
        Update a page.

        Args:
            db: Database session
            page_id: Page ID
            update_data: Fields to update
            updated_by: User ID updating the page

        Returns:
            Updated page or None if not found

        Raises:
            ValueError: If page path already exists (when updating path)
        """
        # If path is being updated, check it doesn't conflict
        if update_data.path:
            existing = await PageRepository.find_by_path(db, update_data.path)
            if existing and existing.id != page_id:
                raise ValueError("Page path already exists")

        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()
        update_dict["updated_by"] = updated_by

        page = await PageRepository.update(
            db, id_value=page_id, obj_in=update_dict, commit=True
        )

        if page:
            logger.info(f"Updated page: {page.title} (ID: {page.id})")

        return page

    @staticmethod
    @transactional_database_operation("delete_page")
    @log_database_operation("delete page", level="info")
    async def delete_page(db: AsyncSession, page_id: int) -> bool:
        """
        Delete a page (soft delete).

        Args:
            db: Database session
            page_id: Page ID

        Returns:
            True if deleted, False if not found
        """
        success = await PageRepository.soft_delete(db, page_id, commit=True)

        if success:
            logger.info(f"Soft deleted page ID: {page_id}")

        return success

    # =========================================================================
    # PAGE PERMISSION METHODS
    # =========================================================================

    @staticmethod
    @safe_database_query("list_page_permissions", default_return=([], 0))
    @log_database_operation("list page permissions", level="debug")
    async def list_page_permissions(
        db: AsyncSession,
        page_id: Optional[int] = None,
        role_id: Optional[UUID] = None,
        include_inactive: bool = False,
        page: int = 1,
        per_page: int = 100,
    ) -> Tuple[List[PageRole], int]:
        """
        List page permissions with filtering.

        Args:
            db: Database session
            page_id: Optional filter for specific page
            role_id: Optional filter for specific role
            include_inactive: Whether to include inactive permissions
            page: Page number (1-indexed)
            per_page: Items per page (max 200)

        Returns:
            Tuple of (list of permissions, total count)
        """
        return await PageRoleRepository.list_page_permissions_paginated(
            db,
            page_id=page_id,
            role_id=role_id,
            include_inactive=include_inactive,
            page=page,
            per_page=per_page,
        )

    @staticmethod
    @transactional_database_operation("create_page_permission")
    @log_database_operation("create page permission", level="info")
    async def create_page_permission(
        db: AsyncSession,
        permission_data: PageRoleCreate,
        created_by: int,
    ) -> PageRole:
        """
        Create a new page-role permission.

        Args:
            db: Database session
            permission_data: Permission creation data
            created_by: User ID creating the permission

        Returns:
            Created permission with relationships loaded
        """
        obj_in = permission_data.model_dump()
        obj_in["created_by"] = created_by

        permission = await PageRoleRepository.create(db, obj_in=obj_in, commit=True)

        # Load relationships
        permission_with_details = await PageRoleRepository.find_by_id_with_details(
            db, permission.id
        )

        logger.info(f"Created page permission ID: {permission.id}")

        return permission_with_details

    @staticmethod
    @transactional_database_operation("toggle_page_permission")
    @log_database_operation("toggle page permission", level="info")
    async def toggle_page_permission(
        db: AsyncSession,
        permission_id: int,
        is_active: bool,
        updated_by: int,
    ) -> Optional[PageRole]:
        """
        Toggle active status of a page permission.

        Args:
            db: Database session
            permission_id: Permission ID
            is_active: New active status
            updated_by: User ID updating the permission

        Returns:
            Updated PageRole or None if not found
        """
        permission = await PageRoleRepository.toggle_active_status(
            db, permission_id, is_active=is_active, updated_by=updated_by, commit=True
        )

        if permission:
            status = "activated" if is_active else "deactivated"
            logger.info(f"Page permission {status}: ID {permission.id}")

        return permission
