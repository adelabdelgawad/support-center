"""
Category and Subcategory API endpoints.
"""
from typing import List, Optional

from core.database import get_session
from core.dependencies import require_admin
from fastapi import APIRouter, Depends, HTTPException, Query
from models import User
from schemas.category import (CategoryCreate, CategoryRead, CategoryUpdate,
                               CategoryWithSubcategories, SubcategoryCreate,
                               SubcategoryRead, SubcategoryUpdate)
from services.category_service import CategoryService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# =============================================================================
# CATEGORY ENDPOINTS
# =============================================================================

@router.get("/categories")
async def list_categories(
    active_only: bool = True,
    include_subcategories: bool = False,
    db: AsyncSession = Depends(get_session)
):
    """
    List all categories.

    - **active_only**: Only return active categories (default: true)
    - **include_subcategories**: Include subcategories in response (default: false)

    Returns List[CategoryRead] when include_subcategories=false,
    or List[CategoryWithSubcategories] when include_subcategories=true.
    """
    categories = await CategoryService.list_categories(
        db=db,
        active_only=active_only,
        include_subcategories=include_subcategories
    )

    # Return with or without subcategories based on request
    if include_subcategories:
        return [CategoryWithSubcategories.model_validate(cat) for cat in categories]
    return [CategoryRead.model_validate(cat) for cat in categories]


@router.get("/categories/{category_id}", response_model=CategoryWithSubcategories)
async def get_category(
    category_id: int,
    include_subcategories: bool = True,
    db: AsyncSession = Depends(get_session)
):
    """
    Get a category by ID with its subcategories.

    - **include_subcategories**: Include subcategories (default: true)
    """
    category = await CategoryService.get_category(
        db=db,
        category_id=category_id,
        include_subcategories=include_subcategories
    )

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    return category


@router.post("/categories", response_model=CategoryRead, status_code=201)
async def create_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new category (admin only).

    - **name**: Category name (unique)
    - **description**: Optional description
    """
    try:
        category = await CategoryService.create_category(
            db=db,
            category_data=category_data
        )
        return category
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: int,
    update_data: CategoryUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Update a category (admin only)."""
    category = await CategoryService.update_category(
        db=db,
        category_id=category_id,
        update_data=update_data
    )

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    return category


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete a category (mark as inactive, admin only).

    Note: Categories are marked as inactive rather than deleted
    to maintain referential integrity.
    """
    success = await CategoryService.delete_category(db=db, category_id=category_id)

    if not success:
        raise HTTPException(status_code=404, detail="Category not found")

    return None


# =============================================================================
# SUBCATEGORY ENDPOINTS
# =============================================================================

@router.get("/subcategories", response_model=List[SubcategoryRead])
async def list_subcategories(
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    active_only: bool = True,
    db: AsyncSession = Depends(get_session)
):
    """
    List all subcategories.

    - **category_id**: Filter by category (optional)
    - **active_only**: Only return active subcategories (default: true)
    """
    subcategories = await CategoryService.list_subcategories(
        db=db,
        category_id=category_id,
        active_only=active_only
    )
    return subcategories


@router.get("/subcategories/{subcategory_id}", response_model=SubcategoryRead)
async def get_subcategory(
    subcategory_id: int,
    db: AsyncSession = Depends(get_session)
):
    """Get a subcategory by ID."""
    subcategory = await CategoryService.get_subcategory(
        db=db,
        subcategory_id=subcategory_id
    )

    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    return subcategory


@router.post("/categories/{category_id}/subcategories", response_model=SubcategoryRead, status_code=201)
async def create_subcategory(
    category_id: int,
    subcategory_data: SubcategoryCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new subcategory under a category (admin only).

    - **category_id**: Parent category ID (in path)
    - **name**: Subcategory name (must be unique within category)
    - **description**: Optional description
    """
    # Ensure category_id in path matches the one in data
    if subcategory_data.category_id != category_id:
        raise HTTPException(
            status_code=400,
            detail="Category ID in path must match category_id in request body"
        )

    try:
        subcategory = await CategoryService.create_subcategory(
            db=db,
            subcategory_data=subcategory_data
        )
        return subcategory
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/subcategories", response_model=SubcategoryRead, status_code=201)
async def create_subcategory_direct(
    subcategory_data: SubcategoryCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Create a new subcategory (admin only).

    Alternative endpoint that doesn't require category_id in path.
    """
    try:
        subcategory = await CategoryService.create_subcategory(
            db=db,
            subcategory_data=subcategory_data
        )
        return subcategory
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/subcategories/{subcategory_id}", response_model=SubcategoryRead)
async def update_subcategory(
    subcategory_id: int,
    update_data: SubcategoryUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Update a subcategory (admin only)."""
    subcategory = await CategoryService.update_subcategory(
        db=db,
        subcategory_id=subcategory_id,
        update_data=update_data
    )

    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    return subcategory


@router.delete("/subcategories/{subcategory_id}", status_code=204)
async def delete_subcategory(
    subcategory_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """
    Delete a subcategory (mark as inactive, admin only).

    Note: Subcategories are marked as inactive rather than deleted
    to maintain referential integrity.
    """
    success = await CategoryService.delete_subcategory(
        db=db,
        subcategory_id=subcategory_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    return None
