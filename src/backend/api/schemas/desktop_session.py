"""
Desktop session schemas for Tauri requester app sessions.
"""

from datetime import datetime
from typing import List, Optional
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
    id: int
    user_id: UUID
    is_active: bool
    created_at: datetime
    last_heartbeat: datetime
    authenticated_at: Optional[datetime] = None
    auth_method: str
    device_fingerprint: Optional[str] = None


class DesktopSessionSummary(HTTPSchemaModel):
    """Summary schema for desktop session lists."""
    id: int
    user_id: UUID
    ip_address: str
    is_active: bool
    created_at: datetime
    last_heartbeat: datetime
    app_version: str
    computer_name: Optional[str] = None


class DesktopSessionUserInfo(HTTPSchemaModel):
    """Minimal user info for desktop session display."""
    id: int
    username: str
    full_name: Optional[str] = None


class DesktopSessionWithUserRead(DesktopSessionRead):
    """Desktop session with user information for monitoring."""

    user: DesktopSessionUserInfo
    # Add sessionTypeId for frontend compatibility (always 2 for desktop)
    session_type_id: int = Field(default=2, description="Always 2 for desktop sessions")

    # Real-time presence from Redis (Phase 4: authoritative online status)
    is_live: Optional[bool] = Field(
        default=None,
        description="Real-time presence from Redis. True = user has active SignalR/heartbeat connection.",
    )

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


# Heatmap schemas for activity analytics
class HeatmapData(HTTPSchemaModel):
    """Heatmap data for activity visualization."""

    heatmap_data: List[List[int]] = Field(
        ...,
        description="2D array (7 days x 24 hours) with activity counts"
    )
    daily_totals: List[int] = Field(
        ...,
        description="Total activity count for each day of week (0-6)"
    )
    hour_counts: List[int] = Field(
        ...,
        description="Total activity count for each hour (0-23)"
    )


class HeatmapSummary(HTTPSchemaModel):
    """Summary statistics for activity heatmap."""

    total_activity: int = Field(..., description="Total number of activities")
    days_analyzed: int = Field(..., description="Number of days analyzed")
    avg_daily_activity: float = Field(..., description="Average daily activity")
    peak_hour: int = Field(..., description="Hour with most activity (0-23)")
    peak_day: int = Field(..., description="Day of week with most activity (0-6)")


class DateRange(HTTPSchemaModel):
    """Date range for the analysis."""

    start: str = Field(..., description="Start date in ISO format")
    end: str = Field(..., description="End date in ISO format")


class UserActivityHeatmapResponse(HTTPSchemaModel):
    """Response for user activity heatmap endpoint."""

    heatmap_data: HeatmapData = Field(..., description="Activity heatmap data")
    summary: HeatmapSummary = Field(..., description="Summary statistics")
    date_range: DateRange = Field(..., description="Analysis date range")
