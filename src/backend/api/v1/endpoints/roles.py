"""
Role API endpoints for role management and permissions.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user
from models import User
from schemas import UserListItem
from schemas.page import PageRead, RolePagesResponse
from schemas.role import (RoleCreate, RoleListResponse, RolePagesUpdateRequest,
                          RoleRead, RoleUpdate, RoleUsersUpdateRequest,
                          RoleWithPagesAndUsers)
from services.role_service import RoleService

router = APIRouter()


@router.post("/", response_model=RoleRead, status_code=201)
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new role."""
    # Check if role name exists
    existing = await RoleService.get_role_by_name(db, role_data.name)
    if existing:
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = await RoleService.create_role(
        db=db, role_data=role_data, created_by=current_user.id
    )
    return role


@router.get("/", response_model=RoleListResponse)
async def list_roles(
    response: Response,
    name: Optional[str] = Query(None, description="Filter by name"),
    is_active: Optional[str] = Query(
        None, description="Filter by active status"),
    page_id: Optional[int] = Query(
        None, description="Filter by page permission"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
):
    """
    List roles with filtering and pagination.

    - **name**: Filter by name (partial match)
    - **is_active**: Filter by active status (true/false)
    - **page_id**: Filter roles that have permission for specific page
    """
    # Convert is_active string to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    roles, total, active_count, inactive_count = await RoleService.list_roles(
        db=db,
        name=name,
        is_active=is_active_bool,
        page_id=page_id,
        page=page,
        per_page=per_page,
    )

    return RoleListResponse(
        roles=roles,
        total=total,
        active_count=active_count,
        inactive_count=inactive_count,
    )


@router.get("/counts")
async def get_role_counts(db: AsyncSession = Depends(get_session)):
    """Get role count statistics."""
    _, total, active_count, inactive_count = await RoleService.list_roles(
        db=db, page=1, per_page=1
    )

    return {
        "total": total,
        "active_count": active_count,
        "inactive_count": inactive_count,
    }


@router.get("/{role_id}", response_model=RoleWithPagesAndUsers)
async def get_role(role_id: UUID, db: AsyncSession = Depends(get_session)):
    """Get a role by ID with pages and user count."""
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    pages = await role.get_pages(include_inactive=False)
    users = await role.get_users(include_inactive=True)

    return RoleWithPagesAndUsers(
        id=role.id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        updated_by=role.updated_by,
        page_paths=[page.path for page in pages if page.path],
        total_users=len(users),
    )


