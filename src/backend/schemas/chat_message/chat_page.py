"""
Chat Page schemas for the ticket/chat page endpoint.

These schemas provide aggregated data for the chat page display including:
- Request status counts with colors
- Chat message read/unread counts
- Chat message list with request details
"""

from typing import List, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class RequestStatusCount(HTTPSchemaModel):
    """Request status with count."""

    id: int = Field(..., description="Status ID")
    name: str = Field(..., description="Status name (internal identifier)")
    name_en: str = Field(..., description="Display name in English")
    name_ar: str = Field(..., description="Display name in Arabic")
    count: int = Field(
        ..., ge=0, description="Number of requests with this status"
    )
    color: Optional[str] = Field(
        None, description="Status color (e.g., 'yellow', 'blue')"
    )


class ChatRequestStatus(HTTPSchemaModel):
    """Request status details."""

    id: int = Field(..., description="Status ID")
    name: str = Field(..., description="Status name (internal identifier)")
    name_en: str = Field(..., description="Display name in English")
    name_ar: str = Field(..., description="Display name in Arabic")
    color: str = Field(..., description="Status color")


class ChatMessageCountRecord(HTTPSchemaModel):
    """Chat message count by read status."""

    id: int = Field(..., description="Read status ID (1=read, 2=unread)")
    name: str = Field(..., description="Read status name ('read' or 'unread')")
    count: int = Field(..., ge=0, description="Number of messages")


class ChatRequestListItem(HTTPSchemaModel):
    """Request list item with chat details for the chat page."""

    id: UUID = Field(..., description="Request ID")
    title: str = Field(..., description="Request title")
    status_id: int = Field(..., description="Request status ID")
    status: str = Field(
        ..., description="Request status name (e.g., 'pending')"
    )
    status_color: Optional[str] = Field(
        None, description="Status color (e.g., 'yellow')"
    )
    count_as_solved: bool = Field(
        default=False, description="Whether this status counts as solved/completed"
    )
    created_at: str = Field(..., description="Request creation timestamp (ISO format)")
    last_message: Optional[str] = Field(
        None, description="Last chat message text with sender name"
    )
    last_message_at: Optional[str] = Field(
        None, description="Last message timestamp (ISO format)"
    )
    last_message_sequence: Optional[int] = Field(
        None, description="Sequence number of the last message (for deterministic chat sync)"
    )
    unread_count: int = Field(
        default=0, ge=0, description="Number of unread messages"
    )


class ChatPageResponse(HTTPSchemaModel):
    """Complete response for the chat page endpoint."""

    request_status: List[RequestStatusCount] = Field(
        ..., description="List of request statuses with counts and colors"
    )
    chat_messages_count: List[ChatMessageCountRecord] = Field(
        ..., description="Chat message counts by read/unread status"
    )
    chat_messages: List[ChatRequestListItem] = Field(
        ..., description="List of requests with chat details"
    )
    statuses: List[ChatRequestStatus] = Field(
        ..., description="List of all request statuses"
    )
