"""
Domain User schema for Active Directory user data transfer.
"""

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel


class DomainUser(HTTPSchemaModel):
    """Schema for Active Directory user data."""

    username: str = Field(..., description="sAMAccountName from AD")
    email: Optional[str] = Field(None, description="mail attribute from AD")
    full_name: Optional[str] = Field(None, description="displayName from AD")
    phone_number: Optional[str] = Field(
        None, description="telephoneNumber or mobile from AD"
    )
    manager_username: Optional[str] = Field(
        None, description="Manager's sAMAccountName parsed from manager DN"
    )
    direct_manager_name: Optional[str] = Field(
        None, description="Direct manager's full name from AD"
    )
    title: Optional[str] = Field(None, description="Job title from AD")
    office: Optional[str] = Field(None, description="Office location from AD")
    department: Optional[str] = Field(None, description="Department from AD")

    @field_validator("phone_number", mode="before")
    @classmethod
    def validate_phone_number(cls, v: Any) -> Optional[str]:
        """Convert phone_number to string regardless of input type.

        AD may return phone numbers as integers, strings, or other types.
        This validator ensures consistent string output.
        """
        if v is None or v == "":
            return None

        # Convert any type to string
        try:
            phone_str = str(v).strip()
            return phone_str if phone_str else None
        except Exception:
            # If conversion fails for any reason, return None
            return None


class DomainUserRead(HTTPSchemaModel):
    """Schema for domain user API responses."""

    id: UUID = Field(..., description="UUID primary key")
    username: str = Field(..., description="sAMAccountName from AD")
    email: Optional[str] = Field(None, description="Email address from AD")
    display_name: Optional[str] = Field(None, description="Full display name from AD")
    direct_manager_name: Optional[str] = Field(
        None, description="Manager's full name from AD"
    )
    phone: Optional[str] = Field(
        None, description="Phone number from AD (telephoneNumber or mobile)"
    )
    office: Optional[str] = Field(
        None, description="Office location from AD (physicalDeliveryOfficeName)"
    )
    title: Optional[str] = Field(None, description="Job title from AD")
    created_at: datetime = Field(..., description="Sync timestamp")
    updated_at: datetime = Field(..., description="Last sync timestamp")


class DomainUserListResponse(HTTPSchemaModel):
    """Paginated response for domain users."""

    items: List[DomainUserRead] = Field(..., description="List of domain users")
    total: int = Field(..., description="Total count of domain users matching filters")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")


class DomainUserSyncResponse(HTTPSchemaModel):
    """Response for sync operation."""

    success: bool = Field(..., description="Whether sync was successful")
    message: str = Field(..., description="Sync status message")
    synced_count: int = Field(..., description="Number of users synced")
    sync_timestamp: datetime = Field(..., description="Timestamp of sync operation")


class DomainUserSyncTaskResponse(HTTPSchemaModel):
    """Response for async sync task dispatch."""

    task_id: str = Field(..., description="Celery task ID for tracking")
    status: str = Field(..., description="Task status (pending, started, etc.)")
    message: str = Field(..., description="Status message")
