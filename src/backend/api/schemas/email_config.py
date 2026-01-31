"""Email Configuration schemas."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import EmailStr, field_validator

from core.schema_base import HTTPSchemaModel


class EmailConfigBase(HTTPSchemaModel):
    """Base schema for Email configuration."""

    name: str
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_from: EmailStr
    smtp_tls: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate name is not empty."""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("smtp_host")
    @classmethod
    def validate_smtp_host(cls, v: str) -> str:
        """Validate SMTP host."""
        if not v or not v.strip():
            raise ValueError("SMTP host cannot be empty")
        return v.strip()

    @field_validator("smtp_user")
    @classmethod
    def validate_smtp_user(cls, v: str) -> str:
        """Validate SMTP user."""
        if not v or not v.strip():
            raise ValueError("SMTP user cannot be empty")
        return v.strip()

    @field_validator("smtp_port")
    @classmethod
    def validate_smtp_port(cls, v: int) -> int:
        """Validate port number."""
        if v < 1 or v > 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v


class EmailConfigCreate(EmailConfigBase):
    """Schema for creating Email configuration."""

    password: str
    is_active: bool = False

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password is not empty."""
        if not v or not v.strip():
            raise ValueError("Password cannot be empty")
        return v


class EmailConfigUpdate(HTTPSchemaModel):
    """Schema for updating Email configuration."""

    name: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_from: Optional[EmailStr] = None
    password: Optional[str] = None  # Only include if changing password
    smtp_tls: Optional[bool] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate name is not empty if provided."""
        if v is not None and (not v or not v.strip()):
            raise ValueError("Name cannot be empty")
        return v.strip() if v else None

    @field_validator("smtp_host")
    @classmethod
    def validate_smtp_host(cls, v: Optional[str]) -> Optional[str]:
        """Validate SMTP host if provided."""
        if v is not None and (not v or not v.strip()):
            raise ValueError("SMTP host cannot be empty")
        return v.strip() if v else None

    @field_validator("smtp_user")
    @classmethod
    def validate_smtp_user(cls, v: Optional[str]) -> Optional[str]:
        """Validate SMTP user if provided."""
        if v is not None and (not v or not v.strip()):
            raise ValueError("SMTP user cannot be empty")
        return v.strip() if v else None

    @field_validator("smtp_port")
    @classmethod
    def validate_smtp_port(cls, v: Optional[int]) -> Optional[int]:
        """Validate port number if provided."""
        if v is not None and (v < 1 or v > 65535):
            raise ValueError("Port must be between 1 and 65535")
        return v


class EmailConfigRead(EmailConfigBase):
    """Schema for reading Email configuration (excludes password)."""

    id: UUID
    is_active: bool
    has_password: bool  # Computed field indicating password exists
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, model):
        """Create from database model."""
        return cls(
            id=model.id,
            name=model.name,
            smtp_host=model.smtp_host,
            smtp_port=model.smtp_port,
            smtp_user=model.smtp_user,
            smtp_from=model.smtp_from,
            smtp_tls=model.smtp_tls,
            is_active=model.is_active,
            has_password=bool(model.encrypted_password),
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


class EmailConfigListResponse(HTTPSchemaModel):
    """Schema for list of email configurations."""

    items: list[EmailConfigRead]
    total: int


class TestEmailRequest(HTTPSchemaModel):
    """Schema for testing email connection."""

    recipient: EmailStr


class TestEmailResponse(HTTPSchemaModel):
    """Schema for test email response."""

    success: bool
    message: str
    details: Optional[str] = None
