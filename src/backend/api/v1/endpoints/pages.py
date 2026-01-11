"""
Page and Page Permission API endpoints.
"""
from typing import List, Optional
from uuid import UUID

from core.database import get_session
from core.dependencies import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from models import User
from schemas.page import (
    PageCreate,
    PageUpdate,
    PageRead,
    PageRoleCreate,
    PageRoleDetailedResponse,
    PageRoleListResponse,
)
from services.page_service import PageService, PageRoleService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# Page CRUD endpoints
@router.post("/", response_model=PageRead, status_code=201)
async def create_page(
    page_data: PageCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new page."""
    # Check if path exists
    if page_data.path:
        existing = await PageService.get_page_by_path(db, page_data.path)
        if existing:
            raise HTTPException(status_code=400, detail="Page path already exists")

    page = await PageService.create_page(
        db=db, page_data=page_data, created_by=current_user.id
    )
    return page


@router.get("/", response_model=List[PageRead])
async def list_pages(
    response: Response,
    title: Optional[str] = Query(None, description="Filter by title"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    parent_id: Optional[int] = Query(None, description="Filter by parent page ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List pages accessible to the current user.
    Super admins see all pages, regular users see only pages they have access to via their roles.
    """
    pages, total = await PageService.get_pages_for_user(
        db=db,
        user=current_user,
        title=title,
        is_active=is_active,
        parent_id=parent_id,
        page=page,
        per_page=per_page,
    )

    response.headers["X-Total-Count"] = str(total)
    return pages


@router.get("/{page_id}", response_model=PageRead)
async def get_page(page_id: int, db: AsyncSession = Depends(get_session)):
    """Get a page by ID."""
    page = await PageService.get_page(db=db, page_id=page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/{page_id}", response_model=PageRead)
async def update_page(
    page_id: int,
    update_data: PageUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a page."""
    # If path is being updated, check it doesn't conflict
    if update_data.path:
        existing = await PageService.get_page_by_path(db, update_data.path)
        if existing and existing.id != page_id:
            raise HTTPException(status_code=400, detail="Page path already exists")

    page = await PageService.update_page(
        db=db, page_id=page_id, update_data=update_data, updated_by=current_user.id
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.delete("/{page_id}", status_code=204)
async def delete_page(
    page_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a page (soft delete)."""
    success = await PageService.delete_page(db=db, page_id=page_id)
    if not success:
        raise HTTPException(status_code=404, detail="Page not found")
    return Response(status_code=204)


# Page permission endpoints
@router.get("/permissions/", response_model=PageRoleListResponse)
async def list_page_permissions(
    page_id: Optional[int] = Query(None, description="Filter by page ID"),
    role_id: Optional[UUID] = Query(None, description="Filter by role ID"),
    include_inactive: bool = Query(False, description="Include inactive permissions"),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """List page permissions with filtering."""
    permissions, total = await PageRoleService.list_page_permissions(
        db=db,
        page_id=page_id,
        role_id=role_id,
        include_inactive=include_inactive,
        page=page,
        per_page=per_page,
    )

    return PageRoleListResponse(permissions=permissions, total=total)


@router.post("/permissions/", response_model=PageRoleDetailedResponse, status_code=201)
async def create_page_permission(
    permission_data: PageRoleCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new page-role permission."""
    from repositories.page_repository import PageRoleRepository

    permission = await PageRoleService.create_page_permission(
        db=db, permission_data=permission_data, created_by=current_user.id
    )

    # Load relationships using repository
    permission_with_details = await PageRoleRepository.find_by_id_with_details(
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


@router.delete("/permissions/{permission_id}", status_code=200)
async def deactivate_page_permission(
    permission_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Deactivate a page permission (soft delete)."""
    permission = await PageRoleService.deactivate_page_permission(
        db=db, permission_id=permission_id, updated_by=current_user.id
    )
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")

    return {
        "message": "Page permission deactivated successfully",
        "id": permission.id,
        "is_active": permission.is_active,
    }


@router.put("/permissions/{permission_id}/activate", status_code=200)
async def activate_page_permission(
    permission_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Activate a page permission."""
    permission = await PageRoleService.activate_page_permission(
        db=db, permission_id=permission_id, updated_by=current_user.id
    )
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")

    return {
        "message": "Page permission activated successfully",
        "id": permission.id,
        "is_active": permission.is_active,
    }
