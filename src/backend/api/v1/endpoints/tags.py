"""Tag API endpoints."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user, require_admin
from models.database_models import User
from schemas.tag import TagCreate, TagRead, TagUpdate
from services.tag_service import TagService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=List[TagRead])
async def list_tags(
    db: AsyncSession = Depends(get_session),
    active_only: bool = Query(True),
    category_id: Optional[int] = Query(None),
) -> List[TagRead]:
    """
    List all tags.

    Query parameters:
    - active_only: Filter to active tags (default: true)
    - category_id: Filter by category ID (optional)
    """
    tags = await TagService.list_tags(
        db,
        active_only=active_only,
        include_category=True,
        category_id=category_id,
    )
    return tags


@router.get("/{tag_id}", response_model=TagRead)
async def get_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_session),
) -> TagRead:
    """Get a single tag by ID."""
    tag = await TagService.get_tag(db, tag_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with ID {tag_id} not found",
        )
    return tag


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_data: TagCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_admin),
) -> TagRead:
    """
    Create a new tag (admin only).

    Required fields:
    - name_en: Tag name in English
    - name_ar: Tag name in Arabic
    - category_id: Parent category ID
    """
    try:
        tag = await TagService.create_tag(
            db,
            tag_data,
            created_by_id=current_user.id,
        )
        return tag
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
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

    All fields are optional.
    """
    try:
        tag = await TagService.update_tag(
            db,
            tag_id,
            update_data,
            updated_by_id=current_user.id,
        )
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tag with ID {tag_id} not found",
            )
        return tag
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
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

    Marks the tag as deleted without removing it from the database.
    """
    success = await TagService.delete_tag(db, tag_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with ID {tag_id} not found",
        )
