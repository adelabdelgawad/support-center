# Repository Pattern Reference

Class-based data access layer using BaseRepository[T] generic base class.

## Key Principles

1. **Class inheriting BaseRepository[T]** - All repositories extend the generic base
2. **Session in `__init__`** - Stored as `self.session` via `super().__init__(session)`
3. **`model = EntityClass`** - Class attribute pointing to the SQLModel model
4. **Use `flush()` not `commit()`** - Let the caller (service) handle commit
5. **Use `refresh()` after insert** - Get server-generated values
6. **Import from `api/repositories`** - Central `__init__.py` re-exports all repositories

## BaseRepository[T] — Generic Base Class

```python
# api/repositories/base.py
"""Generic repository base class providing common CRUD operations."""

from typing import Generic, Type, TypeVar, overload
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, select

T = TypeVar("T", bound=SQLModel)


class BaseRepository(Generic[T]):
    """
    Generic base repository for common CRUD operations.

    All repositories inherit from this class to get standard database operations.
    The model class must be set as a class attribute (e.g., `model = User`).

    Transaction Control:
        - create(): flush + refresh, NO commit (caller must commit)
        - delete(): marks for deletion, NO commit (caller must commit)
        - All other methods: read-only, no transaction control
    """

    model: Type[T]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @overload
    async def get_by_id(self, id: int) -> T | None: ...

    @overload
    async def get_by_id(self, id: UUID) -> T | None: ...

    async def get_by_id(self, id: int | UUID) -> T | None:
        return await self.session.get(self.model, id)

    async def create(self, entity: T) -> T:
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def delete(self, entity: T) -> None:
        await self.session.delete(entity)

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[T]:
        stmt = select(self.model).offset(skip).limit(limit)
        result = await self.session.scalars(stmt)
        return list(result.all())
```

## Entity Repository Structure

```python
# api/repositories/setting/item_repository.py
"""Item Repository - Data access operations for Item entity."""

from typing import List, Optional

from fastapi import status
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.exceptions import DetailedHTTPException
from api.repositories.base import BaseRepository
from db.model import Item


class ItemRepository(BaseRepository[Item]):
    """
    Repository for Item entity operations.

    Transaction Control:
        - create_item(): flush + NO commit (caller must commit)
        - toggle_status(): NO commit (caller must commit)
        - All other methods: read-only, no transaction control
    """

    model = Item

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_id(  # type: ignore[override]
        self,
        item_id: int,
        load_relations: bool = False,
    ) -> Optional[Item]:
        """Get item by ID with optional relation loading."""
        stmt = select(Item).where(Item.id == item_id)
        if load_relations:
            stmt = stmt.options(selectinload(Item.category))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def ensure_exists(self, item_id: int) -> Item:
        """Get item or raise 404."""
        item = await self.get_by_id(item_id)
        if not item:
            raise DetailedHTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item not found with ID: {item_id}",
            )
        return item

    async def item_exists(self, item_id: int) -> bool:
        """Efficient existence check."""
        stmt = select(exists().where(Item.id == item_id))
        result = await self.session.execute(stmt)
        return result.scalar() or False

    async def list_with_filters(
        self,
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
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count(self) -> int:
        """Count total items."""
        result = await self.session.execute(
            select(func.count()).select_from(Item)
        )
        return result.scalar() or 0

    async def create_item(
        self,
        name_en: str,
        name_ar: str,
        **kwargs,
    ) -> Item:
        """Create item. Does NOT commit - caller commits."""
        item = Item(name_en=name_en, name_ar=name_ar, **kwargs)
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def toggle_status(self, item_id: int) -> Item:
        """Toggle item active status. Does NOT commit."""
        item = await self.ensure_exists(item_id)
        item.is_active = not item.is_active
        self.session.add(item)
        return item

    async def bulk_update_status(
        self,
        item_ids: List[int],
        is_active: bool,
    ) -> List[Item]:
        """Bulk update status. Does NOT commit."""
        from sqlalchemy import update as sa_update

        stmt = (
            sa_update(Item)
            .where(Item.id.in_(item_ids))
            .values(is_active=is_active)
        )
        await self.session.execute(stmt)

        # Re-fetch updated items
        fetch_stmt = select(Item).where(Item.id.in_(item_ids))
        result = await self.session.execute(fetch_stmt)
        return list(result.scalars().all())
```

## Repository Registration

```python
# api/repositories/__init__.py
"""Repository Layer - Class-based data access layer."""

# Base
from api.repositories.base import BaseRepository

# Setting repositories
from api.repositories.setting.item_repository import ItemRepository
from api.repositories.setting.user_repository import UserRepository
from api.repositories.setting.role_repository import RoleRepository
# ... other repositories

__all__ = [
    "BaseRepository",
    "ItemRepository",
    "UserRepository",
    "RoleRepository",
]
```

## Usage in Service

```python
# api/services/setting/item_service.py
from api.repositories import ItemRepository

class ItemService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.item_repo = ItemRepository(session)

    async def get_items(self, skip: int, limit: int) -> ItemListResponse:
        items = await self.item_repo.list_with_filters(skip=skip, limit=limit)
        total = await self.item_repo.count()
        return ItemListResponse(items=items, total=total)
```

## Usage in Router

```python
# api/routers/setting/item_router.py
from api.services.setting.item_service import ItemService

@router.get("/")
async def list_items(session: SessionDep, skip: int = 0, limit: int = 100):
    service = ItemService(session)
    return await service.get_items(skip, limit)
```

## Inherited Methods from BaseRepository

All repositories automatically get these methods:

| Method | Description | Transaction |
|--------|-------------|-------------|
| `get_by_id(id)` | Get entity by primary key | Read-only |
| `create(entity)` | Create entity (flush + refresh) | Caller must commit |
| `delete(entity)` | Mark entity for deletion | Caller must commit |
| `list_all(skip, limit)` | List with pagination | Read-only |

## Query Patterns

### Existence Check
```python
async def item_exists(self, item_id: int) -> bool:
    stmt = select(exists().where(Item.id == item_id))
    result = await self.session.execute(stmt)
    return result.scalar() or False
```

### Eager Loading
```python
async def get_with_relations(self, item_id: int) -> Optional[Item]:
    stmt = (
        select(Item)
        .options(selectinload(Item.category))
        .where(Item.id == item_id)
    )
    result = await self.session.execute(stmt)
    return result.scalar_one_or_none()
```

### Count with Filters
```python
async def count_filtered(self, is_active: Optional[bool] = None) -> int:
    stmt = select(func.count(Item.id))
    if is_active is not None:
        stmt = stmt.where(Item.is_active == is_active)
    return await self.session.scalar(stmt) or 0
```

## Key Points

1. **Always inherit from BaseRepository[T]** - Get standard CRUD operations for free
2. **Set `model = EntityClass`** - Required class attribute
3. **Session in `__init__`** - Call `super().__init__(session)`, stored as `self.session`
4. **flush() not commit()** - Transaction managed at service level
5. **Use exists() for checks** - More efficient than fetching full record
6. **selectinload for relations** - Prevent N+1 queries
7. **Document transaction control** - Docstring must say "caller must commit" or "read-only"
