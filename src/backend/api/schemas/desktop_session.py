"""
Desktop session schemas for Tauri requester app sessions.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from core.schema_base import HTTPSchemaModel
from pydantic import Field


class DesktopSessionBase(HTTPSchemaModel):
    """Base desktop session schema with common fields."""

    ip_address: str = Field(..., min_length=7, max_length=45)
    app_version: str = Field(..., max_length=50, description="Tauri app version (REQUIRED)")
    computer_name: Optional[str] = Field(None, max_length=255, description="Computer hostname")
    os_info: Optional[str] = Field(None, max_length=100, description="Operating system info")


class DesktopSessionCreate(DesktopSessionBase):
    """Schema for creating a desktop session."""

    user_name: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Username for session - user will be auto-created if not exists",
    )


class DesktopSessionRead(DesktopSessionBase):
    """Schema for reading desktop session data."""

    id: UUID
    user_id: UUID
    is_active: bool
    created_at: datetime
    last_heartbeat: datetime
    authenticated_at: Optional[datetime] = None
    auth_method: str
    device_fingerprint: Optional[str] = None


class DesktopSessionSummary(HTTPSchemaModel):
    """Summary schema for desktop session lists."""

    id: UUID
    user_id: UUID
    ip_address: str
    is_active: bool
    created_at: datetime
    last_heartbeat: datetime
    app_version: str
    computer_name: Optional[str] = None


class DesktopSessionUserInfo(HTTPSchemaModel):
    """Minimal user info for desktop session display."""

    id: UUID
    username: str
    full_name: Optional[str] = None


class DesktopSessionWithUserRead(DesktopSessionRead):
    """Desktop session with user information for monitoring."""

    user: DesktopSessionUserInfo
    # Add sessionTypeId for frontend compatibility (always 2 for desktop)
    session_type_id: int = Field(default=2, description="Always 2 for desktop sessions")

    # Version policy fields (enriched at fetch time)
    version_status: Optional[str] = Field(
        default=None,
        description="Version policy status: 'ok', 'outdated', 'outdated_enforced', 'unknown'",
    )
    target_version: Optional[str] = Field(
        default=None,
        description="Target version string if outdated",
    )

    @property
    def sessionTypeId(self) -> int:
        """Alias for camelCase compatibility."""
        return 2


class ActiveSessionStats(HTTPSchemaModel):
    """Combined session statistics for monitoring dashboard."""

    total_sessions: int = Field(..., description="Total active sessions (all types)")
    desktop_sessions: int = Field(..., description="Active desktop sessions")
    web_sessions: int = Field(..., description="Active web sessions")
    mobile_sessions: int = Field(default=0, description="Active mobile sessions")
    active_sessions: int = Field(..., description="Truly active sessions (recent heartbeat)")
    unique_users: int = Field(..., description="Unique users with active sessions")
    avg_session_duration: Optional[float] = Field(
        default=None, description="Average session duration in minutes"
    )
