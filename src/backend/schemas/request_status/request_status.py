"""
Request Status schemas for API validation and serialization.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel
from uuid import UUID


class RequestStatusBase(HTTPSchemaModel):
    """Base request status schema with common fields."""
    name: str = Field(..., min_length=2, max_length=50,
                      description="Status name identifier (internal)")
    name_en: str = Field(..., min_length=2, max_length=100,
                         description="Display name in English")
    name_ar: str = Field(..., min_length=2, max_length=100,
                         description="Display name in Arabic")
    description: Optional[str] = Field(None, max_length=500,
                      description="Status description")
    color: Optional[str] = Field(None, max_length=20,
                      description="Hex color code for status")
    readonly: bool = Field(
        default=False, description="Whether this status is readonly")
    is_active: bool = Field(
        default=True, description="Whether this status is currently active/available")
    count_as_solved: bool = Field(
        default=False, description="Whether requests with this status count as solved/completed")
    visible_on_requester_page: bool = Field(
        default=True, description="Whether requests with this status are visible on the requester's tickets page")


class RequestStatusCreate(RequestStatusBase):
    """Schema for creating a new request status."""
    pass


class RequestStatusUpdate(HTTPSchemaModel):
    """Schema for updating a request status."""
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, max_length=20)
    readonly: Optional[bool] = None
    is_active: Optional[bool] = None
    count_as_solved: Optional[bool] = None
    visible_on_requester_page: Optional[bool] = None


class RequestStatusRead(RequestStatusBase):
    """Schema for reading request status data."""
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class RequestStatusListItem(HTTPSchemaModel):
    """Lightweight schema for request status lists."""
    id: int
    name: str
    name_en: str
    name_ar: str
    readonly: bool
    is_active: bool
    count_as_solved: bool
    visible_on_requester_page: bool
    created_at: datetime


class RequestStatusDetail(RequestStatusRead):
    """Detailed request status schema with relationships."""
    requests_count: int = 0


class RequestStatusSummary(HTTPSchemaModel):
    """Summary of request status statistics."""
    total_statuses: int
    readonly_statuses: int
    active_statuses: int
    inactive_statuses: int


class RequestStatusListResponse(HTTPSchemaModel):
    """Paginated list response with statistics."""
    statuses: List[RequestStatusRead]
    total: int
    active_count: int
    inactive_count: int
    readonly_count: int


class BulkRequestStatusUpdate(HTTPSchemaModel):
    """Bulk status update request."""
    status_ids: List[int]
    is_active: bool
