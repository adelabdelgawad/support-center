"""
Role schemas for API validation.
All schemas inherit from HTTPSchemaModel for Next.js compatibility.
"""
from typing import List, Optional
from datetime import datetime
from uuid import UUID

from core.schema_base import HTTPSchemaModel


class RoleBase(HTTPSchemaModel):
    """Base role schema with common fields."""

    name: str
    description: Optional[str] = None
    is_active: bool = True


class RoleCreate(RoleBase):
    """Schema for creating a new role."""

    pass


class RoleUpdate(HTTPSchemaModel):
    """Schema for updating a role."""

    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class RoleRead(RoleBase):
    """Schema for reading a role."""

    id: UUID
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class RoleWithPages(RoleRead):
    """Role with associated page paths."""

    page_paths: List[str] = []


class RoleWithUsers(RoleRead):
    """Role with user count."""

    total_users: int = 0


class RoleWithPagesAndUsers(RoleRead):
    """Role with both pages and user count."""

    page_paths: List[str] = []
    total_users: int = 0


class RoleListResponse(HTTPSchemaModel):
    """Response for listing roles with statistics."""

    roles: List[RoleWithPagesAndUsers]
    total: int
    active_count: int
    inactive_count: int


class RolePagesUpdateRequest(HTTPSchemaModel):
    """Request for updating role's page assignments."""

    original_page_ids: List[int]
    updated_page_ids: List[int]


class RoleUsersUpdateRequest(HTTPSchemaModel):
    """Request for updating role's user assignments."""

    original_user_ids: List[UUID]
    updated_user_ids: List[UUID]
