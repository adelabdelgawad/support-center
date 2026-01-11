"""
Business Unit User Assignment schemas for API validation and serialization.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class BusinessUnitUserAssignBase(HTTPSchemaModel):
    """Base business unit user assignment schema with common fields."""

    user_id: UUID
    business_unit_id: int
    is_active: bool = True
    is_deleted: bool = False


class BusinessUnitUserAssignCreate(HTTPSchemaModel):
    """Schema for creating a new business unit user assignment."""

    user_id: UUID
    business_unit_id: int


class BusinessUnitUserAssignUpdate(HTTPSchemaModel):
    """Schema for updating a business unit user assignment."""

    business_unit_id: Optional[int] = None
    user_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    is_deleted: Optional[bool] = None


class BusinessUnitUserAssignRead(BusinessUnitUserAssignBase):
    """Schema for reading business unit user assignment data."""

    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class BusinessUnitUserAssignListResponse(HTTPSchemaModel):
    """Schema for list response with pagination info."""

    assignments: List[BusinessUnitUserAssignRead]
    total: int
    active_count: int
    inactive_count: int


class BulkAssignUsersRequest(HTTPSchemaModel):
    """Schema for bulk assigning users to a business unit."""

    user_ids: List[UUID] = Field(..., min_length=1)
    business_unit_id: int


class BulkRemoveUsersRequest(HTTPSchemaModel):
    """Schema for bulk removing users from a business unit."""

    user_ids: List[UUID] = Field(..., min_length=1)
    business_unit_id: int
