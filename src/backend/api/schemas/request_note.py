"""
Request Note schemas for API validation and serialization.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class RequestNoteBase(HTTPSchemaModel):
    """Base service request note schema with common fields."""
    note: str = Field(..., min_length=1, max_length=2000)


class RequestNoteCreate(RequestNoteBase):
    """Schema for creating a new service request note.

    Simple note for tracking, hints, or general comments without status changes.
    """
    request_id: UUID  # UUID that will be serialized as string in JSON
    is_system_generated: bool = False


class RequestNoteRead(RequestNoteBase):
    """Schema for reading service request note data."""
    id: int
    request_id: UUID  # UUID that will be serialized as string in JSON
    created_by: UUID
    is_system_generated: bool
    created_at: datetime


class RequestNoteDetail(RequestNoteRead):
    """Detailed service request note schema with user information."""
    creator_username: Optional[str] = None
    creator_full_name: Optional[str] = None
