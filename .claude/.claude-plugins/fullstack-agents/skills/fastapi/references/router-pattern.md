# Router Pattern Reference

API endpoints with FastAPI using typed session dependency. ALL routers delegate to Service classes.

## Key Principles

1. **Use `SessionDep` typed dependency** - Not `Depends(get_session)`
2. **ALL routers delegate to Service** - Instantiate service in each handler
3. **No repository or direct query imports in routers** - Services handle all data access
4. **Use response_model** - For automatic validation and documentation
5. **Let exceptions propagate** - Exception handlers convert to HTTP
6. **Router path**: `api/routers/setting/{entity}_router.py`
7. **Router registration**: `core/app_setup/routers_group/setting_routers.py`

## Router Structure

```python
# api/routers/setting/item_router.py
"""Item Endpoints - delegates to ItemService for all operations."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Query, Path, status

from api.schemas.item_schema import (
    ItemCreateRequest,
    ItemListResponse,
    ItemResponse,
    ItemStatusUpdateRequest,
    BulkStatusUpdateResponse,
)
from core.dependencies import SessionDep, AdminOrSuperAdminDep, SuperAdminDep

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/",
    response_model=ItemListResponse,
    status_code=status.HTTP_200_OK,
)
async def get_items(
    session: SessionDep,
    current_user: AdminOrSuperAdminDep,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(10, gt=0, le=100, description="Max records to return"),
    search: Optional[str] = Query(None, description="Search in name"),
    is_active: Optional[str] = Query(None, description="Filter by status"),
) -> ItemListResponse:
    """List items with pagination and filtering."""
    from api.services.setting.item_service import ItemService

    service = ItemService(session)
    return await service.get_items(
        skip=skip, limit=limit, search=search, is_active=is_active
    )


@router.post(
    "/",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_item(
    session: SessionDep,
    data: ItemCreateRequest,
    current_user: SuperAdminDep,
) -> ItemResponse:
    """Create a new item."""
    from api.services.setting.item_service import ItemService

    service = ItemService(session)
    return await service.create_item(data)


@router.put(
    "/{item_id}",
    response_model=ItemResponse,
    status_code=status.HTTP_200_OK,
)
async def update_item(
    session: SessionDep,
    data: ItemUpdateRequest,
    current_user: SuperAdminDep,
    item_id: int = Path(..., description="Item ID to update"),
) -> ItemResponse:
    """Update an existing item."""
    from api.services.setting.item_service import ItemService

    service = ItemService(session)
    return await service.update_item(item_id, data)


@router.put(
    "/{item_id}/status",
    response_model=ItemResponse,
    status_code=status.HTTP_200_OK,
)
async def update_item_status(
    session: SessionDep,
    current_user: SuperAdminDep,
    data: ItemStatusUpdateRequest,
) -> ItemResponse:
    """Toggle item active/inactive status."""
    from api.services.setting.item_service import ItemService

    service = ItemService(session)
    return await service.toggle_status(data.item_id)


@router.post(
    "/status",
    response_model=BulkStatusUpdateResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_update_status(
    session: SessionDep,
    current_user: SuperAdminDep,
    request: BulkStatusUpdateRequest,
) -> BulkStatusUpdateResponse:
    """Bulk update item status."""
    from api.services.setting.item_service import ItemService

    service = ItemService(session)
    return await service.bulk_update_status(request)
```

## Import Pattern

Routers use **local imports** for services inside each handler function:

```python
@router.get("/")
async def get_items(session: SessionDep):
    from api.services.setting.item_service import ItemService

    service = ItemService(session)
    return await service.get_items()
```

This pattern:
- Avoids circular imports
- Matches the actual codebase convention
- Makes dependencies explicit per-endpoint

## Authentication Dependencies

```python
from core.dependencies import (
    SessionDep,           # AsyncSession
    ActiveUserDep,        # Any authenticated user
    AdminOrSuperAdminDep, # Admin or Super Admin
    SuperAdminDep,        # Super Admin only
)

@router.get("/")
async def get_items(
    session: SessionDep,
    current_user: AdminOrSuperAdminDep,  # Requires admin role
):
    ...

@router.post("/")
async def create_item(
    session: SessionDep,
    current_user: SuperAdminDep,  # Requires super admin role
):
    ...
```

## Router Registration

```python
# core/app_setup/routers_group/setting_routers.py
from api.routers.setting.item_router import router as item_router

# Add to the router group:
setting_router.include_router(
    item_router, prefix="/items", tags=["Items"]
)
```

## Paginated Response Pattern

Backend returns structured response for data tables:

```python
# Endpoint returns:
{
    "items": [...],           # Paginated entity list
    "total": 25,              # Filtered total (for pagination)
    "activeCount": 20,        # Unfiltered active count (for filter badges)
    "inactiveCount": 5,       # Unfiltered inactive count (for filter badges)
}
```

## Key Points

1. **Use `SessionDep`** - Typed dependency, not `Depends(get_session)`
2. **ALL routers delegate to Service** - No exceptions
3. **Service instantiated per-handler** - `service = ItemService(session)`
4. **Local imports for services** - Inside handler functions to avoid circular imports
5. **Router path** - `api/routers/setting/{entity}_router.py`
6. **Registration** - `core/app_setup/routers_group/setting_routers.py`
7. **Service owns the transaction** - No `session.commit()` in routers
8. **Let exceptions propagate** - Service raises, exception handlers do the work
9. **Use Query() for params** - Adds validation and docs
10. **HTTP status codes** - 201 for create, 200 for update, 204 for delete
