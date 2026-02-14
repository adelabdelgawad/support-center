# FastAPI Template Examples

Real-world examples for FastAPI backend patterns using Router -> Service -> Repository architecture.

## Example 1: Complete Router (Delegates to Service)

```python
# api/routers/setting/users_router.py
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Query, Path, status

from api.schemas.users_schema import (
    SettingUsersResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserWithRolesResponse,
    UserUpdateRolesRequest,
    UserStatusUpdateRequest,
    BulkStatusUpdateResponse,
    UserStatusUpdateBulkRequest,
)
from core.dependencies import SessionDep, AdminOrSuperAdminDep, SuperAdminDep

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=SettingUsersResponse, status_code=status.HTTP_200_OK)
async def get_users(
    session: SessionDep,
    current_user: AdminOrSuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, gt=0, le=100),
    is_active: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
) -> SettingUsersResponse:
    """List users with pagination and filtering."""
    from api.services.setting.user_service import UserService

    service = UserService(session=session)
    return await service.get_users(skip=skip, limit=limit, is_active=is_active, search=search, sort=sort)


@router.post("/", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    session: SessionDep,
    user_data: UserCreateRequest,
    current_user: SuperAdminDep,
) -> UserCreateResponse:
    """Create a new user with role assignments."""
    from api.services.setting.user_service import UserService

    service = UserService(session=session)
    return await service.create_user(user_data=user_data, current_user_id=current_user.id)


@router.put("/{user_id}", response_model=UserWithRolesResponse, status_code=status.HTTP_200_OK)
async def update_user(
    session: SessionDep,
    current_user: SuperAdminDep,
    data: UserUpdateRolesRequest,
    user_id: UUID = Path(...),
) -> UserWithRolesResponse:
    """Update user role assignments."""
    from api.services.setting.user_service import UserService

    service = UserService(session=session)
    return await service.update_user(user_id=user_id, data=data, current_user_id=current_user.id)


@router.put("/{user_id}/status", response_model=UserWithRolesResponse, status_code=status.HTTP_200_OK)
async def update_user_status(
    session: SessionDep,
    current_user: SuperAdminDep,
    data: UserStatusUpdateRequest,
) -> UserWithRolesResponse:
    """Toggle user active/inactive status."""
    from api.services.setting.user_service import UserService

    service = UserService(session=session)
    return await service.update_user_status(
        user_id=data.user_id, status_data=data, current_user_id=current_user.id
    )


@router.post("/status", response_model=BulkStatusUpdateResponse, status_code=status.HTTP_200_OK)
async def update_users_status_bulk(
    session: SessionDep,
    current_user: SuperAdminDep,
    request: UserStatusUpdateBulkRequest,
) -> BulkStatusUpdateResponse:
    """Bulk update user status."""
    from api.services.setting.user_service import UserService

    service = UserService(session=session)
    return await service.update_users_status_bulk(request=request, current_user_id=current_user.id)
```

## Example 2: Service Layer (Instantiates Repositories)

```python
# api/services/setting/user_service.py
import logging
from typing import Optional
from uuid import UUID

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from api.exceptions import DetailedHTTPException
from api.repositories import UserRepository, RoleRepository, PageRepository
from api.schemas.users_schema import (
    SettingUsersResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserWithRolesResponse,
)
from api.services.setting.audit_service import AuditService

logger = logging.getLogger(__name__)


class UserService:
    """Service for user operations with audit logging and orchestration."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)
        self.page_repo = PageRepository(session)

    async def get_users(
        self,
        skip: int = 0,
        limit: int = 10,
        is_active: Optional[str] = None,
        search: Optional[str] = None,
        sort: Optional[str] = None,
    ) -> SettingUsersResponse:
        """Get users with filtering and pagination."""
        count_stats = await self.user_repo.count()

        users = await self.user_repo.list_with_roles(
            skip=skip, limit=limit, is_active=is_active_bool, username_search=search
        )

        user_responses = [self._build_user_response(user) for user in users]
        return SettingUsersResponse(
            users=user_responses,
            total=count_stats.total,
            active_count=count_stats.active_users,
            inactive_count=count_stats.inactive_users,
        )

    async def create_user(self, user_data: UserCreateRequest, current_user_id: UUID) -> UserCreateResponse:
        """Create user with audit logging."""
        try:
            audit_service = AuditService(session=self.session)

            # Create via repository (flush, no commit)
            new_user = await self.user_repo.create_user(
                username=user_data.username,
                fullname=user_data.fullname,
                role_ids=user_data.role_ids,
            )

            # Single commit point
            await self.session.commit()
            await self.session.refresh(new_user)

            # Audit
            await audit_service.log_success(
                action="USER_CREATED",
                entity_name="User",
                entity_id=str(new_user.id),
                performed_by_id=current_user_id,
            )

            return UserCreateResponse(id=new_user.id, username=new_user.username)

        except DetailedHTTPException:
            await self.session.rollback()
            raise
        except Exception as e:
            logger.error(f"Error creating user: {e}", exc_info=True)
            await self.session.rollback()
            raise DetailedHTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating user",
            )
```