@router.put("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: UUID,
    update_data: RoleUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a role."""
    # If name is being updated, check it doesn't conflict
    if update_data.name:
        existing = await RoleService.get_role_by_name(db, update_data.name)
        if existing and existing.id != role_id:
            raise HTTPException(
                status_code=400, detail="Role name already exists")

    role = await RoleService.update_role(
        db=db, role_id=role_id, update_data=update_data, updated_by=current_user.id
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Invalidate permissions cache for all users with this role (if role metadata changed)
    from services.permission_cache_service import permission_cache
    await permission_cache.invalidate_role_users(role_id, db)

    return role


@router.put("/{role_id}/status", response_model=RoleWithPagesAndUsers)
async def toggle_role_status(
    role_id: UUID,
    is_active: bool = Query(..., description="New activation status"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Toggle role activation status."""
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Only toggle if status is different
    if role.is_active != is_active:
        role = await RoleService.toggle_role_status(
            db=db, role_id=role_id, updated_by=current_user.id
        )

        # Invalidate permissions cache for all users with this role (status changed)
        from services.permission_cache_service import permission_cache
        await permission_cache.invalidate_role_users(role_id, db)

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    pages = await role.get_pages(include_inactive=False)
    users = await role.get_users(include_inactive=True)

    return RoleWithPagesAndUsers(
        id=role.id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        updated_by=role.updated_by,
        page_paths=[page.path for page in pages if page.path],
        total_users=len(users),
    )


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a role (soft delete)."""
    # Invalidate permissions cache for all users with this role (before deletion)
    from services.permission_cache_service import permission_cache
    await permission_cache.invalidate_role_users(role_id, db)

    success = await RoleService.delete_role(db=db, role_id=role_id)
    if not success:
        raise HTTPException(status_code=404, detail="Role not found")
    return Response(status_code=204)


# Role pages management
@router.get("/{role_id}/pages", response_model=RolePagesResponse)
async def get_role_pages(
    role_id: UUID,
    include_inactive: bool = Query(
        False, description="Include inactive pages"),
    db: AsyncSession = Depends(get_session),
):
    """Get all pages accessible by a role."""
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    pages = await RoleService.get_role_pages(
        db=db, role_id=role_id, include_inactive=include_inactive
    )

    page_reads = [
        PageRead(
            id=page.id,
            path=page.path,
            title=page.title,
            description=page.description,
            icon=page.icon,
            parent_id=page.parent_id,
            is_active=page.is_active,
            created_at=page.created_at,
            updated_at=page.updated_at,
            created_by=page.created_by,
            updated_by=page.updated_by,
        )
        for page in pages
    ]

    return RolePagesResponse(
        role_id=role.id,
        role_name=role.name,
        pages=page_reads,
        total_pages=len(pages),
    )


@router.put("/{role_id}/pages", response_model=RoleWithPagesAndUsers)
async def update_role_pages(
    role_id: UUID,
    request: RolePagesUpdateRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update pages assigned to a role. Returns updated role with pages and user count."""
    # Verify role exists
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Calculate differences
    original_set = set(request.original_page_ids)
    updated_set = set(request.updated_page_ids)

    pages_to_add = list(updated_set - original_set)
    pages_to_remove = list(original_set - updated_set)

    # Add new pages
    if pages_to_add:
        await RoleService.assign_pages_to_role(
            db=db, role_id=role_id, page_ids=pages_to_add, created_by=current_user.id
        )

    # Remove old pages
    if pages_to_remove:
        await RoleService.remove_pages_from_role(
            db=db, role_id=role_id, page_ids=pages_to_remove
        )

    # Invalidate permissions cache for all users with this role
    from services.permission_cache_service import permission_cache
    await permission_cache.invalidate_role_users(role_id, db)

    # Return updated role with pages and user count
    pages = await role.get_pages(include_inactive=False)
    users = await role.get_users(include_inactive=True)

    return RoleWithPagesAndUsers(
        id=role.id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        updated_by=role.updated_by,
        page_paths=[page.path for page in pages if page.path],
        total_users=len(users),
    )


# Role users management
@router.get("/{role_id}/users", response_model=List[UserListItem])
async def get_role_users(
    role_id: UUID,
    include_inactive: bool = Query(
        False, description="Include inactive users"),
    db: AsyncSession = Depends(get_session),
):
    """Get all users assigned to a role."""
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    users = await RoleService.get_role_users(
        db=db, role_id=role_id, include_inactive=include_inactive
    )

    return [UserListItem.model_validate(user) for user in users]


@router.put("/{role_id}/users", response_model=RoleWithPagesAndUsers)
async def update_role_users(
    role_id: UUID,
    request: RoleUsersUpdateRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update users assigned to a role. Returns updated role with pages and user count."""
    # Verify role exists
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Calculate differences
    original_set = set(request.original_user_ids)
    updated_set = set(request.updated_user_ids)

    users_to_add = list(updated_set - original_set)
    users_to_remove = list(original_set - updated_set)

    # Add new users
    if users_to_add:
        await RoleService.assign_users_to_role(
            db=db, role_id=role_id, user_ids=users_to_add, created_by=current_user.id
        )

    # Remove old users
    if users_to_remove:
        await RoleService.remove_users_from_role(
            db=db, role_id=role_id, user_ids=users_to_remove
        )

    # Invalidate permissions cache for affected users
    from services.permission_cache_service import permission_cache
    all_affected_users = users_to_add + users_to_remove
    for user_id in all_affected_users:
        await permission_cache.invalidate_user_permissions(user_id)

    # Return updated role with pages and user count
    pages = await role.get_pages(include_inactive=False)
    users = await role.get_users(include_inactive=True)

    return RoleWithPagesAndUsers(
        id=role.id,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
        created_by=role.created_by,
        updated_by=role.updated_by,
        page_paths=[page.path for page in pages if page.path],
        total_users=len(users),
    )
