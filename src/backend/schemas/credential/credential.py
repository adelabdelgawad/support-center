"""
Credential schemas for API validation and serialization.

Used by the Deployment Control Plane for managing deployment credentials.
IMPORTANT: vault_ref is NEVER exposed to frontend - only internal worker APIs.
"""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel
from models.model_enum import CredentialType


class CredentialBase(HTTPSchemaModel):
    """Base credential schema with common fields."""

    name: str = Field(..., min_length=1, max_length=100)
    credential_type: str = Field(..., description="Credential type (local_admin, domain_admin)")
    scope: dict = Field(
        default_factory=dict,
        description="Scope definition (subnets, device groups, etc.)",
    )

    @field_validator("credential_type")
    @classmethod
    def validate_credential_type(cls, v: str) -> str:
        """Validate credential type is a valid enum value."""
        valid_types = [t.value for t in CredentialType]
        if v not in valid_types:
            raise ValueError(f"credential_type must be one of: {valid_types}")
        return v


class CredentialCreate(CredentialBase):
    """Schema for creating a credential."""

    vault_ref: Optional[str] = Field(
        None,
        max_length=500,
        description="Opaque vault reference (placeholder for now)",
    )


class CredentialUpdate(HTTPSchemaModel):
    """Schema for updating a credential."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    scope: Optional[dict] = None
    vault_ref: Optional[str] = Field(None, max_length=500)
    enabled: Optional[bool] = None


class CredentialRead(CredentialBase):
    """
    Schema for reading credential data (admin view).

    Note: vault_ref is included for admin management but should
    be treated as opaque. Actual secrets are in the vault.
    """

    id: UUID
    vault_ref: Optional[str] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None
    enabled: bool


class CredentialListItem(HTTPSchemaModel):
    """
    Public credential info for frontend lists.

    SECURITY: vault_ref is explicitly excluded from this schema.
    """

    id: UUID
    name: str
    credential_type: str
    scope: dict
    enabled: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None


class CredentialListResponse(HTTPSchemaModel):
    """Response schema for credential list endpoint."""

    credentials: list[CredentialListItem]
    total: int


# Internal worker API schema


class CredentialVaultRef(HTTPSchemaModel):
    """
    Schema for internal worker API to get vault reference.

    SECURITY: This schema is ONLY used by internal worker APIs.
    Never return this to the frontend.
    """

    vault_ref: Optional[str] = None
