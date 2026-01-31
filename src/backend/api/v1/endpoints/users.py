"""
User API endpoints with role management support.

REFACTORED:
- Added role management endpoints
- Added user list with roles support
- Added endpoints for user role assignments
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user, require_admin
from models import Role, User, UserRole
from models.database_models import Page, PageRole
from schemas.page import PageRead
from schemas.user.user import (
    BulkUserStatusUpdate,
    BulkUserTechnicianUpdate,
    BulkUserUpdateResponse,
    UserBlockedResponse,
    UserBlockRequest,
    UserBusinessUnitInfo,
    UserCountsResponse,
    UserCreate,
    UserCreateWithRoles,
    UserListItem,
    UserListResponse,
    UserPreferencesRead,
    UserPreferencesUpdate,
    UserRead,
    UserRoleInfo,
    UserRolesUpdate,
    UserStatusUpdate,
    UserTechnicianUpdate,
    UserUpdate,
    UserWithRoles,
    UserWithRolesListItem,
)
from services.role_service import RoleService
from services.user_service import UserService

router = APIRouter()


@router.post("/", response_model=UserRead, status_code=201)
async def create_user(
    user_data: UserCreateWithRoles,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Create a new user with role assignments. Requires admin role."""
    # Check if username exists
    existing = await UserService.get_user_by_username(db, user_data.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Check if email exists
    if user_data.email:
        existing = await UserService.get_user_by_email(db, user_data.email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

    # Set is_technician to True by default if not explicitly set
    user_create_data = user_data.model_dump(exclude={'role_ids'})
    if 'is_technician' not in user_create_data or user_create_data['is_technician'] is None:
        user_create_data['is_technician'] = True

    user = await UserService.create_user(db=db, user_data=UserCreate(**user_create_data))

    # Assign roles to the user if provided
    if user_data.role_ids:
        from repositories.user_role_repository import UserRoleRepository
        await UserRoleRepository.create_multiple_user_roles(
            db=db,
            user_id=str(user.id),
            role_ids=user_data.role_ids,
            commit=True
        )

    return user


@router.get("", response_model=List[UserListItem])
async def list_users(
    response: Response,
    is_technician: Optional[bool] = None,
    is_active: Optional[bool] = None,
    is_online: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List users with filtering. Requires authentication.

    - **is_technician**: Filter by technician status
    - **is_active**: Filter by active status
    - **is_online**: Filter by online status
    """
    items, total = await UserService.list_users(
        db=db,
        is_technician=is_technician,
        is_active=is_active,
        is_online=is_online,
        page=page,
        per_page=per_page,
    )

    response.headers["X-Total-Count"] = str(total)
    return items


@router.get("/online-technicians", response_model=List[UserListItem])
async def get_online_technicians(db: AsyncSession = Depends(get_session)):
    """Get all online technicians and supervisors."""
    return await UserService.get_online_technicians(db=db)


@router.get("/{user_id}/connection-status")
async def get_user_connection_status(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Get user's real-time SignalR connection status.

    Returns:
        - isOnline: Whether user is connected to SignalR
        - connections: List of active sessions with IPs
    """
    from services.signalr_client import signalr_client
    from services.desktop_session_service import DesktopSessionService
    from services.web_session_service import WebSessionService

    user_id_str = str(user_id)

    # Check SignalR connection
    is_online = await signalr_client.is_user_online(user_id_str)

    connections = []

    if is_online:
        # Get active sessions from both desktop and web sessions to retrieve IP addresses
        desktop_sessions = await DesktopSessionService.get_user_sessions(db, user_id, active_only=True)
        web_sessions = await WebSessionService.get_user_sessions(db, user_id, active_only=True)
        sessions = list(desktop_sessions) + list(web_sessions)

        for session in sessions:
            connections.append({
                "ipAddress": session.ip_address,
                "userAgent": getattr(session, 'user_agent', None),
                "lastHeartbeat": session.last_heartbeat.isoformat() if session.last_heartbeat else None,
            })

    return {
        "userId": user_id_str,
        "isOnline": is_online,
        "connections": connections,
    }


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get a user by ID. Requires authentication."""
    user = await UserService.get_user(db=db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    update_data: UserUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Update a user. Requires admin role."""
    user = await UserService.update_user(
        db=db, user_id=user_id, update_data=update_data
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Soft delete a user by marking them as deleted. Requires admin role.
    Sets is_deleted = True instead of permanently deleting the record.
    This preserves data integrity and allows for recovery if needed.
    """
    success = await UserService.delete_user(db=db, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return Response(status_code=204)


@router.patch("/{user_id}/block", response_model=UserBlockedResponse)
async def block_user(
    user_id: UUID,
    block_data: UserBlockRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Block or unblock a user. Requires admin role."""
    user = await UserService.get_user(db=db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update user blocking status
    update_data = UserUpdate(
        is_blocked=block_data.is_blocked,
        block_message=block_data.block_message,
    )
    updated_user = await UserService.update_user(
        db=db, user_id=user_id, update_data=update_data
    )

    if block_data.is_blocked:
        message = f"User {user.username} has been blocked successfully."
    else:
        message = f"User {user.username} has been unblocked successfully."

    return UserBlockedResponse(
        is_blocked=updated_user.is_blocked,
        block_message=updated_user.block_message,
        message=message,
    )


# REMOVED: Duplicate endpoint - see line 655 for the active implementation
# @router.get("/{user_id}/pages", response_model=List[PageRead])
# async def get_user_pages(
#     user_id: UUID, db: AsyncSession = Depends(get_session)
# ):
#     """
#     Get pages accessible by a user through their roles.
#
#     Super admins get access to all pages.
#     Regular users get pages from their assigned roles.
#     """
#     # Use repository to fetch user with pages
#     from repositories.user_repository import UserRepository
#
#     user = await UserRepository.find_by_id_with_pages(db, user_id)
#
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")
#
#     # Super admins have access to all pages
#     if user.is_super_admin:
#         from repositories.page_repository import PageRepository
#         pages, _ = await PageRepository.list_pages_paginated(
#             db, page=1, per_page=1000  # Get all pages
#         )
#         return [PageRead.model_validate(page) for page in pages]
#
#     # Regular users get pages from their roles
#     pages_dict = {}
#     for user_role in user.user_roles:
#         if user_role.role and user_role.role.is_active:
#             role_pages = await user_role.role.get_pages(include_inactive=False)
#             for page in role_pages:
#                 if page.id not in pages_dict:
#                     pages_dict[page.id] = page
#
#     return [PageRead.model_validate(page) for page in pages_dict.values()]


@router.get("/{user_id}/block-status", response_model=UserBlockedResponse)
async def get_user_block_status(
    user_id: UUID, db: AsyncSession = Depends(get_session)
):
    """Get user blocking status."""
    user = await UserService.get_user(db=db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_blocked:
        message = f"User {user.username} is currently blocked."
    else:
        message = f"User {user.username} is not blocked."

    return UserBlockedResponse(
        is_blocked=user.is_blocked,
        block_message=user.block_message,
        message=message,
    )


# Role management endpoints
@router.get("/with-roles/", response_model=UserListResponse)
async def list_users_with_roles(
    response: Response,
    username: Optional[str] = Query(None, description="Filter by username"),
    is_active: Optional[str] = Query(
        None, description="Filter by active status"
    ),
    is_technician: Optional[str] = Query(
        None, description="Filter by technician status"
    ),
    user_type: Optional[str] = Query(
        None, description="Filter by user type: all, technicians, users"
    ),
    role_id: Optional[UUID] = Query(None, description="Filter by role ID"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """
    List users with their role information.

    - **username**: Filter by username (partial match)
    - **is_active**: Filter by active status (true/false)
    - **is_technician**: Filter by technician status (true/false)
    - **user_type**: Filter by user type (all, technicians, users)
    - **role_id**: Filter users that have a specific role
    """
    from repositories.user_repository import UserRepository

    # Convert string is_active to boolean
    is_active_bool = None
    if is_active is not None:
        is_active_bool = is_active.lower() == "true"

    # Handle user_type filter - converts to is_technician filter
    is_technician_bool = None
    if user_type is not None:
        if user_type.lower() == "technicians":
            is_technician_bool = True
        elif user_type.lower() == "users":
            is_technician_bool = False
        # "all" means no filter on technician status
    elif is_technician is not None:
        # Fallback to is_technician param if user_type not provided
        is_technician_bool = is_technician.lower() == "true"

    # Use repository to get users with roles and counts
    users, counts = await UserRepository.list_users_with_role_counts(
        db,
        is_active=is_active_bool,
        is_technician=is_technician_bool,
        username=username,
        role_id=str(role_id) if role_id else None,
        skip=(page - 1) * per_page,
        limit=per_page
    )

    # Build response with roles and business units
    from schemas.user.user import UserBusinessUnitInfo
    user_items = []
    for user in users:
        roles = [
            UserRoleInfo(id=ur.role.id, name=ur.role.name)
            for ur in user.user_roles
            if ur.role
        ]
        role_ids = [ur.role_id for ur in user.user_roles]

        # Get active business units for user
        business_units = [
            UserBusinessUnitInfo(
                id=bu_assign.business_unit.id,
                name=bu_assign.business_unit.name,
                is_active=bu_assign.business_unit.is_active,
            )
            for bu_assign in user.business_unit_assigns
            if bu_assign.business_unit
            and not bu_assign.is_deleted
            and bu_assign.is_active
        ]

        user_items.append(
            UserWithRolesListItem(
                id=user.id,
                username=user.username,
                full_name=user.full_name,
                email=user.email,
                title=user.title,
                is_technician=user.is_technician,
                is_online=user.is_online,
                is_active=user.is_active,
                is_super_admin=user.is_super_admin,
                is_domain=user.is_domain,
                is_blocked=user.is_blocked,
                block_message=user.block_message,
                manager_id=user.manager_id,
                roles=roles,
                role_ids=role_ids,
                business_units=business_units,
            )
        )

    return UserListResponse(
        users=user_items,
        # Filtered total (for pagination)
        total=counts["total"] or 0,
        # Scoped Status counts (within selected User Type)
        active_count=counts["active_count"] or 0,
        inactive_count=counts["inactive_count"] or 0,
        # Global User Type counts (always database totals)
        global_total=counts["global_total"] or 0,
        technician_count=counts["technician_count"] or 0,
        user_count=counts["user_count"] or 0,
        # Scoped Role counts (within selected User Type AND Status)
        role_counts=counts.get("role_counts", {}),
    )


@router.get("/counts/", response_model=UserCountsResponse)
async def get_user_counts(db: AsyncSession = Depends(get_session)):
    """Get user count statistics."""
    from repositories.user_repository import UserRepository

    counts = await UserRepository.get_user_counts(db)

    return UserCountsResponse(
        total=counts["total"] or 0,
        active_count=counts["active_count"] or 0,
        inactive_count=counts["inactive_count"] or 0,
    )


@router.get("/{user_id}/roles", response_model=List[UserRoleInfo])
async def get_user_roles(
    user_id: UUID, db: AsyncSession = Depends(get_session)
):
    """Get roles assigned to a user."""
    # Use repository to fetch user with roles
    from repositories.user_repository import UserRepository

    user = await UserRepository.find_by_id_with_roles(db, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return [
        UserRoleInfo(id=ur.role.id, name=ur.role.name)
        for ur in user.user_roles
        if ur.role
    ]


@router.put("/{user_id}/roles")
async def update_user_roles(
    user_id: UUID,
    update_data: UserRolesUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update roles assigned to a user."""
    from repositories.user_role_repository import UserRoleRepository

    # Verify user exists
    user = await UserService.get_user(db=db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Calculate differences
    original_set = set(update_data.original_role_ids)
    updated_set = set(update_data.updated_role_ids)

    roles_to_add = list(updated_set - original_set)
    roles_to_remove = list(original_set - updated_set)

    added_count = 0
    removed_count = 0

    # Add new roles
    if roles_to_add:
        # Verify all roles exist
        for role_id in roles_to_add:
            role = await RoleService.get_role(db=db, role_id=role_id)
            if not role:
                raise HTTPException(
                    status_code=404, detail=f"Role {role_id} not found"
                )

        # Commit during the last operation if we're only adding
        should_commit = not roles_to_remove
        await UserRoleRepository.create_multiple_user_roles(
            db, user_id, roles_to_add, commit=should_commit
        )
        added_count = len(roles_to_add)

    # Remove old roles
    if roles_to_remove:
        for i, role_id in enumerate(roles_to_remove):
            # Commit on the last deletion
            should_commit = (i == len(roles_to_remove) - 1)
            await UserRoleRepository.delete_by_user_and_role(
                db, user_id, role_id, commit=should_commit
            )
        removed_count = len(roles_to_remove)

    return {
        "message": "User roles updated successfully",
        "added": added_count,
        "removed": removed_count,
    }


@router.put("/{user_id}/status", response_model=UserWithRolesListItem)
async def update_user_status(
    user_id: UUID,
    status_data: UserStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update user activation status."""
    from repositories.user_repository import UserRepository

    update_data = UserUpdate(is_active=status_data.is_active)
    user = await UserService.update_user(
        db=db, user_id=user_id, update_data=update_data
    )

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Load user with roles and business units using repository
    user_with_data = await UserRepository.find_by_id_with_roles_and_business_units(
        db, user_id
    )

    roles = [
        UserRoleInfo(id=ur.role.id, name=ur.role.name)
        for ur in user_with_data.user_roles
        if ur.role
    ]
    role_ids = [ur.role_id for ur in user_with_data.user_roles]

    business_units = [
        UserBusinessUnitInfo(
            id=assign.business_unit.id,
            name=assign.business_unit.name,
            is_active=assign.business_unit.is_active,
        )
        for assign in user_with_data.business_unit_assigns
        if assign.business_unit
    ]

    return UserWithRolesListItem(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        title=user.title,
        is_technician=user.is_technician,
        is_active=user.is_active,
        is_online=user.is_online,
        is_super_admin=user.is_super_admin,
        is_domain=user.is_domain,
        is_blocked=user.is_blocked,
        block_message=user.block_message,
        manager_id=user.manager_id,
        roles=roles,
        role_ids=role_ids,
        business_units=business_units,
    )


@router.put("/{user_id}/technician", response_model=UserWithRolesListItem)
async def update_user_technician_status(
    user_id: UUID,
    technician_data: UserTechnicianUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update user technician status."""
    from repositories.user_repository import UserRepository

    update_data = UserUpdate(is_technician=technician_data.is_technician)
    user = await UserService.update_user(
        db=db, user_id=user_id, update_data=update_data
    )

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Load user with roles and business units using repository
    user_with_data = await UserRepository.find_by_id_with_roles_and_business_units(
        db, user_id
    )

    roles = [
        UserRoleInfo(id=ur.role.id, name=ur.role.name)
        for ur in user_with_data.user_roles
        if ur.role
    ]
    role_ids = [ur.role_id for ur in user_with_data.user_roles]

    business_units = [
        UserBusinessUnitInfo(
            id=assign.business_unit.id,
            name=assign.business_unit.name,
            is_active=assign.business_unit.is_active,
        )
        for assign in user_with_data.business_unit_assigns
        if assign.business_unit
    ]

    return UserWithRolesListItem(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        title=user.title,
        is_technician=user.is_technician,
        is_active=user.is_active,
        is_online=user.is_online,
        is_super_admin=user.is_super_admin,
        is_domain=user.is_domain,
        is_blocked=user.is_blocked,
        block_message=user.block_message,
        manager_id=user.manager_id,
        roles=roles,
        role_ids=role_ids,
        business_units=business_units,
    )


@router.post("/bulk-status", response_model=BulkUserUpdateResponse)
async def bulk_update_user_status(
    bulk_data: BulkUserStatusUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Bulk update user activation status."""
    from repositories.user_repository import UserRepository

    updated_users = []
    for user_id in bulk_data.user_ids:
        update_data = UserUpdate(is_active=bulk_data.is_active)
        user = await UserService.update_user(
            db=db, user_id=user_id, update_data=update_data
        )

        if user:
            user_with_data = await UserRepository.find_by_id_with_roles_and_business_units(
                db, user_id
            )
            roles = [
                UserRoleInfo(id=ur.role.id, name=ur.role.name)
                for ur in user_with_data.user_roles
                if ur.role
            ]
            role_ids = [ur.role_id for ur in user_with_data.user_roles]
            business_units = [
                UserBusinessUnitInfo(
                    id=assign.business_unit.id,
                    name=assign.business_unit.name,
                    is_active=assign.business_unit.is_active,
                )
                for assign in user_with_data.business_unit_assigns
                if assign.business_unit
            ]

            updated_users.append(
                UserWithRolesListItem(
                    id=user.id,
                    username=user.username,
                    email=user.email,
                    full_name=user.full_name,
                    title=user.title,
                    is_technician=user.is_technician,
                    is_active=user.is_active,
                    is_online=user.is_online,
                    is_super_admin=user.is_super_admin,
                    is_domain=user.is_domain,
                    is_blocked=user.is_blocked,
                    block_message=user.block_message,
                    manager_id=user.manager_id,
                    roles=roles,
                    role_ids=role_ids,
                    business_units=business_units,
                )
            )

    return BulkUserUpdateResponse(updated_users=updated_users)


@router.post("/bulk-technician", response_model=BulkUserUpdateResponse)
async def bulk_update_user_technician(
    bulk_data: BulkUserTechnicianUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Bulk update user technician status."""
    from repositories.user_repository import UserRepository

    updated_users = []
    for user_id in bulk_data.user_ids:
        update_data = UserUpdate(is_technician=bulk_data.is_technician)
        user = await UserService.update_user(
            db=db, user_id=user_id, update_data=update_data
        )

        if user:
            user_with_data = await UserRepository.find_by_id_with_roles_and_business_units(
                db, user_id
            )
            roles = [
                UserRoleInfo(id=ur.role.id, name=ur.role.name)
                for ur in user_with_data.user_roles
                if ur.role
            ]
            role_ids = [ur.role_id for ur in user_with_data.user_roles]
            business_units = [
                UserBusinessUnitInfo(
                    id=assign.business_unit.id,
                    name=assign.business_unit.name,
                    is_active=assign.business_unit.is_active,
                )
                for assign in user_with_data.business_unit_assigns
                if assign.business_unit
            ]

            updated_users.append(
                UserWithRolesListItem(
                    id=user.id,
                    username=user.username,
                    email=user.email,
                    full_name=user.full_name,
                    title=user.title,
                    is_technician=user.is_technician,
                    is_active=user.is_active,
                    is_online=user.is_online,
                    is_super_admin=user.is_super_admin,
                    is_domain=user.is_domain,
                    is_blocked=user.is_blocked,
                    block_message=user.block_message,
                    manager_id=user.manager_id,
                    roles=roles,
                    role_ids=role_ids,
                    business_units=business_units,
                )
            )

    return BulkUserUpdateResponse(updated_users=updated_users)



@router.get("/{user_id}/pages", response_model=List[PageRead])
async def get_user_pages(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get all pages accessible to a user based on their roles.

    IMPORTANT: This endpoint automatically includes parent pages in the hierarchy
    to ensure proper navigation display. If a user has access to a child page,
    all parent pages up to the root level are automatically included, even if
    not explicitly assigned in page_roles.

    Example:
        If user has access to page 21 (Requests) which has parent_id=2 (Support Center),
        the response will include BOTH page 21 AND page 2, so the navigation tree displays correctly.

    Args:
        user_id: User ID (UUID)
        db: Database session
        current_user: Currently authenticated user

    Returns:
        List of pages the user can access (direct permissions + all parent pages)

    Raises:
        HTTPException: If user not found
    """
    import logging
    from sqlalchemy import select

    logger = logging.getLogger(__name__)

    # DEBUG: Log the user_id being requested
    logger.debug(f"Loading navigation for user_id={user_id}")

    # Fetch user to verify existence
    user_query = select(User).where(User.id == user_id)
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()

    if not user:
        logger.debug(f"User not found: user_id={user_id}")
        raise HTTPException(status_code=404, detail="User not found")

    # DEBUG: Log user info
    logger.debug(f"User found: username={user.username}, is_super_admin={user.is_super_admin}")

    # If user is super admin, return all active pages
    if user.is_super_admin:
        pages_query = select(Page).where(Page.is_active == True).order_by(Page.id)
        pages_result = await db.execute(pages_query)
        pages = pages_result.scalars().all()
        logger.debug(f"Super admin - loaded {len(pages)} pages")
        logger.debug(f"Super admin page IDs: {[p.id for p in pages]}")
        return pages

    # Get user's role IDs
    user_roles_query = select(UserRole.role_id).where(UserRole.user_id == user_id)
    user_roles_result = await db.execute(user_roles_query)
    role_ids = [row[0] for row in user_roles_result.all()]

    # DEBUG: Log user roles
    logger.debug(f"User role_ids: {role_ids}")

    if not role_ids:
        logger.debug(f"User has no roles assigned - returning empty pages list")
        return []

    # Get pages accessible through user's roles
    page_roles_query = (
        select(PageRole.page_id)
        .where(PageRole.role_id.in_(role_ids))
        .where(PageRole.is_active == True)
        .distinct()
    )
    page_roles_result = await db.execute(page_roles_query)
    page_ids = [row[0] for row in page_roles_result.all()]

    # DEBUG: Log page IDs found
    logger.debug(f"Page IDs found for user's roles: {page_ids}")

    if not page_ids:
        logger.debug(f"No page permissions found for user's roles - returning empty pages list")
        return []

    # Fetch the actual pages user has direct access to
    pages_query = (
        select(Page)
        .where(Page.id.in_(page_ids))
        .where(Page.is_active == True)
        .order_by(Page.id)
    )
    pages_result = await db.execute(pages_query)
    pages = list(pages_result.scalars().all())

    # DEBUG: Log direct pages
    logger.debug(f"Direct pages from permissions: {len(pages)}")
    logger.debug(f"Direct page IDs: {[p.id for p in pages]}")

    # AUTO-INCLUDE PARENT PAGES
    # Automatically fetch all parent pages for proper navigation hierarchy
    pages_dict = {page.id: page for page in pages}  # Use dict to avoid duplicates
    parent_ids_to_fetch = set()

    # Collect all parent IDs from the pages we have
    for page in pages:
        if page.parent_id and page.parent_id not in pages_dict:
            parent_ids_to_fetch.add(page.parent_id)

    # Recursively fetch parent pages up the hierarchy
    while parent_ids_to_fetch:
        logger.debug(f"Fetching parent pages: {parent_ids_to_fetch}")

        parent_pages_query = (
            select(Page)
            .where(Page.id.in_(parent_ids_to_fetch))
            .where(Page.is_active == True)
        )
        parent_pages_result = await db.execute(parent_pages_query)
        parent_pages = list(parent_pages_result.scalars().all())

        # Add fetched parents to our pages dict
        new_parent_ids = set()
        for parent_page in parent_pages:
            if parent_page.id not in pages_dict:
                pages_dict[parent_page.id] = parent_page
                logger.debug(f"Auto-included parent: {parent_page.id} ({parent_page.title})")

                # Check if this parent also has a parent
                if parent_page.parent_id and parent_page.parent_id not in pages_dict:
                    new_parent_ids.add(parent_page.parent_id)

        # Continue with grandparents, etc.
        parent_ids_to_fetch = new_parent_ids

    # Convert dict back to list
    final_pages = list(pages_dict.values())

    # DEBUG: Log final result
    logger.debug(f"Returning {len(final_pages)} pages (including auto-added parents)")
    logger.debug(f"Final page IDs: {[p.id for p in final_pages]}")
    logger.debug(f"Final page titles: {[p.title for p in final_pages]}")

    # DEBUG: Log full page details
    for page in final_pages:
        logger.debug(f"Page {page.id}: path={page.path}, title={page.title}, icon={page.icon}, parent_id={page.parent_id}, is_active={page.is_active}")

    return final_pages


@router.get("/{user_id}/preferences", response_model=UserPreferencesRead)
async def get_user_preferences(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get user preferences.

    Args:
        user_id: User ID (UUID)
        db: Database session
        current_user: Currently authenticated user

    Returns:
        User preferences

    Raises:
        HTTPException: If user not found
    """
    user = await UserService.get_user(db=db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserPreferencesRead(
        language=user.language or "ar",
        theme=user.theme or "system",
        notifications_enabled=user.notifications_enabled if user.notifications_enabled is not None else True,
        sound_enabled=user.sound_enabled if user.sound_enabled is not None else True,
        sound_volume=user.sound_volume if user.sound_volume is not None else 0.5,
    )


@router.patch("/{user_id}/preferences", response_model=UserPreferencesRead)
async def update_user_preferences(
    user_id: UUID,
    preferences_data: UserPreferencesUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update user preferences.

    Args:
        user_id: User ID (UUID)
        preferences_data: Preference data to update
        db: Database session
        current_user: Currently authenticated user

    Returns:
        Updated user preferences

    Raises:
        HTTPException: If user not found or validation fails
    """
    # Build update data from preferences
    update_data = UserUpdate(
        language=preferences_data.language,
        theme=preferences_data.theme,
        notifications_enabled=preferences_data.notifications_enabled,
        sound_enabled=preferences_data.sound_enabled,
        sound_volume=preferences_data.sound_volume,
    )

    user = await UserService.update_user(
        db=db, user_id=user_id, update_data=update_data
    )

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserPreferencesRead(
        language=user.language or "ar",
        theme=user.theme or "system",
        notifications_enabled=user.notifications_enabled if user.notifications_enabled is not None else True,
        sound_enabled=user.sound_enabled if user.sound_enabled is not None else True,
        sound_volume=user.sound_volume if user.sound_volume is not None else 0.5,
    )
