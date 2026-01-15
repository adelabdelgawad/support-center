"""
Organizational Unit schemas for API validation.
All schemas inherit from HTTPSchemaModel for Next.js compatibility.
"""
from typing import Optional
from datetime import datetime

from core.schema_base import HTTPSchemaModel


class OrganizationalUnitBase(HTTPSchemaModel):
    """Base organizational unit schema with common fields."""

    ou_name: str
    ou_dn: Optional[str] = None
    is_enabled: bool = True
    description: Optional[str] = None


class OrganizationalUnitCreate(OrganizationalUnitBase):
    """Schema for creating a new organizational unit."""

    pass


class OrganizationalUnitUpdate(HTTPSchemaModel):
    """Schema for updating an organizational unit."""

    ou_name: Optional[str] = None
    ou_dn: Optional[str] = None
    is_enabled: Optional[bool] = None
    description: Optional[str] = None


class OrganizationalUnitRead(OrganizationalUnitBase):
    """Schema for reading an organizational unit."""

    id: int
    user_count: Optional[int] = 0
    last_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class OrganizationalUnitListResponse(HTTPSchemaModel):
    """Response for listing organizational units."""

    organizational_units: list[OrganizationalUnitRead]
    total: int
    enabled_count: int
    disabled_count: int


class OrganizationalUnitToggleRequest(HTTPSchemaModel):
    """Request for toggling organizational unit enabled status."""

    is_enabled: bool


class DiscoverOUsResponse(HTTPSchemaModel):
    """Response for discovering OUs from Active Directory."""

    ou_name: str
    ou_dn: str
    already_exists: bool = False
