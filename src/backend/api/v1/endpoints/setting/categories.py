"""
Category and Subcategory API endpoints.

Provides endpoints for managing service request categories and subcategories.
Categories organize service requests into logical groups for better routing and reporting.

**Key Features:**
- Category CRUD operations
- Subcategory CRUD operations
- Hierarchical structure (subcategories belong to categories)
- Active/inactive status tracking
- Bilingual support (name_en, name_ar, name_fr)
- Tag associations via categories
"""
from typing import List, Optional

from db.database import get_session
from core.dependencies import get_current_user, require_admin
from fastapi import APIRouter, Depends, HTTPException, Query
from db import User
from api.schemas.category import (CategoryCreate, CategoryRead, CategoryUpdate,
                               CategoryWithSubcategories, SubcategoryCreate,
                               SubcategoryRead, SubcategoryUpdate)
from api.services.category_service import CategoryService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# =============================================================================
# CATEGORY ENDPOINTS
# =============================================================================

@router.get("/categories")
async def list_categories(
    active_only: bool = True,
    include_subcategories: bool = False,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List all categories.

    Returns either a simple list of categories or categories with their
    subcategories based on the include_subcategories parameter.

    Args:
        active_only: Only return active categories (default: true)
        include_subcategories: Include subcategories in response (default: false)
        db: Database session
        current_user: Authenticated user

    Returns:
        List[CategoryRead] when include_subcategories=false
        List[CategoryWithSubcategories] when include_subcategories=true

    **Permissions:** Authenticated users
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
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a category by ID with its subcategories.

    Args:
        category_id: Category ID
        include_subcategories: Include subcategories (default: true)
        db: Database session
        current_user: Authenticated user

    Returns:
        CategoryWithSubcategories: Category with subcategories list

    Raises:
        HTTPException 404: Category not found

    **Permissions:** Authenticated users
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

    Args:
        category_data: Category creation data
            - name: Category name (must be unique)
            - description: Optional description
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated admin user

    Returns:
        CategoryRead: Created category

    Raises:
        HTTPException 400: Validation error

    **Permissions:** Admin only
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
    """
    Update a category (admin only).

    Args:
        category_id: Category ID
        update_data: Fields to update
        db: Database session
        current_user: Authenticated admin user

    Returns:
        CategoryRead: Updated category

    Raises:
        HTTPException 404: Category not found

    **Permissions:** Admin only
    """
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

    Categories are marked as inactive rather than deleted to maintain
    referential integrity with service requests.

    Args:
        category_id: Category ID
        db: Database session
        current_user: Authenticated admin user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Category not found

    **Permissions:** Admin only
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
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List all subcategories.

    Args:
        category_id: Optional filter by category
        active_only: Only return active subcategories (default: true)
        db: Database session
        current_user: Authenticated user

    Returns:
        List[SubcategoryRead]: List of subcategories

    **Permissions:** Authenticated users
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
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a subcategory by ID.

    Args:
        subcategory_id: Subcategory ID
        db: Database session
        current_user: Authenticated user

    Returns:
        SubcategoryRead: Subcategory details

    Raises:
        HTTPException 404: Subcategory not found

    **Permissions:** Authenticated users
    """
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

    Validates that the category_id in the path matches the one in the request body.

    Args:
        category_id: Parent category ID (in path)
        subcategory_data: Subcategory creation data
            - category_id: Parent category ID (must match path)
            - name: Subcategory name (must be unique within category)
            - description: Optional description
            - is_active: Active status (default: true)
        db: Database session
        current_user: Authenticated admin user

    Returns:
        SubcategoryRead: Created subcategory

    Raises:
        HTTPException 400: Category ID mismatch or validation error
        HTTPException 404: Category not found

    **Permissions:** Admin only
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
    Use this when you want to specify the parent category in the body only.

    Args:
        subcategory_data: Subcategory creation data
            - category_id: Parent category ID
            - name: Subcategory name
            - description: Optional description
            - is_active: Active status
        db: Database session
        current_user: Authenticated admin user

    Returns:
        SubcategoryRead: Created subcategory

    Raises:
        HTTPException 400: Validation error
        HTTPException 404: Category not found

    **Permissions:** Admin only
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
    """
    Update a subcategory (admin only).

    Args:
        subcategory_id: Subcategory ID
        update_data: Fields to update
        db: Database session
        current_user: Authenticated admin user

    Returns:
        SubcategoryRead: Updated subcategory

    Raises:
        HTTPException 404: Subcategory not found

    **Permissions:** Admin only
    """
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

    Subcategories are marked as inactive rather than deleted to maintain
    referential integrity with service requests.

    Args:
        subcategory_id: Subcategory ID
        db: Database session
        current_user: Authenticated admin user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: Subcategory not found

    **Permissions:** Admin only
    """
    success = await CategoryService.delete_subcategory(
        db=db,
        subcategory_id=subcategory_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    return None
