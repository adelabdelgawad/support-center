"""
Section schemas for API validation and serialization.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class SectionBase(HTTPSchemaModel):
    """Base section schema with common fields."""

    name: str = Field(..., min_length=2, max_length=100)
    shown_name_en: str = Field(
        ..., min_length=2, max_length=100, description="Display name in English"
    )
    shown_name_ar: str = Field(
        ..., min_length=2, max_length=100, description="Display name in Arabic"
    )
    description: Optional[str] = Field(None, max_length=500)
    is_active: bool = True
    is_shown: bool = True


class SectionCreate(SectionBase):
    """Schema for creating a new service section."""

    pass


class SectionUpdate(HTTPSchemaModel):
    """Schema for updating a service section."""

    name: Optional[str] = Field(None, min_length=2, max_length=100)
    shown_name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    shown_name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None
    is_shown: Optional[bool] = None


class SectionRead(SectionBase):
    """Schema for reading service section data."""

    id: int
    is_deleted: bool = False
    created_at: datetime


class SectionListItem(HTTPSchemaModel):
    """Lightweight schema for service section lists."""

    id: int
    name: str
    shown_name_en: str
    shown_name_ar: str
    is_active: bool
    is_shown: bool


class TechnicianInfo(HTTPSchemaModel):
    """Technician information for section assignments."""

    id: str
    username: str
    full_name: str
    is_active: bool


class SectionWithTechnicians(HTTPSchemaModel):
    """Service section with assigned technicians."""

    id: int
    name: str
    shown_name_en: str
    shown_name_ar: str
    is_active: bool
    is_shown: bool
    technicians: List[TechnicianInfo] = []
