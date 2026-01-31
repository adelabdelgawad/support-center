"""
Chat Message schemas for API validation and serialization.

REFACTORED:
- Removed MessageType enum import (replaced with message_type_id FK)
- Added attachments support via ChatMessageAttachment
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel
from api.schemas.read_state import ReadReceiptResponse


class ChatMessageBase(HTTPSchemaModel):
    """Base chat message schema with common fields."""

    content: str = Field(..., min_length=1, max_length=10000)
    is_screenshot: bool = False
    screenshot_file_name: Optional[str] = Field(None, max_length=255)
    # File attachment fields (for non-image files)
    file_name: Optional[str] = Field(None, max_length=255, description="Original filename of attached file")
    file_size: Optional[int] = Field(None, description="File size in bytes")
    file_mime_type: Optional[str] = Field(None, max_length=100, description="MIME type of attached file")
    ip_address: Optional[str] = Field(None, max_length=45, description="Sender IP address")
    client_temp_id: Optional[str] = Field(None, max_length=100, description="Client-generated temporary ID for optimistic updates")


class ChatMessageCreate(ChatMessageBase):
    """Schema for creating a new chat message."""

    request_id: UUID  # UUID that will be serialized as string in JSON
    sender_id: UUID


class ChatMessageCreateByClient(ChatMessageBase):
    """Schema for creating a chat message from client (sender inferred from JWT)."""

    request_id: UUID  # UUID that will be serialized as string in JSON
    # sender_id is NOT required - will be auto-populated from current_user


class ChatMessageUpdate(HTTPSchemaModel):
    """Schema for updating a chat message."""

    content: Optional[str] = Field(None, min_length=1, max_length=10000)
    is_screenshot: Optional[bool] = None
    screenshot_file_name: Optional[str] = Field(None, max_length=255)
    is_read: Optional[bool] = None


class MessageSenderInfo(HTTPSchemaModel):
    """Schema for message sender information."""

    id: UUID  # User UUID
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None


class ChatMessageRead(ChatMessageBase):
    """Schema for reading chat message data with per-user read state."""

    id: UUID  # Message UUID
    request_id: UUID  # Service request UUID - will be serialized as string in JSON
    sender_id: Optional[UUID]
    sender: Optional[MessageSenderInfo] = Field(
        None, description="Sender user information for display"
    )
    sequence_number: Optional[int] = Field(
        None,
        description="Message sequence number for deterministic ordering and cursor pagination"
    )
    is_read: bool = Field(
        ..., description="[DEPRECATED] Use is_read_by_current_user instead"
    )
    is_read_by_current_user: bool = Field(
        default=False,
        description="Whether the current user has read this message",
    )
    # File attachment ID (for non-image files)
    file_id: Optional[int] = Field(None, description="Reference to ChatFile for non-image attachments")
    created_at: datetime
    updated_at: datetime
    read_at: Optional[datetime] = Field(
        None, description="[DEPRECATED] Global read timestamp"
    )
    # REMOVED: attachments field (attachments removed, kept only screenshots in screenshot_file_name)
    read_receipt: Optional[ReadReceiptResponse] = Field(
        None,
        description="Who has read this message (optional, expensive query)",
    )
    ip_address: Optional[str] = Field(None, max_length=45, description="Sender IP address")
    # client_temp_id inherited from ChatMessageBase


# REMOVED: ChatMessageWithAttachmentsResponse (attachments removed)


class ChatMessageListItem(HTTPSchemaModel):
    """Lightweight schema for chat message lists."""

    id: UUID  # Message UUID
    sender_id: Optional[UUID]
    is_read: bool
    is_screenshot: bool
    created_at: datetime


class ChatMessageDetail(ChatMessageRead):
    """Detailed chat message schema with sender information."""

    sender_username: Optional[str] = None
    sender_full_name: Optional[str] = None
    request_title: Optional[str] = None


class ChatMessageReadUpdate(HTTPSchemaModel):
    """Schema for marking messages as read."""

    message_ids: List[UUID] = Field(..., min_items=1)


class ChatMessageReaction(HTTPSchemaModel):
    """Schema for adding reactions to messages."""

    message_id: UUID
    reaction_type: str = Field(..., min_length=1, max_length=50)


class ChatMessageSearch(HTTPSchemaModel):
    """Schema for searching chat messages."""

    request_id: Optional[UUID] = (
        None  # UUID that will be serialized as string in JSON
    )
    sender_id: Optional[UUID] = None
    is_screenshot: Optional[bool] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    search_text: Optional[str] = Field(None, min_length=2, max_length=200)


class ChatThread(HTTPSchemaModel):
    """Schema for chat thread responses."""

    messages: List[ChatMessageDetail]
    total_messages: int
    unread_count: int
    last_message_at: Optional[datetime] = None


class ChatMessageStats(HTTPSchemaModel):
    """Schema for chat message statistics."""

    total_messages: int
    unread_messages: int
    screenshot_messages: int
    avg_messages_per_request: Optional[float] = None


class MessageContent(HTTPSchemaModel):
    """Schema for message content."""

    content: str


class ChatMessageBatchCreate(HTTPSchemaModel):
    """Schema for creating multiple messages at once."""

    messages: List[ChatMessageCreate]
