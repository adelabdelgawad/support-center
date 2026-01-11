"""Outshift Report schemas for API responses.

Compliance-grade outshift reporting schemas.
Definitions:
- Outshift = any activity outside BusinessUnit.working_hours
- Activity = User sessions + ticket-related work combined
- Multi-BU agents = metrics calculated independently per Business Unit
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional, List
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


# =============================================================================
# Activity Classification
# =============================================================================


class ActivityType(str, Enum):
    """Type of activity that generated the time segment."""
    SESSION = "session"
    TICKET_WORK = "ticket_work"
    COMBINED = "combined"


class ShiftClassification(str, Enum):
    """Classification of time segment relative to shift hours."""
    IN_SHIFT = "in_shift"
    OUT_SHIFT = "out_shift"


# =============================================================================
# Activity Segments
# =============================================================================


class OutshiftActivitySegment(HTTPSchemaModel):
    """
    A discrete time segment of agent activity with shift classification.

    Used for drill-down views and audit trails.
    Each segment represents a continuous period of activity.
    """
    segment_start: datetime = Field(..., description="Start of activity segment (Cairo TZ)")
    segment_end: datetime = Field(..., description="End of activity segment (Cairo TZ)")
    duration_minutes: float = Field(..., description="Duration in minutes")
    activity_type: ActivityType = Field(..., description="Source of this activity")
    classification: ShiftClassification = Field(..., description="In-shift or out-shift")

    # Context for audit
    session_id: Optional[int] = Field(None, description="Related session ID if activity_type is SESSION")
    ticket_ids: List[UUID] = Field(default_factory=list, description="Related ticket IDs if ticket work")


# =============================================================================
# Per-Agent Per-BU Metrics
# =============================================================================


class OutshiftAgentBUMetrics(HTTPSchemaModel):
    """
    Outshift metrics for a single agent within a single Business Unit.

    This is the atomic unit of outshift reporting.
    Agents with multiple BU assignments will have one of these per BU.
    """
    # Identifiers
    business_unit_id: int = Field(..., description="Business unit ID")
    business_unit_name: str = Field(..., description="Business unit name")

    # Working hours context (for transparency)
    has_working_hours: bool = Field(
        ...,
        description="Whether this BU has working_hours defined. If False, all activity is in-shift."
    )

    # Core metrics (all in minutes for precision)
    total_activity_minutes: float = Field(
        ...,
        ge=0,
        description="Total tracked activity time in minutes"
    )
    in_shift_minutes: float = Field(
        ...,
        ge=0,
        description="Activity during BU working hours"
    )
    out_shift_minutes: float = Field(
        ...,
        ge=0,
        description="Activity outside BU working hours"
    )
    out_shift_percentage: float = Field(
        ...,
        ge=0,
        le=100,
        description="Percentage of activity that was out-of-shift: (out_shift / total) * 100"
    )

    # Counts for context
    out_shift_sessions_count: int = Field(
        ...,
        ge=0,
        description="Number of sessions that had any out-of-shift activity"
    )
    out_shift_tickets_count: int = Field(
        ...,
        ge=0,
        description="Number of tickets worked on outside shift hours"
    )

    # Detailed breakdown (optional, for drill-down)
    activity_segments: List[OutshiftActivitySegment] = Field(
        default_factory=list,
        description="Detailed activity segments for audit trail"
    )


# =============================================================================
# Per-Agent Report
# =============================================================================


class OutshiftAgentReport(HTTPSchemaModel):
    """
    Complete outshift report for a single agent.

    Contains metrics broken down by each Business Unit the agent is assigned to.
    """
    # Period info
    period_start: date = Field(..., description="Report period start")
    period_end: date = Field(..., description="Report period end")

    # Agent identification
    agent_id: UUID = Field(..., description="Agent user ID")
    agent_name: str = Field(..., description="Agent username")
    agent_full_name: Optional[str] = Field(None, description="Agent full name")

    # Aggregate metrics across all BUs
    total_activity_minutes: float = Field(
        ...,
        ge=0,
        description="Total activity across all BUs"
    )
    total_in_shift_minutes: float = Field(
        ...,
        ge=0,
        description="Total in-shift activity across all BUs"
    )
    total_out_shift_minutes: float = Field(
        ...,
        ge=0,
        description="Total out-shift activity across all BUs"
    )
    total_out_shift_percentage: float = Field(
        ...,
        ge=0,
        le=100,
        description="Overall out-shift percentage across all BUs"
    )

    # Per-BU breakdown
    business_unit_metrics: List[OutshiftAgentBUMetrics] = Field(
        default_factory=list,
        description="Metrics for each Business Unit the agent is assigned to"
    )

    # Flags
    has_activity: bool = Field(
        ...,
        description="Whether any activity was recorded in the period"
    )
    has_bu_assignments: bool = Field(
        ...,
        description="Whether agent has any BU assignments"
    )


# =============================================================================
# Global Report
# =============================================================================


class OutshiftAgentSummary(HTTPSchemaModel):
    """
    Summary row for an agent in the global report.

    Used in ranking tables. Excludes detailed segments for performance.
    """
    # Agent identification
    agent_id: UUID = Field(..., description="Agent user ID")
    agent_name: str = Field(..., description="Agent username")
    agent_full_name: Optional[str] = Field(None, description="Agent full name")

    # Aggregate metrics
    total_activity_minutes: float = Field(..., ge=0)
    total_out_shift_minutes: float = Field(..., ge=0)
    total_out_shift_percentage: float = Field(..., ge=0, le=100)

    # Counts
    business_unit_count: int = Field(..., ge=0, description="Number of BUs agent is assigned to")
    out_shift_sessions_count: int = Field(..., ge=0)
    out_shift_tickets_count: int = Field(..., ge=0)

    # Ranking
    rank: int = Field(..., ge=1, description="Rank by out-shift percentage (1 = highest)")


class OutshiftGlobalReport(HTTPSchemaModel):
    """
    Aggregate outshift report across all agents.

    Provides summary KPIs and agent rankings.
    """
    # Period info
    period_start: date = Field(..., description="Report period start")
    period_end: date = Field(..., description="Report period end")

    # Summary KPIs
    total_agents: int = Field(
        ...,
        ge=0,
        description="Total agents with BU assignments"
    )
    agents_with_activity: int = Field(
        ...,
        ge=0,
        description="Agents who had activity in the period"
    )
    agents_with_outshift: int = Field(
        ...,
        ge=0,
        description="Agents who had any out-of-shift activity"
    )

    # Aggregate time metrics
    total_activity_minutes: float = Field(
        ...,
        ge=0,
        description="Total activity across all agents"
    )
    total_in_shift_minutes: float = Field(
        ...,
        ge=0,
        description="Total in-shift activity across all agents"
    )
    total_out_shift_minutes: float = Field(
        ...,
        ge=0,
        description="Total out-shift activity across all agents"
    )
    overall_out_shift_percentage: float = Field(
        ...,
        ge=0,
        le=100,
        description="Overall out-shift percentage across all agents"
    )

    # Average metrics
    avg_out_shift_percentage: float = Field(
        ...,
        ge=0,
        le=100,
        description="Average out-shift percentage per agent (who had activity)"
    )

    # Agent rankings (sorted by out-shift percentage descending)
    agent_rankings: List[OutshiftAgentSummary] = Field(
        default_factory=list,
        description="All agents ranked by out-shift percentage"
    )

    # Flags
    has_data: bool = Field(
        ...,
        description="Whether any agents had activity in the period"
    )
