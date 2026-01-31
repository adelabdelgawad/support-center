"""
Page and Page Permission API endpoints.

Provides endpoints for managing pages (UI routes) and page-role permissions.
Pages define the navigation structure and access control for the application.

**Architecture Note:**
Refactored to call CRUD directly - service layer removed.
Previous service layer was pure passthrough to PageCRUD/PageRoleCRUD,
so it was removed to simplify the architecture.

**Key Features:**
- Page CRUD operations (create, read, update, delete)
- Page-role permission management (which roles can access which pages)
- User-based page filtering (non-super-admins see only their accessible pages)
- Hierarchical page structure (parent_id for nested pages)
- Active/inactive status tracking
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from db.database import get_session
from core.dependencies import get_current_user
from crud.page_crud import PageCRUD, PageRoleCRUD
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from db import User
from api.schemas.page import (
    PageCreate,
    PageUpdate,
    PageRead,
    PageRoleCreate,
    PageRoleDetailedResponse,
    PageRoleListResponse,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# =============================================================================
# PAGE CRUD ENDPOINTS
# =============================================================================

@router.post("", response_model=PageRead, status_code=201)
async def create_page(
    page_data: PageCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new page.

    Args:
        page_data: Page creation data
            - path: URL path (e.g., '/admin/users')
            - title: Display title
            - description: Optional description
            - icon: Optional icon name
            - parent_id: Optional parent page ID for hierarchy
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated user

    Returns:
        PageRead: Created page

    Raises:
        HTTPException 400: Page path already exists
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        # Check if path exists
        if page_data.path:
            existing = await PageCRUD.find_by_path(db, page_data.path)
            if existing:
                raise HTTPException(status_code=400, detail="Page path already exists")

        obj_in = page_data.model_dump()
        obj_in["created_by"] = current_user.id
        page = await PageCRUD.create(db, obj_in=obj_in, commit=True)
        return page
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database error while creating page: {str(e)}"
        )


@router.get("", response_model=List[PageRead])
async def list_pages(
    response: Response,
    title: Optional[str] = Query(None, description="Filter by title (partial match)"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    parent_id: Optional[int] = Query(None, description="Filter by parent page ID"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List pages accessible to the current user.

    Super admins see all pages. Regular users see only pages they have
    access to via their assigned roles.

    Args:
        title: Optional partial title match filter
        is_active: Optional boolean status filter
        parent_id: Optional parent page filter
        page: Page number (1-indexed)
        per_page: Items per page (max 100)
        response: FastAPI response object (for X-Total-Count header)
        db: Database session
        current_user: Authenticated user

    Returns:
        List[PageRead]: List of accessible pages

    Raises:
        HTTPException 500: Database error

    **Permissions:** Authenticated users (filtered by role access)
    """
    try:
        pages, total = await PageCRUD.get_pages_for_user(
            db,
            current_user,
            title=title,
            is_active=is_active,
            parent_id=parent_id,
            page=page,
            per_page=per_page
        )
        response.headers["X-Total-Count"] = str(total)
        return pages
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=500, detail=f"Database error while listing pages: {str(e)}"
        )


@router.get("/{page_id}", response_model=PageRead)
async def get_page(page_id: int, db: AsyncSession = Depends(get_session)):
    """
    Get a page by ID with permissions.

    Returns the page details along with its role permissions.

    Args:
        page_id: Page ID
        db: Database session

    Returns:
        PageRead: Page with permissions

    Raises:
        HTTPException 404: Page not found
        HTTPException 500: Database error

    **Permissions:** No authentication required
    """
    try:
        page = await PageCRUD.find_by_id_with_permissions(db, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")
        return page
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=500, detail=f"Database error while fetching page: {str(e)}"
        )


@router.put("/{page_id}", response_model=PageRead)
async def update_page(
    page_id: int,
    update_data: PageUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update a page.

    All fields are optional. Only provided fields will be updated.
    If path is being updated, checks for duplicates.

    Args:
        page_id: Page ID
        update_data: Fields to update
            - path: Optional new path (must be unique)
            - title: Optional new title
            - description: Optional new description
            - icon: Optional new icon
            - parent_id: Optional new parent
            - is_active: Optional active status
        db: Database session
        current_user: Authenticated user

    Returns:
        PageRead: Updated page

    Raises:
        HTTPException 400: Page path already exists
        HTTPException 404: Page not found
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        # If path is being updated, check it doesn't conflict
        if update_data.path:
            existing = await PageCRUD.find_by_path(db, update_data.path)
            if existing and existing.id != page_id:
                raise HTTPException(status_code=400, detail="Page path already exists")

        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()
        update_dict["updated_by"] = current_user.id

        page = await PageCRUD.update(
            db, id_value=page_id, obj_in=update_dict, commit=True
        )
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")
        return page
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database error while updating page: {str(e)}"
        )


