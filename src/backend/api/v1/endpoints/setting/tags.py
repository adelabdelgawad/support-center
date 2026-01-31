"""
Tag API endpoints.

Provides endpoints for managing tags which are used to categorize and label
service requests for better filtering and organization. Tags are associated
with categories and support bilingual naming.

**Architecture Note:**
Refactored to inline DB queries - service layer removed.
Previous service layer used raw SQL with minor FK validation which has been
simplified into helper functions within this module.

**Key Features:**
- Tag CRUD operations
- Category association (each tag belongs to one category)
- Bilingual support (name_en, name_ar)
- Active/inactive status tracking
- Soft delete (is_deleted flag)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user, require_admin
from db.models import Category, Tag, User
from api.schemas.tag import TagCreate, TagRead, TagUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


async def _verify_category_exists(db: AsyncSession, category_id: int) -> None:
    """Helper to verify category exists.

    Args:
        db: Database session
        category_id: Category ID to verify

    Raises:
        HTTPException: 400 if category not found
    """
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category with ID {category_id} not found"
        )


@router.get("", response_model=List[TagRead])
async def list_tags(
    db: AsyncSession = Depends(get_session),
    active_only: bool = Query(True, description="Filter to active tags"),
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
) -> List[TagRead]:
    """
    List all tags.

    Args:
        active_only: Filter to active tags (default: true)
        category_id: Optional filter by category ID
        db: Database session

    Returns:
        List[TagRead]: List of tags

    Raises:
        HTTPException 500: Database error

    **Permissions:** No authentication required
    """
    try:
        query = select(Tag)

        if active_only:
            query = query.where(Tag.is_active, not Tag.is_deleted)

        if category_id is not None:
            query = query.where(Tag.category_id == category_id)

        result = await db.execute(query)
        return result.scalars().all()
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching tags: {str(e)}"
        )


@router.get("/{tag_id}", response_model=TagRead)
async def get_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_session),
) -> TagRead:
    """
    Get a single tag by ID.

    Args:
        tag_id: Tag ID
        db: Database session

    Returns:
        TagRead: Tag details

    Raises:
        HTTPException 404: Tag not found
        HTTPException 500: Database error

    **Permissions:** No authentication required
    """
    try:
        tag = await db.get(Tag, tag_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tag with ID {tag_id} not found",
            )
        return tag
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching tag: {str(e)}"
        )


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_data: TagCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_admin),
) -> TagRead:
    """
    Create a new tag (admin only).

    Args:
        tag_data: Tag creation data
            - name_en: Tag name in English (required)
            - name_ar: Tag name in Arabic (required)
            - category_id: Parent category ID (required)
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated user
        _: Admin requirement dependency

    Returns:
        TagRead: Created tag

    Raises:
        HTTPException 400: Category not found
        HTTPException 500: Database error

    **Permissions:** Admin only
    """
    try:
        # Verify category exists
        await _verify_category_exists(db, tag_data.category_id)

        tag = Tag(
            name_en=tag_data.name_en,
            name_ar=tag_data.name_ar,
            category_id=tag_data.category_id,
            is_active=tag_data.is_active,
            created_by=current_user.id,
        )

        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        return tag
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while creating tag: {str(e)}"
        )


@router.put("/{tag_id}", response_model=TagRead)
async def update_tag(
    tag_id: int,
    update_data: TagUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_admin),
) -> TagRead:
    """
    Update a tag (admin only).

    All fields are optional. Only provided fields will be updated.

    Args:
        tag_id: Tag ID
        update_data: Fields to update
            - name_en: Optional new English name
            - name_ar: Optional new Arabic name
            - category_id: Optional new category ID
            - is_active: Optional active status
        db: Database session
        current_user: Authenticated user
        _: Admin requirement dependency

    Returns:
        TagRead: Updated tag

    Raises:
        HTTPException 400: Category not found
        HTTPException 404: Tag not found
        HTTPException 500: Database error

    **Permissions:** Admin only
    """
    try:
        tag = await db.get(Tag, tag_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tag with ID {tag_id} not found",
            )

        if update_data.name_en is not None:
            tag.name_en = update_data.name_en

        if update_data.name_ar is not None:
            tag.name_ar = update_data.name_ar

        if update_data.category_id is not None:
            # Verify category exists
            await _verify_category_exists(db, update_data.category_id)
            tag.category_id = update_data.category_id

        if update_data.is_active is not None:
            tag.is_active = update_data.is_active

        tag.updated_by = current_user.id

        await db.commit()
        await db.refresh(tag)

        return tag
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while updating tag: {str(e)}"
        )


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_admin),
) -> None:
    """
    Soft delete a tag (admin only).

    Marks the tag as deleted (is_deleted=true) and inactive without
    removing it from the database.

    Args:
        tag_id: Tag ID
        db: Database session
        current_user: Authenticated user
        _: Admin requirement dependency

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Tag not found
        HTTPException 500: Database error

    **Permissions:** Admin only
    """
    try:
        tag = await db.get(Tag, tag_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tag with ID {tag_id} not found",
            )

        tag.is_deleted = True
        tag.is_active = False

        await db.commit()
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while deleting tag: {str(e)}"
        )
