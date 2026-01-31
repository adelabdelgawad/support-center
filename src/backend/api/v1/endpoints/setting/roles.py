"""
Role API endpoints for role management and permissions.

Provides endpoints for managing user roles, including role-to-page permissions
and role-to-user assignments. Roles control which pages users can access.

**Architecture:**
- Uses RoleService for business logic
- Supports role CRUD operations
- Manages role-to-page permissions (which pages a role can access)
- Manages role-to-user assignments (which users have a role)
- Active/inactive status tracking
- UUID-based role identifiers
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user
from db import User
from api.schemas import UserListItem
from api.schemas.page import PageRead, RolePagesResponse
from api.schemas.role import (RoleCreate, RoleListResponse, RolePagesUpdateRequest,
                          RoleRead, RoleUpdate, RoleUsersUpdateRequest,
                          RoleWithPagesAndUsers)
from api.services.role_service import RoleService

router = APIRouter()


@router.post("", response_model=RoleRead, status_code=201)
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new role.

    Args:
        role_data: Role creation data
            - name: Role name (must be unique)
            - description: Optional description
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated user

    Returns:
        RoleRead: Created role

    Raises:
        HTTPException 400: Role name already exists

    **Permissions:** Authenticated users
    """
    # Check if role name exists
    existing = await RoleService.get_role_by_name(db, role_data.name)
    if existing:
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = await RoleService.create_role(
        db=db, role_data=role_data, created_by=current_user.id
    )
    return role


@router.get("", response_model=RoleListResponse)
async def list_roles(
    response: Response,
    name: Optional[str] = Query(None, description="Filter by name (partial match)"),
    is_active: Optional[str] = Query(None, description="Filter by active status (true/false)"),
    page_id: Optional[int] = Query(None, description="Filter roles with permission for specific page"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=1000, description="Items per page (max 1000)"),
    db: AsyncSession = Depends(get_session),
):
    """
    List roles with filtering and pagination.

    Args:
        name: Optional partial name match filter
        is_active: Optional boolean status filter (string "true"/"false")
        page_id: Optional filter for roles that have permission for this page
        page: Page number (1-indexed)
        per_page: Items per page (max 1000)
        response: FastAPI response object (for headers)
        db: Database session

    Returns:
        RoleListResponse: Paginated list with counts
            - roles: List of roles
            - total: Total roles
            - active_count: Active roles
            - inactive_count: Inactive roles

    **Permissions:** No authentication required
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
    """
    Get role count statistics.

    Returns total, active, and inactive counts across all roles.

    Args:
        db: Database session

    Returns:
        Dict with keys:
            - total: Total roles
            - active_count: Active roles
            - inactive_count: Inactive roles

    **Permissions:** No authentication required
    """
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
    """
    Get a role by ID with pages and user count.

    Returns the role details along with:
    - Page paths the role has access to (active pages only)
    - Total number of users assigned (including inactive)

    Args:
        role_id: Role UUID
        db: Database session

    Returns:
        RoleWithPagesAndUsers: Role with page_paths and total_users

    Raises:
        HTTPException 404: Role not found

    **Permissions:** No authentication required
    """
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
    """
    Update a role.

    All fields are optional. Only provided fields will be updated.
    If name is being updated, checks for duplicates.

    Args:
        role_id: Role UUID
        update_data: Fields to update
            - name: Optional new name (must be unique)
            - description: Optional new description
            - is_active: Optional active status
        db: Database session
        current_user: Authenticated user

    Returns:
        RoleRead: Updated role

    Raises:
        HTTPException 400: Role name already exists
        HTTPException 404: Role not found

    **Permissions:** Authenticated users
    """
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

    return role


@router.put("/{role_id}/status", response_model=RoleWithPagesAndUsers)
async def toggle_role_status(
    role_id: UUID,
    is_active: bool = Query(..., description="New activation status (true/false)"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle role activation status.

    Sets the role's active status to the specified value.
    Returns the role with page paths and user count.

    Args:
        role_id: Role UUID
        is_active: Target activation status
        db: Database session
        current_user: Authenticated user

    Returns:
        RoleWithPagesAndUsers: Updated role with page_paths and total_users

    Raises:
        HTTPException 404: Role not found

    **Permissions:** Authenticated users
    """
    role = await RoleService.get_role(db=db, role_id=role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Only toggle if status is different
    if role.is_active != is_active:
        role = await RoleService.toggle_role_status(
            db=db, role_id=role_id, updated_by=current_user.id
        )

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
    """
    Delete a role (soft delete).

    Marks the role as deleted without removing it from the database.
    Page permissions and user assignments are preserved.

    Args:
        role_id: Role UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Role not found

    **Permissions:** Authenticated users
    """
    success = await RoleService.delete_role(db=db, role_id=role_id)
    if not success:
        raise HTTPException(status_code=404, detail="Role not found")
    return Response(status_code=204)


# =============================================================================
# ROLE PAGES MANAGEMENT
# =============================================================================

@router.get("/{role_id}/pages", response_model=RolePagesResponse)
async def get_role_pages(
    role_id: UUID,
    include_inactive: bool = Query(False, description="Include inactive pages"),
    db: AsyncSession = Depends(get_session),
):
    """
    Get all pages accessible by a role.

    Returns the list of pages that this role has permission to access.

    Args:
        role_id: Role UUID
        include_inactive: Whether to include inactive page permissions
        db: Database session

    Returns:
        RolePagesResponse:
            - role_id: Role ID
            - role_name: Role name
            - pages: List of pages with details
            - total_pages: Count of pages

    Raises:
        HTTPException 404: Role not found

    **Permissions:** No authentication required
    """
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
    """
    Update pages assigned to a role.

    Calculates the difference between original and updated page IDs,
    then adds/removes permissions accordingly. Returns updated role with
    pages and user count.

    Args:
        role_id: Role UUID
        request: Update request
            - original_page_ids: Current page IDs before update
            - updated_page_ids: New page IDs after update
        db: Database session
        current_user: Authenticated user

    Returns:
        RoleWithPagesAndUsers: Updated role with page_paths and total_users

    Raises:
        HTTPException 404: Role not found

    **Permissions:** Authenticated users
    """
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


# =============================================================================
# ROLE USERS MANAGEMENT
# =============================================================================

@router.get("/{role_id}/users", response_model=List[UserListItem])
async def get_role_users(
    role_id: UUID,
    include_inactive: bool = Query(False, description="Include inactive users"),
    db: AsyncSession = Depends(get_session),
):
    """
    Get all users assigned to a role.

    Returns the list of users that have this role assigned.

    Args:
        role_id: Role UUID
        include_inactive: Whether to include inactive users
        db: Database session

    Returns:
        List[UserListItem]: List of users with basic info

    Raises:
        HTTPException 404: Role not found

    **Permissions:** No authentication required
    """
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
    """
    Update users assigned to a role.

    Calculates the difference between original and updated user IDs,
    then adds/removes user assignments accordingly. Returns updated role
    with pages and user count.

    Args:
        role_id: Role UUID
        request: Update request
            - original_user_ids: Current user IDs before update
            - updated_user_ids: New user IDs after update
        db: Database session
        current_user: Authenticated user

    Returns:
        RoleWithPagesAndUsers: Updated role with page_paths and total_users

    Raises:
        HTTPException 404: Role not found

    **Permissions:** Authenticated users
    """
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
