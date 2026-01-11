"""
Read state schemas for chat messages.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class ReadReceiptUser(HTTPSchemaModel):
    """User information for read receipt."""

    id: UUID
    username: str
    full_name: str | None = None


class ReadReceiptResponse(HTTPSchemaModel):
    """Response schema for message read receipts."""

    message_id: UUID
    read_by: List[ReadReceiptUser] = Field(default=[], description="List of users who have read this message")
    total_readers: int = Field(default=0, description="Total number of users who read this message")


class UnreadCountResponse(HTTPSchemaModel):
    """Response schema for unread message count."""

    request_id: UUID
    user_id: UUID
    unread_count: int = Field(default=0)
    total_messages: int = Field(default=0)
    last_message_at: Optional[datetime] = None


class ChatUnreadCountItem(HTTPSchemaModel):
    """Unread count for a single chat."""

    request_id: UUID
    unread_count: int = Field(default=0)
    last_read_at: Optional[datetime] = None


class ChatUnreadCountsResponse(HTTPSchemaModel):
    """Response schema for all unread counts."""

    user_id: UUID
    total_unread: int = Field(default=0)
    chats: List[ChatUnreadCountItem] = Field(default=[])


class TotalUnreadResponse(HTTPSchemaModel):
    """Response schema for total unread count."""

    user_id: UUID
    total_unread: int = Field(default=0)


class MarkChatAsReadResponse(HTTPSchemaModel):
    """Response schema for marking chat as read."""

    request_id: UUID
    user_id: UUID
    marked_at: datetime
    previous_unread: int = Field(default=0)
