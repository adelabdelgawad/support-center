"""
Category and Subcategory service with performance optimizations.
Enhanced with centralized logging and error handling.
"""

import logging
from typing import List, Optional

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import Category, Subcategory
from api.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    SubcategoryCreate,
    SubcategoryUpdate,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api.repositories.setting.category_repository import (
    CategoryRepository,
    SubcategoryRepository,
)

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class CategoryService:
    """Service for managing categories and subcategories."""

    # =========================================================================
    # CATEGORY OPERATIONS
    # =========================================================================

    @staticmethod
    @safe_database_query("list_categories", default_return=[])
    @log_database_operation("category listing", level="debug")
    async def list_categories(
        db: AsyncSession, active_only: bool = True, include_subcategories: bool = False
    ) -> List[Category]:
        """
        List all categories.

        Args:
            db: Database session
            active_only: Only return active categories
            include_subcategories: Include subcategories in response

        Returns:
            List of categories
        """
        if active_only:
            return await CategoryRepository.find_all_active(
                db, include_subcategories=include_subcategories
            )

        return await CategoryRepository.find_all(
            db,
            eager_load=[Category.subcategories] if include_subcategories else None,
            order_by=Category.name,
        )

    @staticmethod
    @safe_database_query("get_category")
    @log_database_operation("category retrieval", level="debug")
    async def get_category(
        db: AsyncSession, category_id: int, include_subcategories: bool = True
    ) -> Optional[Category]:
        """
        Get a category by ID.

        Args:
            db: Database session
            category_id: Category ID
            include_subcategories: Include subcategories

        Returns:
            Category or None
        """
        return await CategoryRepository.find_by_id(
            db,
            category_id,
            eager_load=[Category.subcategories] if include_subcategories else None,
        )

    @staticmethod
    @transactional_database_operation("create_category")
    @log_database_operation("category creation", level="debug")
    async def create_category(
        db: AsyncSession, category_data: CategoryCreate
    ) -> Category:
        """
        Create a new category.

        Args:
            db: Database session
            category_data: Category creation data

        Returns:
            Created category
        """
        return await CategoryRepository.create(
            db, obj_in=category_data.model_dump(), commit=True
        )

    @staticmethod
    @transactional_database_operation("update_category")
    @log_database_operation("category update", level="debug")
    async def update_category(
        db: AsyncSession, category_id: int, update_data: CategoryUpdate
    ) -> Optional[Category]:
        """
        Update a category.

        Args:
            db: Database session
            category_id: Category ID
            update_data: Update data

        Returns:
            Updated category or None
        """
        return await CategoryRepository.update(
            db,
            id_value=category_id,
            obj_in=update_data.model_dump(exclude_unset=True),
            commit=True,
        )

    @staticmethod
    @transactional_database_operation("delete_category")
    @log_database_operation("category deletion", level="debug")
    async def delete_category(db: AsyncSession, category_id: int) -> bool:
        """
        Delete a category (mark as inactive).

        Args:
            db: Database session
            category_id: Category ID

        Returns:
            True if deleted, False if not found
        """
        category = await CategoryRepository.find_by_id(db, category_id)
        if not category:
            return False

        category.is_active = False
        await db.commit()

        return True

    # =========================================================================
    # SUBCATEGORY OPERATIONS
    # =========================================================================

    @staticmethod
    @safe_database_query("list_subcategories", default_return=[])
    @log_database_operation("subcategory listing", level="debug")
    async def list_subcategories(
        db: AsyncSession, category_id: Optional[int] = None, active_only: bool = True
    ) -> List[Subcategory]:
        """
        List subcategories.

        Args:
            db: Database session
            category_id: Filter by category ID
            active_only: Only return active subcategories

        Returns:
            List of subcategories
        """
        if category_id:
            return await SubcategoryRepository.find_subcategories_by_category(
                db, category_id
            )

        filters = {}
        if active_only:
            filters["is_active"] = True

        return await SubcategoryRepository.find_all(
            db, filters=filters if active_only else None, order_by=Subcategory.name
        )

    @staticmethod
    @safe_database_query("get_subcategory")
    @log_database_operation("subcategory retrieval", level="debug")
    async def get_subcategory(
        db: AsyncSession, subcategory_id: int
    ) -> Optional[Subcategory]:
        """
        Get a subcategory by ID.

        Args:
            db: Database session
            subcategory_id: Subcategory ID

        Returns:
            Subcategory or None
        """
        return await SubcategoryRepository.find_by_id(db, subcategory_id)

    @staticmethod
    @transactional_database_operation("create_subcategory")
    @log_database_operation("subcategory creation", level="debug")
    async def create_subcategory(
        db: AsyncSession, subcategory_data: SubcategoryCreate
    ) -> Subcategory:
        """
        Create a new subcategory.

        Args:
            db: Database session
            subcategory_data: Subcategory creation data

        Returns:
            Created subcategory
        """
        # Verify category exists
        category = await CategoryRepository.find_by_id(db, subcategory_data.category_id)

        if not category:
            raise ValueError(f"Category {subcategory_data.category_id} not found")

        return await SubcategoryRepository.create(
            db, obj_in=subcategory_data.model_dump(), commit=True
        )

    @staticmethod
    @transactional_database_operation("update_subcategory")
    @log_database_operation("subcategory update", level="debug")
    async def update_subcategory(
        db: AsyncSession, subcategory_id: int, update_data: SubcategoryUpdate
    ) -> Optional[Subcategory]:
        """
        Update a subcategory.

        Args:
            db: Database session
            subcategory_id: Subcategory ID
            update_data: Update data

        Returns:
            Updated subcategory or None
        """
        return await SubcategoryRepository.update(
            db,
            id_value=subcategory_id,
            obj_in=update_data.model_dump(exclude_unset=True),
            commit=True,
        )

    @staticmethod
    @transactional_database_operation("delete_subcategory")
    @log_database_operation("subcategory deletion", level="debug")
    async def delete_subcategory(db: AsyncSession, subcategory_id: int) -> bool:
        """
        Delete a subcategory (mark as inactive).

        Args:
            db: Database session
            subcategory_id: Subcategory ID

        Returns:
            True if deleted, False if not found
        """
        subcategory = await SubcategoryRepository.find_by_id(db, subcategory_id)
        if not subcategory:
            return False

        # Mark as inactive instead of deleting
        subcategory.is_active = False
        await db.commit()

        return True
