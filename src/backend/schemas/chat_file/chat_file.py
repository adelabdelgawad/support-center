"""
Chat file attachment schemas for API validation and serialization.

Chat files are non-image attachments stored in MinIO with Celery async uploads.
Images are handled separately via the Screenshot model.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class ChatFileBase(HTTPSchemaModel):
    """Base chat file schema with common fields."""
    original_filename: str = Field(..., min_length=1, max_length=255)
    file_size: int = Field(..., ge=0)
    mime_type: str = Field(..., max_length=100)


class ChatFileCreate(ChatFileBase):
    """Schema for creating a new chat file."""
    request_id: UUID
    uploaded_by: UUID
    stored_filename: str = Field(..., min_length=1, max_length=255)


class ChatFileRead(ChatFileBase):
    """Schema for reading chat file data."""
    id: int
    request_id: UUID
    uploaded_by: UUID
    stored_filename: str

    # MinIO storage fields
    minio_object_key: Optional[str] = None
    bucket_name: str = "servicecatalog-files"
    celery_task_id: Optional[str] = None
    file_hash: Optional[str] = None

    upload_status: str = "pending"  # 'pending', 'completed', 'failed'
    is_corrupted: bool = False
    created_at: datetime
    updated_at: datetime


class ChatFileListItem(HTTPSchemaModel):
    """Lightweight schema for chat file lists."""
    id: int
    original_filename: str
    stored_filename: str
    file_size: int
    mime_type: str
    upload_status: str = "pending"
    is_corrupted: bool = False
    created_at: datetime


class ChatFileUploadResponse(HTTPSchemaModel):
    """Schema for chat file upload response."""
    file: ChatFileRead
    upload_status: str  # 'pending', 'completed', 'failed'
    message: str
