"""System event schemas for API validation and serialization."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import Field

from core.schema_base import HTTPSchemaModel
from api.schemas.system_message import SystemMessageRead


class SystemEventBase(HTTPSchemaModel):
    """Base system event schema."""

    event_key: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Unique event identifier (e.g., 'new_request', 'ticket_assigned')",
    )
    event_name_en: str = Field(
        ..., min_length=2, max_length=100, description="Event display name in English"
    )
    event_name_ar: str = Field(
        ..., min_length=2, max_length=100, description="Event display name in Arabic"
    )
    description_en: Optional[str] = Field(
        None, max_length=500, description="Event description in English"
    )
    description_ar: Optional[str] = Field(
        None, max_length=500, description="Event description in Arabic"
    )
    system_message_id: Optional[int] = Field(
        None, description="Foreign key to system_messages table"
    )
    trigger_timing: str = Field(
        default="immediate",
        max_length=20,
        description="When to trigger: 'immediate', 'delayed'",
    )
    is_active: bool = Field(default=True, description="Whether this event is active")


class SystemEventCreate(SystemEventBase):
    """Schema for creating a new system event."""

    pass


class SystemEventUpdate(HTTPSchemaModel):
    """Schema for updating a system event."""

    event_name_en: Optional[str] = Field(None, min_length=2, max_length=100)
    event_name_ar: Optional[str] = Field(None, min_length=2, max_length=100)
    description_en: Optional[str] = Field(None, max_length=500)
    description_ar: Optional[str] = Field(None, max_length=500)
    system_message_id: Optional[int] = None
    trigger_timing: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class SystemEventRead(SystemEventBase):
    """Schema for reading system event data."""

    id: int = Field(..., description="System event ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    created_by: Optional[UUID] = Field(None, description="User who created this event")
    updated_by: Optional[UUID] = Field(None, description="User who last updated this event")

    # Include related system message (optional, can be populated from relationship)
    system_message: Optional[SystemMessageRead] = Field(
        None, description="Related system message template"
    )


class SystemEventListResponse(HTTPSchemaModel):
    """Paginated list response for system events."""

    events: List[SystemEventRead]
    total: int
    active_count: int
    inactive_count: int
