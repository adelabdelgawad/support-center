"""
Category and Subcategory repository with specialized queries.
"""

from typing import List

from db import Category, Subcategory
from repositories.base_repository import BaseRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


class CategoryRepository(BaseRepository[Category]):
    model = Category

    @classmethod
    async def find_all_active(
        cls,
        db: AsyncSession,
        include_subcategories: bool = True,
    ) -> List[Category]:
        """
        List all active categories.

        Args:
            db: Database session
            include_subcategories: Include subcategories in response

        Returns:
            List of categories
        """
        stmt = select(Category).order_by(Category.name)

        if include_subcategories:
            stmt = stmt.options(selectinload(Category.subcategories))

        stmt = stmt.where(Category.is_active)

        result = await db.execute(stmt)
        categories = result.scalars().all()

        return categories

    @classmethod
    async def find_subcategories_by_category(
        cls,
        db: AsyncSession,
        category_id: int,
    ) -> List[Subcategory]:
        """
        List subcategories by category ID.

        Args:
            db: Database session
            category_id: Category ID

        Returns:
            List of subcategories
        """
        stmt = select(Subcategory).order_by(Subcategory.name)
        stmt = stmt.where(Subcategory.category_id == category_id)
        stmt = stmt.where(Subcategory.is_active)

        result = await db.execute(stmt)
        subcategories = result.scalars().all()

        return subcategories


class SubcategoryRepository(BaseRepository[Subcategory]):
    model = Subcategory
