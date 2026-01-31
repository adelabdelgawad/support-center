"""Tag schema definitions."""

from datetime import datetime
from typing import Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class TagBase(HTTPSchemaModel):
    """Base tag schema with common fields."""

    name_en: str = Field(..., min_length=2, max_length=100, description="Tag name in English")
    name_ar: str = Field(..., min_length=2, max_length=100, description="Tag name in Arabic")
    category_id: int = Field(..., description="Parent category ID")
    is_active: bool = True


class TagCreate(TagBase):
    """Schema for creating a new tag."""

    pass


class TagUpdate(HTTPSchemaModel):
    """Schema for updating a tag."""

    name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryReadMinimal(HTTPSchemaModel):
    """Minimal category read schema for tag responses."""

    id: int
    name: str
    name_en: str
    name_ar: str


class TagRead(TagBase):
    """Schema for reading tag data."""

    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryReadMinimal] = None
