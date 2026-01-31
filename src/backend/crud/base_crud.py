"""
Base CRUD operations as plain functions.

Provides reusable database operations that can be used across different models.
"""
from typing import Any, Dict, List, Optional, Tuple, Type, TypeVar
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import SQLModel

ModelType = TypeVar("ModelType", bound=SQLModel)


async def find_by_id(
    db: AsyncSession,
    model: Type[ModelType],
    id_value: Any,
    *,
    eager_load: Optional[List] = None
) -> Optional[ModelType]:
    """
    Find a single record by ID.

    Args:
        db: Database session
        model: SQLModel class
        id_value: The ID value to search for
        eager_load: List of relationships to eager load (selectinload)

    Returns:
        Model instance or None if not found
    """
    stmt = select(model).where(model.id == id_value)

    if eager_load:
        for relationship in eager_load:
            stmt = stmt.options(selectinload(relationship))

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_one(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    filters: Optional[Dict[str, Any]] = None,
    eager_load: Optional[List] = None
) -> Optional[ModelType]:
    """
    Find a single record matching filters.

    Args:
        db: Database session
        model: SQLModel class
        filters: Dictionary of field:value filters
        eager_load: List of relationships to eager load

    Returns:
        Model instance or None if not found
    """
    stmt = select(model)

    if filters:
        for field, value in filters.items():
            stmt = stmt.where(getattr(model, field) == value)

    if eager_load:
        for relationship in eager_load:
            stmt = stmt.options(selectinload(relationship))

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_all(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    filters: Optional[Dict[str, Any]] = None,
    eager_load: Optional[List] = None,
    order_by: Optional[Any] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None
) -> List[ModelType]:
    """
    Find all records matching filters with pagination.

    Args:
        db: Database session
        model: SQLModel class
        filters: Dictionary of field:value filters
        eager_load: List of relationships to eager load
        order_by: Column to order by
        limit: Maximum number of records
        offset: Number of records to skip

    Returns:
        List of model instances
    """
    stmt = select(model)

    if filters:
        for field, value in filters.items():
            if value is not None:
                stmt = stmt.where(getattr(model, field) == value)

    if eager_load:
        for relationship in eager_load:
            stmt = stmt.options(selectinload(relationship))

    if order_by is not None:
        stmt = stmt.order_by(order_by)

    if offset:
        stmt = stmt.offset(offset)

    if limit:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_paginated(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    page: int = 1,
    per_page: int = 50,
    filters: Optional[Dict[str, Any]] = None,
    eager_load: Optional[List] = None,
    order_by: Optional[Any] = None
) -> Tuple[List[ModelType], int]:
    """
    Find records with pagination and total count.

    Args:
        db: Database session
        model: SQLModel class
        page: Page number (1-indexed)
        per_page: Items per page
        filters: Dictionary of field:value filters
        eager_load: List of relationships to eager load
        order_by: Column to order by

    Returns:
        Tuple of (list of records, total count)
    """
    # Build base query
    stmt = select(model)
    count_stmt = select(func.count(model.id))

    # Apply filters
    if filters:
        for field, value in filters.items():
            if value is not None:
                filter_clause = getattr(model, field) == value
                stmt = stmt.where(filter_clause)
                count_stmt = count_stmt.where(filter_clause)

    # Get total count
    count_result = await db.execute(count_stmt)
    total = count_result.scalar()

    # Apply eager loading
    if eager_load:
        for relationship in eager_load:
            stmt = stmt.options(selectinload(relationship))

    # Apply ordering
    if order_by is not None:
        stmt = stmt.order_by(order_by)

    # Apply pagination
    offset = (page - 1) * per_page
    stmt = stmt.offset(offset).limit(per_page)

    # Execute query
    result = await db.execute(stmt)
    items = list(result.scalars().all())

    return items, total


async def count(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    filters: Optional[Dict[str, Any]] = None
) -> int:
    """
    Count records matching filters.

    Args:
        db: Database session
        model: SQLModel class
        filters: Dictionary of field:value filters

    Returns:
        Count of matching records
    """
    stmt = select(func.count(model.id))

    if filters:
        for field, value in filters.items():
            if value is not None:
                stmt = stmt.where(getattr(model, field) == value)

    result = await db.execute(stmt)
    return result.scalar()


async def create(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    obj_in: Dict[str, Any],
    commit: bool = True
) -> ModelType:
    """
    Create a new record.

    Args:
        db: Database session
        model: SQLModel class
        obj_in: Dictionary of field values
        commit: Whether to commit immediately

    Returns:
        Created model instance
    """
    db_obj = model(**obj_in)
    db.add(db_obj)

    if commit:
        await db.commit()
        await db.refresh(db_obj)

    return db_obj


async def update(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    id_value: Any,
    obj_in: Dict[str, Any],
    commit: bool = True
) -> Optional[ModelType]:
    """
    Update an existing record.

    Args:
        db: Database session
        model: SQLModel class
        id_value: ID of record to update
        obj_in: Dictionary of field values to update
        commit: Whether to commit immediately

    Returns:
        Updated model instance or None if not found
    """
    db_obj = await find_by_id(db, model, id_value)
    if not db_obj:
        return None

    for field, value in obj_in.items():
        setattr(db_obj, field, value)

    if commit:
        await db.commit()
        await db.refresh(db_obj)

    return db_obj


async def delete(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    id_value: Any,
    soft_delete: bool = False,
    commit: bool = True
) -> bool:
    """
    Delete a record (soft or hard delete).

    Args:
        db: Database session
        model: SQLModel class
        id_value: ID of record to delete
        soft_delete: If True, sets is_deleted=True instead of removing
        commit: Whether to commit immediately

    Returns:
        True if deleted, False if not found
    """
    db_obj = await find_by_id(db, model, id_value)
    if not db_obj:
        return False

    if soft_delete and hasattr(db_obj, 'is_deleted'):
        db_obj.is_deleted = True
    else:
        await db.delete(db_obj)

    if commit:
        await db.commit()

    return True


async def exists(
    db: AsyncSession,
    model: Type[ModelType],
    *,
    filters: Dict[str, Any]
) -> bool:
    """
    Check if a record exists matching filters.

    Args:
        db: Database session
        model: SQLModel class
        filters: Dictionary of field:value filters

    Returns:
        True if at least one record exists
    """
    count_result = await count(db, model, filters=filters)
    return count_result > 0
