"""
WhatsApp Batch schemas for API validation and serialization.
"""
from datetime import datetime
from typing import Dict, Any, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


class WhatsAppBatchBase(HTTPSchemaModel):
    """Base WhatsApp batch schema with common fields."""
    request_id: UUID
    business_unit_id: Optional[int] = None
    first_message_id: UUID
    last_message_id: UUID
    message_count: int
    batch_type: str = Field(..., max_length=50)
    delivery_status: str = Field(default="pending", max_length=50)
    payload_snapshot: Dict[str, Any]
    error_message: Optional[str] = Field(None, max_length=1000)


class WhatsAppBatchCreate(WhatsAppBatchBase):
    """Schema for creating a new WhatsApp batch record."""
    pass


class WhatsAppBatchRead(WhatsAppBatchBase):
    """Schema for reading WhatsApp batch data."""
    id: int
    sent_at: datetime