## Example 3: Repository (Inherits BaseRepository[T])

```python
# api/repositories/setting/user_repository.py
from typing import List, Optional
from uuid import UUID

from fastapi import status
from sqlalchemy import case, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.exceptions import DetailedHTTPException
from api.repositories.base import BaseRepository
from db.model import User, UserRole, Role


class UserRepository(BaseRepository[User]):
    """
    Repository for User entity operations.

    Transaction Control:
        - create_user(): flush + NO commit (caller must commit)
        - update_roles(): NO commit (caller must commit)
        - toggle_status(): NO commit (caller must commit)
        - All other methods: read-only, no transaction control
    """

    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_id(self, user_id: UUID, load_roles: bool = False) -> Optional[User]:
        stmt = select(User).where(User.id == user_id)
        if load_roles:
            stmt = stmt.options(
                selectinload(User.role_permissions).selectinload(UserRole.role)
            )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def ensure_exists(self, user_id: UUID) -> User:
        user = await self.get_by_id(user_id)
        if not user:
            raise DetailedHTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User not found with ID: {user_id}",
            )
        return user

    async def list_with_roles(
        self, skip: int = 0, limit: int = 100,
        is_active: Optional[bool] = None, username_search: Optional[str] = None,
    ) -> List[User]:
        stmt = select(User).options(
            selectinload(User.role_permissions).selectinload(UserRole.role)
        )
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if username_search:
            stmt = stmt.where(User.username.ilike(f"%{username_search}%"))
        stmt = stmt.offset(skip).limit(limit).order_by(User.username)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count(self):
        stmt = select(
            func.count(User.id).label("total"),
            func.count(case((User.is_active.is_(True), 1))).label("active_users"),
            func.count(case((User.is_active.is_(False), 1))).label("inactive_users"),
        )
        result = await self.session.execute(stmt)
        row = result.one_or_none()
        return row

    async def create_user(self, username: str, fullname: str = None, role_ids: list = None) -> User:
        """Create user. Does NOT commit - caller commits."""
        user = User(username=username.strip(), fullname=fullname)
        self.session.add(user)
        await self.session.flush()
        if role_ids:
            for rid in role_ids:
                self.session.add(UserRole(user_id=user.id, role_id=rid))
        return user
```

## Example 4: Pydantic Schemas (CamelModel)

```python
# api/schemas/users_schema.py
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from api.schemas._base import CamelModel


class UserWithRolesResponse(CamelModel):
    """User response with role information."""
    id: UUID
    username: str
    fullname: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    roles: List[dict] = []
    en_roles: List[str] = []
    ar_roles: List[str] = []
    roles_id: List[int] = []


class UserCreateRequest(CamelModel):
    """User creation request."""
    username: str
    fullname: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    role_ids: List[int] = []


class SettingUsersResponse(CamelModel):
    """Paginated users response for data table."""
    users: List[UserWithRolesResponse]
    total: int
    active_count: int
    inactive_count: int
```

## Example 5: Repository Registration

```python
# api/repositories/__init__.py
"""Repository Layer - Class-based data access layer."""

from api.repositories.base import BaseRepository
from api.repositories.setting.user_repository import UserRepository
from api.repositories.setting.role_repository import RoleRepository
from api.repositories.setting.page_repository import PageRepository

__all__ = [
    "BaseRepository",
    "UserRepository",
    "RoleRepository",
    "PageRepository",
]
```

## Directory Structure

```
src/backend/
+-- main.py
+-- celery_app.py
+-- api/
|   +-- routers/
|   |   +-- setting/
|   |       +-- users_router.py
|   |       +-- roles_router.py
|   +-- repositories/
|   |   +-- __init__.py           # Re-exports all repositories
|   |   +-- base.py               # BaseRepository[T]
|   |   +-- auth/
|   |   |   +-- auth_repository.py
|   |   +-- setting/
|   |       +-- user_repository.py
|   |       +-- role_repository.py
|   +-- services/
|   |   +-- setting/
|   |       +-- user_service.py
|   |       +-- role_service.py
|   +-- schemas/
|   |   +-- _base.py              # CamelModel
|   |   +-- users_schema.py
|   |   +-- rbac_schema.py
|   +-- exceptions.py             # DetailedHTTPException
+-- db/
|   +-- model.py                  # SQLModel ORM models
|   +-- database.py               # Async engine + session
+-- core/
|   +-- dependencies.py           # SessionDep, ActiveUserDep, etc.
|   +-- config.py
+-- tasks/
    +-- celery_tasks.py
```
