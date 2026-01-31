# CRUD Helper Pattern Reference

Stateless async functions for reusable database queries, replacing the deprecated repository pattern.

## Key Principles

1. **Plain async functions** - No classes, no `__init__`, no `self`
2. **Session as first parameter** - Every function receives `AsyncSession`
3. **Use `flush()` not `commit()`** - Let the caller (router/service) handle commit
4. **Use `refresh()` after insert** - Get server-generated values
5. **Only create when reused 3+ times** - Simple one-off queries go directly in routers

## When to Create a CRUD Helper

- Query is used in 3+ different endpoints/services
- Query has reusable business logic (e.g., "get active users with roles")
- Query involves complex joins or eager loading
- Query is used in only 1-2 places (put it directly in the router)
- Query is trivial (e.g., `session.get(User, id)`)

## Basic CRUD Helper Structure

```python
# api/crud/items.py
"""Item CRUD Helpers - Reusable query functions for Item entity."""

from typing import List, Optional
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.exceptions import DetailedHTTPException
from db.model import Item
from fastapi import status


async def get_item_by_id(
    session: AsyncSession,
    item_id: int,
    load_relations: bool = False,
) -> Optional[Item]:
    """Get item by ID with optional relation loading."""
    stmt = select(Item).where(Item.id == item_id)
    if load_relations:
        stmt = stmt.options(selectinload(Item.category))
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def ensure_item_exists(
    session: AsyncSession,
    item_id: int,
) -> Item:
    """Get item or raise 404."""
    item = await get_item_by_id(session, item_id)
    if not item:
        raise DetailedHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item not found with ID: {item_id}",
        )
    return item


async def item_exists(
    session: AsyncSession,
    item_id: int,
) -> bool:
    """Efficient existence check."""
    stmt = select(exists().where(Item.id == item_id))
    result = await session.execute(stmt)
    return result.scalar() or False


async def list_items(
    session: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
) -> List[Item]:
    """List items with filtering and pagination."""
    stmt = select(Item)
    if is_active is not None:
        stmt = stmt.where(Item.is_active == is_active)
    if search:
        stmt = stmt.where(Item.name_en.ilike(f"%{search}%"))
    stmt = stmt.offset(skip).limit(limit).order_by(Item.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_items(session: AsyncSession) -> int:
    """Count total items."""
    result = await session.execute(select(func.count()).select_from(Item))
    return result.scalar() or 0


async def create_item(
    session: AsyncSession,
    name_en: str,
    name_ar: str,
    **kwargs,
) -> Item:
    """Create item. Does NOT commit - caller commits."""
    item = Item(name_en=name_en, name_ar=name_ar, **kwargs)
    session.add(item)
    await session.flush()
    await session.refresh(item)
    return item
```

## CRUD Helper Registration

```python
# api/crud/__init__.py
"""CRUD Helper Functions - Stateless query and mutation functions."""

from api.crud.items import (
    count_items,
    create_item,
    ensure_item_exists,
    get_item_by_id,
    item_exists,
    list_items,
)

__all__ = [
    "get_item_by_id",
    "ensure_item_exists",
    "item_exists",
    "list_items",
    "count_items",
    "create_item",
]
```

## Usage in Router

```python
# api/routers/setting/item_router.py
from api.crud import items as items_crud

@router.get("/")
async def list_items(session: SessionDep, skip: int = 0, limit: int = 100):
    items = await items_crud.list_items(session, skip=skip, limit=limit)
    return items
```

## Key Differences from Repository Pattern

| Aspect | Repository (DEPRECATED) | CRUD Helpers (Current) |
|--------|------------------------|----------------------|
| Structure | Class with methods | Plain async functions |
| State | `self._repo` in service | No state, session passed |
| Location | `api/repositories/` | `api/crud/` |
| Usage | `repo = ItemRepository()` | `import items_crud` |
| Commit | `flush()` in repo | `flush()` in helper, commit in caller |
| When to use | Always | Only when reused 3+ times |

## Query Patterns

### Existence Check
```python
async def item_exists(session: AsyncSession, item_id: int) -> bool:
    stmt = select(exists().where(Item.id == item_id))
    result = await session.execute(stmt)
    return result.scalar() or False
```

### Eager Loading
```python
async def get_item_with_category(session: AsyncSession, item_id: int) -> Optional[Item]:
    stmt = select(Item).options(selectinload(Item.category)).where(Item.id == item_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
```

### Bulk Operations
```python
async def bulk_update_status(
    session: AsyncSession,
    item_ids: List[int],
    is_active: bool,
) -> int:
    from sqlalchemy import update
    result = await session.execute(
        update(Item).where(Item.id.in_(item_ids)).values(is_active=is_active)
    )
    await session.flush()
    return result.rowcount
```

## Key Points

1. **No classes** - Plain async functions, no `self`, no `__init__`
2. **Session as first param** - Consistent across all helpers
3. **flush() not commit()** - Transaction managed at router/service level
4. **Use exists() for checks** - More efficient than fetching full record
5. **selectinload for relations** - Prevent N+1 queries
6. **Only create when reused** - Simple queries go directly in routers
