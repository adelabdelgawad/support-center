"""
Role schemas for user role management.

This module contains schemas for managing user roles and permissions.
"""
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
    page_ids: List[UUID] = Field(default_factory=list, description="Associated page IDs")
    user_ids: List[UUID] = Field(default_factory=list, description="Associated user IDs")
    page_count: int = Field(default=0, description="Number of associated pages")
    user_count: int = Field(default=0, description="Number of associated users")


class RoleListResponse(HTTPSchemaModel):
    """Schema for list of roles."""
    roles: List[RoleWithPagesAndUsers] = Field(
        default_factory=list, description="List of roles")
    total: int = Field(..., description="Total count")


class RolePagesUpdateRequest(HTTPSchemaModel):
    """Schema for updating role's associated pages."""
    page_ids: List[UUID] = Field(..., description="List of page IDs to associate")


class RoleUsersUpdateRequest(HTTPSchemaModel):
    """Schema for updating role's associated users."""
    user_ids: List[UUID] = Field(..., description="List of user IDs to associate")
