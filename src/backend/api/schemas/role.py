"""
Role schemas for user role management.

This module contains schemas for managing user roles and permissions.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from core.schema_base import HTTPSchemaModel
from pydantic import Field


class RoleBase(HTTPSchemaModel):
    """Base schema for role."""
    name: str = Field(..., description="Role name")
    description: Optional[str] = Field(default=None, description="Role description")
    is_active: bool = Field(default=True, description="Whether role is active")


class RoleCreate(RoleBase):
    """Schema for creating a role."""
    pass


class RoleRead(RoleBase):
    """Schema for reading a role."""
    id: UUID = Field(..., description="Unique identifier")


class RoleUpdate(HTTPSchemaModel):
    """Schema for updating a role."""
    name: Optional[str] = Field(default=None, description="Role name")
    description: Optional[str] = Field(default=None, description="Role description")
    is_active: Optional[bool] = Field(default=None, description="Whether role is active")


class RoleWithPagesAndUsers(RoleRead):
    """Schema for role with associated pages and users."""
    page_paths: List[str] = Field(default_factory=list, description="Active page paths")
    total_users: int = Field(default=0, description="Number of associated users")
    created_at: Optional[datetime] = Field(default=None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp")
    created_by: Optional[UUID] = Field(default=None, description="Creator user ID")
    updated_by: Optional[UUID] = Field(default=None, description="Last updater user ID")


class RoleListResponse(HTTPSchemaModel):
    """Schema for list of roles."""
    roles: List[RoleWithPagesAndUsers] = Field(
        default_factory=list, description="List of roles")
    total: int = Field(..., description="Total count")
    active_count: int = Field(default=0, description="Active roles count")
    inactive_count: int = Field(default=0, description="Inactive roles count")


class RolePagesUpdateRequest(HTTPSchemaModel):
    """Schema for updating role's associated pages."""
    original_page_ids: List[int] = Field(..., description="Current page IDs before update")
    updated_page_ids: List[int] = Field(..., description="New page IDs after update")


class RoleUsersUpdateRequest(HTTPSchemaModel):
    """Schema for updating role's associated users."""
    original_user_ids: List[str] = Field(..., description="Current user IDs before update")
    updated_user_ids: List[str] = Field(..., description="New user IDs after update")
