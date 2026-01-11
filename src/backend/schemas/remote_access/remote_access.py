"""
Remote Access schemas for API validation and serialization.

Durable session lifecycle with ephemeral WebRTC signaling.
"""
from datetime import datetime
from typing import Optional, Literal
from uuid import UUID

from pydantic import field_validator

from core.schema_base import HTTPSchemaModel


# Valid session statuses
SessionStatus = Literal["active", "ended"]

# Valid end reasons
EndReason = Literal[
    "agent_disconnected",
    "requester_disconnected",
    "timeout",
    "manual",
]


class RemoteAccessSessionRead(HTTPSchemaModel):
    """Schema for reading remote access session data.

    Includes durable state fields for session lifecycle tracking.
    """

    id: UUID
    request_id: Optional[UUID] = None
    agent_id: UUID
    requester_id: UUID
    status: str = "active"
    control_enabled: bool = False
    created_at: datetime
    ended_at: Optional[datetime] = None
    end_reason: Optional[str] = None


class RemoteAccessSessionDetail(RemoteAccessSessionRead):
    """Detailed remote access session schema with user information."""

    agent_username: Optional[str] = None
    agent_full_name: Optional[str] = None
    requester_username: Optional[str] = None
    requester_full_name: Optional[str] = None
    request_title: Optional[str] = None


class RemoteAccessSessionList(HTTPSchemaModel):
    """Schema for list of remote access sessions with pagination."""

    items: list[RemoteAccessSessionRead]
    total: int
    page: int = 1
    per_page: int = 20


class RemoteAccessSessionState(HTTPSchemaModel):
    """Session state for recovery endpoint.

    Returns current durable state so client can resume.
    """

    session_id: UUID
    status: str
    control_enabled: bool
    agent_id: UUID
    requester_id: UUID
    request_id: Optional[UUID] = None
    created_at: datetime
    ended_at: Optional[datetime] = None
    end_reason: Optional[str] = None
    is_active: bool = True

    @field_validator("is_active", mode="before")
    @classmethod
    def compute_is_active(cls, v, info):
        return info.data.get("status") == "active"


class EndSessionRequest(HTTPSchemaModel):
    """Request body for ending a session."""

    reason: EndReason


class ToggleControlRequest(HTTPSchemaModel):
    """Request body for toggling control mode."""

    enabled: bool
