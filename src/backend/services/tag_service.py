"""Service for managing tags with bilingual support."""

import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import log_database_operation, safe_database_query, transactional_database_operation
from models.database_models import Category, Tag
from repositories.base_repository import BaseRepository
from schemas.tag import TagCreate, TagRead, TagUpdate

logger = logging.getLogger(__name__)


class TagService:
    """Service for tag operations."""

    @staticmethod
    @safe_database_query(default_return=[])
    async def list_tags(
        db: AsyncSession,
        active_only: bool = True,
        include_category: bool = False,
        category_id: Optional[int] = None,
    ) -> List[Tag]:
        """
        List all tags.

        Args:
            db: Database session
            active_only: Filter to active tags only
            include_category: Eagerly load category relationship
            category_id: Filter by category ID

        Returns:
            List of tags
        """
        query = select(Tag)

        if active_only:
            query = query.where(Tag.is_active == True, Tag.is_deleted == False)

        if category_id is not None:
            query = query.where(Tag.category_id == category_id)

        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    @safe_database_query()
    async def get_tag(db: AsyncSession, tag_id: int) -> Optional[Tag]:
        """
        Get a single tag by ID.

        Args:
            db: Database session
            tag_id: Tag ID

        Returns:
            Tag or None if not found
        """
        return await db.get(Tag, tag_id)

    @staticmethod
    @transactional_database_operation(operation_name="create_tag")
    @log_database_operation("tag creation", level="info")
    async def create_tag(
        db: AsyncSession,
        tag_data: TagCreate,
        created_by_id: Optional[UUID] = None,
    ) -> Tag:
        """
        Create a new tag.

        Args:
            db: Database session
            tag_data: Tag creation data
            created_by_id: User UUID who created the tag

        Returns:
            Created tag
        """
        # Verify category exists
        category = await db.get(Category, tag_data.category_id)
        if not category:
            raise ValueError(f"Category with ID {tag_data.category_id} not found")

        tag = Tag(
            name_en=tag_data.name_en,
            name_ar=tag_data.name_ar,
            category_id=tag_data.category_id,
            is_active=tag_data.is_active,
            created_by=created_by_id,
        )

        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        return tag

    @staticmethod
    @transactional_database_operation(operation_name="update_tag")
    @log_database_operation("tag update", level="info")
    async def update_tag(
        db: AsyncSession,
        tag_id: int,
        update_data: TagUpdate,
        updated_by_id: Optional[UUID] = None,
    ) -> Optional[Tag]:
        """
        Update a tag.

        Args:
            db: Database session
            tag_id: Tag ID to update
            update_data: Update data
            updated_by_id: User UUID who updated the tag

        Returns:
            Updated tag or None if not found
        """
        tag = await db.get(Tag, tag_id)
        if not tag:
            return None

        if update_data.name_en is not None:
            tag.name_en = update_data.name_en

        if update_data.name_ar is not None:
            tag.name_ar = update_data.name_ar

        if update_data.category_id is not None:
            # Verify category exists
            category = await db.get(Category, update_data.category_id)
            if not category:
                raise ValueError(f"Category with ID {update_data.category_id} not found")
            tag.category_id = update_data.category_id

        if update_data.is_active is not None:
            tag.is_active = update_data.is_active

        if updated_by_id is not None:
            tag.updated_by = updated_by_id

        await db.commit()
        await db.refresh(tag)

        return tag

    @staticmethod
    @transactional_database_operation(operation_name="delete_tag")
    @log_database_operation("tag deletion", level="info")
    async def delete_tag(db: AsyncSession, tag_id: int) -> bool:
        """
        Soft delete a tag.

        Args:
            db: Database session
            tag_id: Tag ID to delete

        Returns:
            True if deleted, False if not found
        """
        tag = await db.get(Tag, tag_id)
        if not tag:
            return False

        tag.is_deleted = True
        tag.is_active = False

        await db.commit()

        return True
