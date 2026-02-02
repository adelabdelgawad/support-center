"""Active Directory Configuration schemas."""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import field_validator

from core.schema_base import HTTPSchemaModel


class ActiveDirectoryConfigBase(HTTPSchemaModel):
    """Base schema for Active Directory configuration."""

    name: str
    path: str
    domain_name: str
    port: int = 389
    use_ssl: bool = True
    ldap_username: str
    base_dn: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate name is not empty."""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        """Validate LDAP server path."""
        if not v or not v.strip():
            raise ValueError("LDAP server path cannot be empty")
        return v.strip()

    @field_validator("domain_name")
    @classmethod
    def validate_domain_name(cls, v: str) -> str:
        """Validate domain name."""
        if not v or not v.strip():
            raise ValueError("Domain name cannot be empty")
        return v.strip()

    @field_validator("base_dn")
    @classmethod
    def validate_base_dn(cls, v: str) -> str:
        """Validate base DN format."""
        if not v or not v.strip():
            raise ValueError("Base DN cannot be empty")
        v_upper = v.upper()
        if not (v_upper.startswith("DC=") or v_upper.startswith("OU=")):
            raise ValueError("Base DN must start with 'DC=' or 'OU='")
        return v.strip()

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        """Validate port number."""
        if v < 1 or v > 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v


class ActiveDirectoryConfigCreate(ActiveDirectoryConfigBase):
    """Schema for creating Active Directory configuration."""

    password: str
    is_active: bool = False

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password is not empty."""
        if not v or not v.strip():
            raise ValueError("Password cannot be empty")
        return v


class ActiveDirectoryConfigUpdate(HTTPSchemaModel):
    """Schema for updating Active Directory configuration."""

    name: Optional[str] = None
    path: Optional[str] = None
    domain_name: Optional[str] = None
    port: Optional[int] = None
    use_ssl: Optional[bool] = None
    ldap_username: Optional[str] = None
    password: Optional[str] = None  # Only include if changing password
    base_dn: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate name is not empty if provided."""
        if v is not None and (not v or not v.strip()):
            raise ValueError("Name cannot be empty")
        return v.strip() if v else None

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: Optional[str]) -> Optional[str]:
        """Validate path if provided."""
        if v is not None and (not v or not v.strip()):
            raise ValueError("LDAP server path cannot be empty")
        return v.strip() if v else None

    @field_validator("base_dn")
    @classmethod
    def validate_base_dn(cls, v: Optional[str]) -> Optional[str]:
        """Validate base DN format if provided."""
        if v is not None:
            if not v or not v.strip():
                raise ValueError("Base DN cannot be empty")
            if not v.upper().startswith("DC="):
                raise ValueError("Base DN must start with 'DC='")
            return v.strip()
        return None

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: Optional[int]) -> Optional[int]:
        """Validate port number if provided."""
        if v is not None and (v < 1 or v > 65535):
            raise ValueError("Port must be between 1 and 65535")
        return v


class ActiveDirectoryConfigRead(ActiveDirectoryConfigBase):
    """Schema for reading Active Directory configuration (excludes password)."""

    id: UUID
    is_active: bool
    has_password: bool  # Computed field indicating password exists
    organizational_units: List[str] = []
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, model, organizational_units: Optional[List[str]] = None):
        """Create from database model."""
        return cls(
            id=model.id,
            name=model.name,
            path=model.path,
            domain_name=model.domain_name,
            port=model.port,
            use_ssl=model.use_ssl,
            ldap_username=model.ldap_username,
            base_dn=model.base_dn,
            is_active=model.is_active,
            has_password=bool(model.encrypted_password),
            organizational_units=organizational_units or [],
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


class ActiveDirectoryConfigListResponse(HTTPSchemaModel):
    """Schema for paginated list of AD configurations."""

    items: List[ActiveDirectoryConfigRead]
    total: int


class TestConnectionRequest(HTTPSchemaModel):
    """Schema for testing AD connection (optional - can test existing config by ID)."""

    pass


class TestConnectionResponse(HTTPSchemaModel):
    """Schema for test connection response."""

    success: bool
    message: str
    details: Optional[str] = None
