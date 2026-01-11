"""
Category and Subcategory service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
import logging
from typing import List, Optional

from core.decorators import (log_database_operation, safe_database_query,
                             transactional_database_operation)
from models import Category, Subcategory
from schemas.category import (CategoryCreate, CategoryUpdate,
                               SubcategoryCreate, SubcategoryUpdate)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
        db: AsyncSession,
        active_only: bool = True,
        include_subcategories: bool = False
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
        # Build query
        stmt = select(Category).order_by(Category.name)

        if include_subcategories:
            stmt = stmt.options(selectinload(Category.subcategories))

        if active_only:
            stmt = stmt.where(Category.is_active == True)

        result = await db.execute(stmt)
        categories = result.scalars().all()

        return categories

    @staticmethod
    @safe_database_query("get_category")
    @log_database_operation("category retrieval", level="debug")
    async def get_category(
        db: AsyncSession,
        category_id: int,
        include_subcategories: bool = True
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
        stmt = select(Category).where(Category.id == category_id)

        if include_subcategories:
            stmt = stmt.options(selectinload(Category.subcategories))

        result = await db.execute(stmt)
        category = result.scalar_one_or_none()

        return category

    @staticmethod
    @transactional_database_operation("create_category")
    @log_database_operation("category creation", level="debug")
    async def create_category(
        db: AsyncSession,
        category_data: CategoryCreate
    ) -> Category:
        """
        Create a new category.

        Args:
            db: Database session
            category_data: Category creation data

        Returns:
            Created category
        """
        category = Category(**category_data.model_dump())
        db.add(category)
        await db.commit()
        await db.refresh(category)

        return category

    @staticmethod
    @transactional_database_operation("update_category")
    @log_database_operation("category update", level="debug")
    async def update_category(
        db: AsyncSession,
        category_id: int,
        update_data: CategoryUpdate
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
        stmt = select(Category).where(Category.id == category_id)
        result = await db.execute(stmt)
        category = result.scalar_one_or_none()

        if not category:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(category, field, value)

        await db.commit()
        await db.refresh(category)

        return category

    @staticmethod
    @transactional_database_operation("delete_category")
    @log_database_operation("category deletion", level="debug")
    async def delete_category(
        db: AsyncSession,
        category_id: int
    ) -> bool:
        """
        Delete a category (mark as inactive).

        Args:
            db: Database session
            category_id: Category ID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(Category).where(Category.id == category_id)
        result = await db.execute(stmt)
        category = result.scalar_one_or_none()

        if not category:
            return False

        # Mark as inactive instead of deleting
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
        db: AsyncSession,
        category_id: Optional[int] = None,
        active_only: bool = True
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
        stmt = select(Subcategory).order_by(Subcategory.name)

        if category_id:
            stmt = stmt.where(Subcategory.category_id == category_id)

        if active_only:
            stmt = stmt.where(Subcategory.is_active == True)

        result = await db.execute(stmt)
        subcategories = result.scalars().all()

        return subcategories

    @staticmethod
    @safe_database_query("get_subcategory")
    @log_database_operation("subcategory retrieval", level="debug")
    async def get_subcategory(
        db: AsyncSession,
        subcategory_id: int
    ) -> Optional[Subcategory]:
        """
        Get a subcategory by ID.

        Args:
            db: Database session
            subcategory_id: Subcategory ID

        Returns:
            Subcategory or None
        """
        stmt = select(Subcategory).where(Subcategory.id == subcategory_id)
        result = await db.execute(stmt)
        subcategory = result.scalar_one_or_none()

        return subcategory

    @staticmethod
    @transactional_database_operation("create_subcategory")
    @log_database_operation("subcategory creation", level="debug")
    async def create_subcategory(
        db: AsyncSession,
        subcategory_data: SubcategoryCreate
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
        category_stmt = select(Category).where(
            Category.id == subcategory_data.category_id
        )
        category_result = await db.execute(category_stmt)
        category = category_result.scalar_one_or_none()

        if not category:
            raise ValueError(f"Category {subcategory_data.category_id} not found")

        subcategory = Subcategory(**subcategory_data.model_dump())
        db.add(subcategory)
        await db.commit()
        await db.refresh(subcategory)

        return subcategory

    @staticmethod
    @transactional_database_operation("update_subcategory")
    @log_database_operation("subcategory update", level="debug")
    async def update_subcategory(
        db: AsyncSession,
        subcategory_id: int,
        update_data: SubcategoryUpdate
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
        stmt = select(Subcategory).where(Subcategory.id == subcategory_id)
        result = await db.execute(stmt)
        subcategory = result.scalar_one_or_none()

        if not subcategory:
            return None

        old_category_id = subcategory.category_id

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(subcategory, field, value)

        await db.commit()
        await db.refresh(subcategory)

        return subcategory

    @staticmethod
    @transactional_database_operation("delete_subcategory")
    @log_database_operation("subcategory deletion", level="debug")
    async def delete_subcategory(
        db: AsyncSession,
        subcategory_id: int
    ) -> bool:
        """
        Delete a subcategory (mark as inactive).

        Args:
            db: Database session
            subcategory_id: Subcategory ID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(Subcategory).where(Subcategory.id == subcategory_id)
        result = await db.execute(stmt)
        subcategory = result.scalar_one_or_none()

        if not subcategory:
            return False

        category_id = subcategory.category_id

        # Mark as inactive instead of deleting
        subcategory.is_active = False
        await db.commit()

        return True
