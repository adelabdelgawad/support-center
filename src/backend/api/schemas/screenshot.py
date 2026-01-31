"""
Screenshot schemas for API validation and serialization.

Screenshots are stored in MinIO with Celery async uploads.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class ScreenshotBase(HTTPSchemaModel):
    """Base screenshot schema with common fields."""
    filename: str = Field(..., min_length=1, max_length=255)
    file_size: int = Field(..., ge=0)
    mime_type: Optional[str] = Field(None, max_length=100)


class ScreenshotCreate(ScreenshotBase):
    """Schema for creating a new screenshot."""
    request_id: UUID  # UUID that will be serialized as string in JSON
    uploaded_by: UUID
    file_hash: Optional[str] = Field(None, max_length=64)


class ScreenshotUpdate(HTTPSchemaModel):
    """Schema for updating a screenshot."""
    filename: Optional[str] = Field(None, min_length=1, max_length=255)


class ScreenshotRead(ScreenshotBase):
    """Schema for reading screenshot data."""
    id: int
    request_id: UUID  # UUID that will be serialized as string in JSON
    uploaded_by: UUID
    file_hash: Optional[str] = None

    # MinIO storage fields
    minio_object_key: Optional[str] = None
    minio_thumbnail_key: Optional[str] = None
    bucket_name: Optional[str] = None
    celery_task_id: Optional[str] = None

    upload_status: str = "pending"  # 'pending', 'completed', 'failed'
    is_corrupted: bool = False
    created_at: datetime
    updated_at: datetime

    # Runtime fields (not in DB)
    download_url: Optional[str] = None
    thumbnail_url: Optional[str] = None


class ScreenshotListItem(HTTPSchemaModel):
    """Lightweight schema for screenshot lists."""
    id: int
    filename: str
    file_size: int
    mime_type: Optional[str] = None
    upload_status: str = "pending"
    is_corrupted: bool = False
    created_at: datetime


class ScreenshotUploadResponse(HTTPSchemaModel):
    """Schema for screenshot upload response."""
    screenshot: ScreenshotRead
    upload_status: str  # 'pending', 'completed', 'failed'
    message: str
    upload_url: Optional[str] = None
    upload_method: str = "PUT"
