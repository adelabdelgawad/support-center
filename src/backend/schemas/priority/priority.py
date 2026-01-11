"""
Priority schemas for API validation and serialization.
"""
from datetime import datetime
from typing import Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class PriorityBase(HTTPSchemaModel):
    """Base priority schema with common fields."""
    name: str = Field(..., min_length=2, max_length=50)
    response_time_minutes: int = Field(..., ge=0)
    resolution_time_hours: int = Field(..., ge=0)
    is_active: bool = True


class PriorityCreate(PriorityBase):
    """Schema for creating a new priority."""
    pass


class PriorityUpdate(HTTPSchemaModel):
    """Schema for updating a priority."""
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    response_time_minutes: Optional[int] = Field(None, ge=0)
    resolution_time_hours: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class PriorityRead(PriorityBase):
    """Schema for reading priority data."""
    id: int
    created_at: datetime
    updated_at: datetime


class PriorityListItem(HTTPSchemaModel):
    """Lightweight schema for priority lists."""
    id: int
    name: str
    response_time_minutes: int
    resolution_time_hours: int
    is_active: bool