@router.delete("/{page_id}", status_code=204)
async def delete_page(
    page_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a page (soft delete).

    Marks the page as deleted without removing it from the database.
    Page permissions are preserved.

    Args:
        page_id: Page ID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Page not found
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        success = await PageCRUD.soft_delete(db, page_id, commit=True)
        if not success:
            raise HTTPException(status_code=404, detail="Page not found")
        return Response(status_code=204)
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database error while deleting page: {str(e)}"
        )


# =============================================================================
# PAGE PERMISSION ENDPOINTS
# =============================================================================

@router.get("/permissions", response_model=PageRoleListResponse)
async def list_page_permissions(
    page_id: Optional[int] = Query(None, description="Filter by page ID"),
    role_id: Optional[UUID] = Query(None, description="Filter by role ID"),
    include_inactive: bool = Query(False, description="Include inactive permissions"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(100, ge=1, le=200, description="Items per page (max 200)"),
    db: AsyncSession = Depends(get_session),
):
    """
    List page permissions with filtering.

    Returns page-role permission assignments with role and page details.

    Args:
        page_id: Optional filter for specific page
        role_id: Optional filter for specific role
        include_inactive: Whether to include inactive permissions
        page: Page number (1-indexed)
        per_page: Items per page (max 200)
        db: Database session

    Returns:
        PageRoleListResponse:
            - permissions: List of permissions with role_name and page_title
            - total: Total count

    Raises:
        HTTPException 500: Database error

    **Permissions:** No authentication required
    """
    try:
        permissions, total = await PageRoleCRUD.list_page_permissions_paginated(
            db,
            page_id=page_id,
            role_id=role_id,
            include_inactive=include_inactive,
            page=page,
            per_page=per_page
        )

        # Build detailed response
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

        return PageRoleListResponse(permissions=permission_items, total=total)
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=500, detail=f"Database error while listing permissions: {str(e)}"
        )


@router.post("/permissions", response_model=PageRoleDetailedResponse, status_code=201)
async def create_page_permission(
    permission_data: PageRoleCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new page-role permission.

    Grants a role access to a page.

    Args:
        permission_data: Permission creation data
            - role_id: Role UUID
            - page_id: Page ID
        db: Database session
        current_user: Authenticated user

    Returns:
        PageRoleDetailedResponse: Created permission with role_name and page_title

    Raises:
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        obj_in = permission_data.model_dump()
        obj_in["created_by"] = current_user.id

        permission = await PageRoleCRUD.create(db, obj_in=obj_in, commit=True)

        # Load relationships using repository
        permission_with_details = await PageRoleCRUD.find_by_id_with_details(
            db, permission.id
        )

        return PageRoleDetailedResponse(
            id=permission_with_details.id,
            role_id=permission_with_details.role_id,
            page_id=permission_with_details.page_id,
            is_active=permission_with_details.is_active,
            role_name=permission_with_details.role.name if permission_with_details.role else None,
            page_title=permission_with_details.page.title if permission_with_details.page else None,
        )
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database error while creating permission: {str(e)}"
        )


@router.delete("/permissions/{permission_id}", status_code=200)
async def deactivate_page_permission(
    permission_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Deactivate a page permission (soft delete).

    Marks the page-role permission as inactive without removing it.
    The permission can be reactivated later.

    Args:
        permission_id: Permission ID
        db: Database session
        current_user: Authenticated user

    Returns:
        Dict with keys:
            - message: Success message
            - id: Permission ID
            - is_active: New status (false)

    Raises:
        HTTPException 404: Permission not found
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        permission = await PageRoleCRUD.toggle_active_status(
            db, permission_id, is_active=False, updated_by=current_user.id, commit=True
        )
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")

        return {
            "message": "Page permission deactivated successfully",
            "id": permission.id,
            "is_active": permission.is_active,
        }
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database error while deactivating permission: {str(e)}"
        )


@router.put("/permissions/{permission_id}/activate", status_code=200)
async def activate_page_permission(
    permission_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Activate a page permission.

    Reactivates a previously deactivated page-role permission.

    Args:
        permission_id: Permission ID
        db: Database session
        current_user: Authenticated user

    Returns:
        Dict with keys:
            - message: Success message
            - id: Permission ID
            - is_active: New status (true)

    Raises:
        HTTPException 404: Permission not found
        HTTPException 500: Database error

    **Permissions:** Authenticated users
    """
    try:
        permission = await PageRoleCRUD.toggle_active_status(
            db, permission_id, is_active=True, updated_by=current_user.id, commit=True
        )
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")

        return {
            "message": "Page permission activated successfully",
            "id": permission.id,
            "is_active": permission.is_active,
        }
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database error while activating permission: {str(e)}"
        )
