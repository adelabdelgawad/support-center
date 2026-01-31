# Router Pattern Reference

API endpoints with FastAPI using typed session dependency and simplified architecture.

## Key Principles

1. **Use `SessionDep` typed dependency** - Not `Depends(get_session)`
2. **Simple CRUD directly in router** - No service layer for basic operations
3. **Import CRUD helpers for reusable queries** - `from api.crud import items as items_crud`
4. **Service only for complex orchestration** - External integrations, multi-step operations
5. **Use response_model** - For automatic validation and documentation
6. **Let exceptions propagate** - Exception handlers convert to HTTP
7. **Router path**: `api/routers/setting/item_router.py` - Not `api/v1/`
8. **Router registration**: `core/app_setup/routers_group/setting_routers.py`

## Basic Router Structure (Simple CRUD - No Service)

```python
# api/routers/setting/item_router.py
"""Item Endpoints - CRUD operations for items."""

from typing import List, Optional
from fastapi import APIRouter, Query, status
from sqlalchemy import select, func

from api.crud import items as items_crud
from api.http_schema.item_schema import (
    ItemCreate,
    ItemUpdate,
    ItemResponse,
    ItemListResponse,
    ItemStatusUpdate,
)
from api.exceptions import DetailedHTTPException
from core.dependencies import SessionDep
from db.model import Item

router = APIRouter(prefix="/items", tags=["items"])


# CREATE
@router.post(
    "",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_item(
    item_create: ItemCreate,
    session: SessionDep,
):
    """Create a new item."""
    # Check for duplicate name (simple inline query)
    existing = await session.scalar(
        select(Item).where(Item.name_en == item_create.name_en)
    )
    if existing:
        raise DetailedHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Item with name '{item_create.name_en}' already exists",
        )

    item = Item(**item_create.model_dump())
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


# READ (single) - uses CRUD helper for reusable query
@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: int,
    session: SessionDep,
):
    """Get item by ID."""
    item = await items_crud.ensure_item_exists(session, item_id)
    return item


# READ (list) - simple query directly in router
@router.get("", response_model=ItemListResponse)
async def list_items(
    session: SessionDep,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=100, description="Max records to return"),
    search: Optional[str] = Query(None, description="Search in name"),
    is_active: Optional[bool] = Query(None, description="Filter by status"),
):
    """List items with pagination and filtering."""
    # Count
    count = await session.scalar(select(func.count()).select_from(Item))

    # Query
    stmt = select(Item)
    if is_active is not None:
        stmt = stmt.where(Item.is_active == is_active)
    if search:
        stmt = stmt.where(Item.name_en.ilike(f"%{search}%"))
    stmt = stmt.offset(skip).limit(limit).order_by(Item.created_at.desc())
    items = (await session.scalars(stmt)).all()

    return ItemListResponse(items=items, total=count)


# UPDATE (PUT)
@router.put("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: int,
    item_update: ItemUpdate,
    session: SessionDep,
):
    """Update an existing item."""
    item = await items_crud.ensure_item_exists(session, item_id)

    update_data = item_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    await session.commit()
    await session.refresh(item)
    return item


# UPDATE STATUS
@router.put("/{item_id}/status", response_model=ItemResponse)
async def update_item_status(
    item_id: int,
    status_update: ItemStatusUpdate,
    session: SessionDep,
):
    """Toggle item active/inactive status."""
    item = await items_crud.ensure_item_exists(session, item_id)
    item.is_active = status_update.is_active
    await session.commit()
    await session.refresh(item)
    return item


# DELETE
@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: int,
    session: SessionDep,
):
    """Delete an item."""
    item = await items_crud.ensure_item_exists(session, item_id)
    await session.delete(item)
    await session.commit()
```

## Complex Operations (Service Required)

Use a service ONLY when the operation involves external integrations or multi-step orchestration:

```python
# api/routers/setting/user_router.py
from api.services.ad_client_service import ADClientService

@router.post("/sync-ad", response_model=UserResponse)
async def sync_user_from_ad(
    username: str,
    session: SessionDep,
):
    """Sync user from Active Directory - requires service for external integration."""
    ad_service = ADClientService()
    ad_user = await ad_service.get_user(username)

    if not ad_user:
        raise DetailedHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{username}' not found in Active Directory",
        )

    # Use CRUD helper for DB operation
    from api.crud import users as users_crud
    user = await users_crud.create_or_update_from_ad(session, ad_user)
    await session.commit()
    return user
```

## Bulk Operations

```python
from api.http_schema.item_schema import BulkStatusUpdate

@router.put("/bulk/status", response_model=dict)
async def bulk_update_status(
    update: BulkStatusUpdate,
    session: SessionDep,
):
    """Bulk update item status."""
    count = await items_crud.bulk_update_status(
        session,
        item_ids=update.item_ids,
        is_active=update.is_active,
    )
    await session.commit()
    return {"updated_count": count}
```

## Paginated Response with Metadata

```python
from api.http_schema.item_schema import ItemListResponse

@router.get("/", response_model=ItemListResponse)
async def list_items_paginated(
    session: SessionDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    """List items with pagination metadata."""
    count = await session.scalar(select(func.count()).select_from(Item))
    stmt = select(Item).offset(skip).limit(limit).order_by(Item.created_at.desc())
    items = (await session.scalars(stmt)).all()

    return ItemListResponse(items=items, total=count)
```

## Router Registration

```python
# core/app_setup/routers_group/setting_routers.py
from api.routers.setting.item_router import router as item_router

setting_routers = [
    item_router,
    # ... other setting routers
]
```

## Authentication Required Endpoints

```python
from core.dependencies import SessionDep, CurrentUserDep

@router.post(
    "",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_item_admin(
    item_create: ItemCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    """Create item (authenticated user)."""
    item = Item(**item_create.model_dump(), created_by_id=current_user.id)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item
```

## Multiple Response Status Codes

```python
from api.http_schema.error_schema import ErrorResponse

@router.post(
    "",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new item",
    responses={
        201: {"model": ItemResponse, "description": "Item created successfully"},
        409: {"model": ErrorResponse, "description": "Item already exists"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
)
async def create_item(
    item_create: ItemCreate,
    session: SessionDep,
):
    """Create a new item."""
    ...
```

## Key Points

1. **Use `SessionDep`** - Typed dependency, not `Depends(get_session)`
2. **Simple CRUD in router** - No service layer needed for basic operations
3. **CRUD helpers for reusable queries** - Import as `items_crud`
4. **Service only for complex ops** - External integrations, multi-step orchestration
5. **Router path** - `api/routers/setting/item_router.py`
6. **Registration** - `core/app_setup/routers_group/setting_routers.py`
7. **commit() in router** - Router owns the transaction
8. **Let exceptions propagate** - Exception handlers do the work
9. **Use Query() for params** - Adds validation and docs
10. **HTTP status codes** - 201 for create, 204 for delete
