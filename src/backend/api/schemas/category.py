"""
Category and Subcategory schemas for API validation and serialization.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class CategoryBase(HTTPSchemaModel):
    """Base category schema with common fields."""
    name: str = Field(..., min_length=2, max_length=100, description="Internal identifier")
    name_en: str = Field(..., min_length=2, max_length=100, description="Category name in English")
    name_ar: str = Field(..., min_length=2, max_length=100, description="Category name in Arabic")
    description: Optional[str] = Field(None, max_length=500)
    is_active: bool = True


class CategoryCreate(CategoryBase):
    """Schema for creating a new category."""
    pass


class CategoryUpdate(HTTPSchemaModel):
    """Schema for updating a category."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class CategoryRead(CategoryBase):
    """Schema for reading category data."""
    id: int
    created_at: datetime
    updated_at: datetime


class SubcategoryBase(HTTPSchemaModel):
    """Base subcategory schema with common fields."""
    category_id: int
    name: str = Field(..., min_length=2, max_length=100, description="Internal identifier")
    name_en: str = Field(..., min_length=2, max_length=100, description="Subcategory name in English")
    name_ar: str = Field(..., min_length=2, max_length=100, description="Subcategory name in Arabic")
    description: Optional[str] = Field(None, max_length=500)
    is_active: bool = True


class SubcategoryCreate(SubcategoryBase):
    """Schema for creating a new subcategory."""
    pass


class SubcategoryUpdate(HTTPSchemaModel):
    """Schema for updating a subcategory."""
    category_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class SubcategoryRead(SubcategoryBase):
    """Schema for reading subcategory data."""
    id: int
    created_at: datetime
    updated_at: datetime


class CategoryWithSubcategories(CategoryRead):
    """Category schema with subcategories."""
    subcategories: List[SubcategoryRead] = []
