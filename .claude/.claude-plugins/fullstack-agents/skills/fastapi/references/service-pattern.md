# Service Pattern Reference

Services are the primary business logic layer. ALL routers delegate to services. Services instantiate repositories in __init__ for data access.

## When to Use Services

**Always.** Every router endpoint delegates to a Service class. Services handle:

- **Business logic and validation** - Domain rules, uniqueness checks
- **Repository orchestration** - Multiple repositories in a single operation
- **Transaction management** - Commits after all repository operations succeed
- **Audit logging** - Log operations via AuditService
- **External integrations** - Active Directory/LDAP, email/SMTP, Redis, SMS
- **Complex multi-step operations** - User creation + role assignment + audit logging

## Service Structure

Services instantiate repositories in `__init__` and use them for all data access.

```python
# api/services/setting/item_service.py
"""Item Service - Business logic for Item entity operations."""

import logging
from typing import List, Optional

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from api.exceptions import DetailedHTTPException
from api.repositories import ItemRepository, CategoryRepository
from api.schemas.item_schema import (
    ItemCreateRequest,
    ItemListResponse,
    ItemResponse,
)

logger = logging.getLogger(__name__)


class ItemService:
    """Service for item operations with audit logging and orchestration."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.item_repo = ItemRepository(session)
        self.category_repo = CategoryRepository(session)

    async def get_items(
        self,
        skip: int = 0,
        limit: int = 10,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> ItemListResponse:
        """Get items with filtering and pagination."""
        items = await self.item_repo.list_with_filters(
            skip=skip, limit=limit, is_active=is_active, search=search
        )
        total = await self.item_repo.count()
        return ItemListResponse(items=items, total=total)

    async def create_item(
        self,
        data: ItemCreateRequest,
    ) -> ItemResponse:
        """Create a new item with validation."""
        try:
            # Business validation
            existing = await self.item_repo.get_by_name(data.name_en)
            if existing:
                raise DetailedHTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Item '{data.name_en}' already exists",
                )

            # Validate foreign key
            if data.category_id:
                await self.category_repo.ensure_exists(data.category_id)

            # Create via repository (flush, no commit)
            item = await self.item_repo.create_item(
                name_en=data.name_en,
                name_ar=data.name_ar,
                category_id=data.category_id,
            )

            # Single commit point
            await self.session.commit()
            await self.session.refresh(item)

            return ItemResponse.model_validate(item)

        except DetailedHTTPException:
            await self.session.rollback()
            raise
        except Exception as e:
            logger.error(f"Error creating item: {e}", exc_info=True)
            await self.session.rollback()
            raise DetailedHTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating item",
            )

    async def toggle_status(self, item_id: int) -> ItemResponse:
        """Toggle item active status."""
        item = await self.item_repo.toggle_status(item_id)
        await self.session.commit()
        await self.session.refresh(item)
        return ItemResponse.model_validate(item)
```

## Service with External Integrations

```python
# api/services/setting/user_service.py
"""User Service - Complex user operations with AD sync and audit logging."""

from api.repositories import UserRepository, RoleRepository, PageRepository
from api.services.setting.audit_service import AuditService

class UserService:
    """Service for complex user operations with audit logging and orchestration."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)
        self.page_repo = PageRepository(session)

    async def create_user(
        self, user_data: UserCreateRequest, current_user_id: UUID
    ) -> UserCreateResponse:
        """Create a new user with audit logging."""
        try:
            audit_service = AuditService(session=self.session)

            # Create user using repository
            new_user = await self.user_repo.create_user(
                username=user_data.username,
                fullname=user_data.fullname,
                title=user_data.title,
                email=user_data.email,
                is_active=user_data.is_active,
                role_ids=user_data.role_ids,
            )

            # Single commit point
            await self.session.commit()
            await self.session.refresh(new_user)

            # Audit with proper action type
            await audit_service.log_success(
                action=ActionType.USER_CREATED,
                entity_name="User",
                entity_id=str(new_user.id),
                performed_by_id=current_user_id,
                description=f"Created user '{new_user.username}'",
            )

            return UserCreateResponse(
                id=new_user.id,
                username=new_user.username,
                message="User created successfully",
            )

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

    async def get_users(
        self,
        skip: int = 0,
        limit: int = 10,
        is_active: Optional[str] = None,
        search: Optional[str] = None,
        sort: Optional[str] = None,
    ) -> SettingUsersResponse:
        """Get users with filtering and pagination."""
        # Parse filters
        is_active_bool = None
        if is_active is not None:
            active_values = {v.strip().lower() for v in is_active.split(",")}
            if not ("true" in active_values and "false" in active_values):
                is_active_bool = "true" in active_values

        # Get counts from repository
        count_stats = await self.user_repo.count()

        # Get filtered users from repository
        users = await self.user_repo.list_with_roles(
            skip=skip,
            limit=limit,
            is_active=is_active_bool,
            username_search=search,
        )

        # Build response
        user_responses = [self._build_user_response(user) for user in users]
        return SettingUsersResponse(
            users=user_responses,
            total=count_stats.total,
            active_count=count_stats.active_users,
            inactive_count=count_stats.inactive_users,
        )
```

## Usage in Router

```python
# api/routers/setting/item_router.py
from api.services.setting.item_service import ItemService

@router.get("/", response_model=ItemListResponse)
async def list_items(
    session: SessionDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, gt=0, le=100),
):
    service = ItemService(session)
    return await service.get_items(skip=skip, limit=limit)

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    session: SessionDep,
    data: ItemCreateRequest,
    current_user: SuperAdminDep,
):
    service = ItemService(session)
    return await service.create_item(data)
```

## Key Points

1. **ALL routers delegate to services** - No direct queries or repository calls in routers
2. **Instantiate repositories in `__init__`** - `self.item_repo = ItemRepository(session)`
3. **Services own the transaction** - `await self.session.commit()` in service, not router
4. **Rollback on error** - `await self.session.rollback()` in except blocks
5. **Audit logging** - Use `AuditService(session=self.session)` for compliance
6. **Error handling** - Catch `DetailedHTTPException` (re-raise), catch generic `Exception` (log + 500)
7. **Return complete records** - All mutations return the full updated/created record
