"""
Request Type schemas for API validation and serialization.
Supports bilingual names (English/Arabic) and brief hints.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class RequestTypeBase(HTTPSchemaModel):
    """Base request type schema with bilingual fields."""
    name_en: str = Field(..., min_length=2, max_length=100, description="Name in English")
    name_ar: str = Field(..., min_length=2, max_length=100, description="Name in Arabic")
    brief_en: Optional[str] = Field(None, max_length=500, description="Brief hint in English")
    brief_ar: Optional[str] = Field(None, max_length=500, description="Brief hint in Arabic")
    is_active: bool = True


class RequestTypeCreate(RequestTypeBase):
    """Schema for creating a new request type."""
    pass


class RequestTypeUpdate(HTTPSchemaModel):
    """Schema for updating a request type."""
    name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    brief_en: Optional[str] = Field(None, max_length=500)
    brief_ar: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class RequestTypeRead(RequestTypeBase):
    """Schema for reading request type data."""
    id: int
    created_at: datetime
    updated_at: datetime


class RequestTypeListItem(HTTPSchemaModel):
    """Lightweight schema for request type lists."""
    id: int
    name_en: str
    name_ar: str
    brief_en: Optional[str] = None
    brief_ar: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RequestTypeListResponse(HTTPSchemaModel):
    """Response schema for paginated request type list."""
    types: List[RequestTypeRead]
    total: int
    active_count: int
    inactive_count: int


class BulkRequestTypeUpdate(HTTPSchemaModel):
    """Schema for bulk updating request type status."""
    type_ids: List[int]
    is_active: bool
