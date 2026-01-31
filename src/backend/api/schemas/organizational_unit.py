"""
Organizational Unit schemas for Active Directory integration.

This module contains schemas for managing organizational units from AD.
"""
from typing import List, Optional
from uuid import UUID

from core.schema_base import HTTPSchemaModel
from pydantic import Field


class OrganizationalUnitBase(HTTPSchemaModel):
    """Base schema for organizational unit."""
    name: str = Field(..., description="OU name")
    distinguished_name: str = Field(..., description="LDAP distinguished name")
    description: Optional[str] = Field(default=None, description="OU description")


class OrganizationalUnitCreate(OrganizationalUnitBase):
    """Schema for creating an organizational unit."""
    pass


class OrganizationalUnitRead(OrganizationalUnitBase):
    """Schema for reading an organizational unit."""
    id: UUID = Field(..., description="Unique identifier")
    is_enabled: bool = Field(default=True, description="Whether OU is enabled")


class OrganizationalUnitUpdate(HTTPSchemaModel):
    """Schema for updating an organizational unit."""
    name: Optional[str] = Field(default=None, description="OU name")
    description: Optional[str] = Field(default=None, description="OU description")
    is_enabled: Optional[bool] = Field(default=None, description="Whether OU is enabled")


class OrganizationalUnitListResponse(HTTPSchemaModel):
    """Schema for list of organizational units."""
    organizational_units: List[OrganizationalUnitRead] = Field(
        default_factory=list, description="List of organizational units")
    total: int = Field(..., description="Total count")


class OrganizationalUnitToggleRequest(HTTPSchemaModel):
    """Schema for toggling OU enabled status."""
    is_enabled: bool = Field(..., description="New enabled status")


class DiscoverOUsResponse(HTTPSchemaModel):
    """Schema for discovered OUs from Active Directory."""
    discovered_ous: List[str] = Field(
        default_factory=list, description="List of discovered OU distinguished names")
    count: int = Field(..., description="Number of OUs discovered")


class OUSyncRequest(HTTPSchemaModel):
    """Schema for OU synchronization request."""
    force_sync: bool = Field(default=False, description="Force full synchronization")


class OUSyncResponse(HTTPSchemaModel):
    """Schema for OU synchronization response."""
    synced_count: int = Field(..., description="Number of OUs synchronized")
    added_count: int = Field(default=0, description="Number of new OUs added")
    updated_count: int = Field(default=0, description="Number of OUs updated")
    message: str = Field(..., description="Sync operation message")
