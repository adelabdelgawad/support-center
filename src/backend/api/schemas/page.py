from typing import List, Optional
from datetime import datetime
from uuid import UUID

from core.schema_base import HTTPSchemaModel


# Base schemas
class PageBase(HTTPSchemaModel):
    """Base page schema with common fields."""

    path: Optional[str] = None
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: bool = True


class PageCreate(PageBase):
    """Schema for creating a new page."""

    pass


class PageUpdate(HTTPSchemaModel):
    """Schema for updating a page."""

    path: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: Optional[bool] = None


class PageRead(PageBase):
    """Schema for reading a page."""

    id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


# Page-Role Permission schemas
class PageRoleCreate(HTTPSchemaModel):
    """Schema for creating a page-role permission."""

    role_id: UUID
    page_id: int


class PageRoleRead(HTTPSchemaModel):
    """Schema for reading a page-role permission."""

    id: int
    role_id: UUID
    page_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PageRoleDetailedResponse(HTTPSchemaModel):
    """Page-role permission with role and page names."""

    id: int
    role_id: UUID
    page_id: int
    is_active: bool
    role_name: str | None = None
    page_title: str | None = None


class PageRoleListResponse(HTTPSchemaModel):
    """Response for listing page-role permissions."""

    permissions: List[PageRoleDetailedResponse]
    total: int


# Complex page responses
class PageWithRolesName(HTTPSchemaModel):
    """Page with associated role names."""

    id: int
    path: str | None = None
    title: str
    description: str | None
    icon: str | None
    is_active: bool
    parent_id: int | None = None
    role_names: List[str]
    total_roles: int


class RolePagesResponse(HTTPSchemaModel):
    """Response for getting pages assigned to a role."""

    role_id: UUID
    role_name: str
    pages: List[PageRead]
    total_pages: int
