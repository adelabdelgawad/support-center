"""
Business Unit Region schemas for API validation and serialization.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel
from uuid import UUID


class BusinessUnitRegionBase(HTTPSchemaModel):
    """Base business unit region schema with common fields."""
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class BusinessUnitRegionCreate(BusinessUnitRegionBase):
    """Schema for creating a new business unit region."""
    pass


class BusinessUnitRegionUpdate(HTTPSchemaModel):
    """Schema for updating a business unit region."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class BusinessUnitRegionRead(BusinessUnitRegionBase):
    """Schema for reading business unit region data."""
    id: int
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class BusinessUnitRegionListResponse(HTTPSchemaModel):
    """Paginated list response with statistics."""
    regions: List[BusinessUnitRegionRead]
    total: int
    active_count: int
    inactive_count: int


class BusinessUnitRegionCountsResponse(HTTPSchemaModel):
    """Business unit region count statistics."""
    total: int
    active_count: int
    inactive_count: int


class BulkBusinessUnitRegionStatusUpdate(HTTPSchemaModel):
    """Bulk status update request."""
    region_ids: List[int]
    is_active: bool
