"""System message schemas for bilingual auto-generated messages."""

from datetime import datetime
from typing import List, Optional

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class SystemMessageBase(HTTPSchemaModel):
    """Base system message schema."""

    message_type: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Message type identifier (e.g., 'new_request', 'ticket_assigned', 'request_solved')"
    )
    template_en: str = Field(
        ...,
        min_length=2,
        max_length=500,
        description="English message template with {placeholders}"
    )
    template_ar: str = Field(
        ...,
        min_length=2,
        max_length=500,
        description="Arabic message template with {placeholders}"
    )
    is_active: bool = Field(
        default=True,
        description="Whether this template is active"
    )


class SystemMessageCreate(SystemMessageBase):
    """Schema for creating a new system message template."""
    pass


class SystemMessageUpdate(HTTPSchemaModel):
    """Schema for updating a system message template."""

    template_en: Optional[str] = Field(
        None,
        min_length=2,
        max_length=500,
        description="English message template with {placeholders}"
    )
    template_ar: Optional[str] = Field(
        None,
        min_length=2,
        max_length=500,
        description="Arabic message template with {placeholders}"
    )
    is_active: Optional[bool] = Field(
        None,
        description="Whether this template is active"
    )


class SystemMessageRead(SystemMessageBase):
    """Schema for reading system message template data."""

    id: int = Field(..., description="System message ID")
    created_at: datetime = Field(..., description="Template creation timestamp")


class SystemMessageListResponse(HTTPSchemaModel):
    """Schema for paginated list of system messages with counts."""

    messages: List[SystemMessageRead] = Field(..., description="List of system messages")
    total: int = Field(..., description="Total number of messages")
    active_count: int = Field(..., description="Number of active messages")
    inactive_count: int = Field(..., description="Number of inactive messages")
