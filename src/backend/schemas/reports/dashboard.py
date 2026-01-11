"""Dashboard and Report schemas for API responses."""

from datetime import datetime, date
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


# =============================================================================
# Common Types
# =============================================================================


class DateRangePreset(str, Enum):
    """Preset date ranges for reports."""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    THIS_WEEK = "this_week"
    LAST_WEEK = "last_week"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    THIS_QUARTER = "this_quarter"
    LAST_QUARTER = "last_quarter"
    THIS_YEAR = "this_year"
    CUSTOM = "custom"


class ReportDateRange(HTTPSchemaModel):
    """Date range specification for reports."""
    preset: Optional[DateRangePreset] = Field(None, description="Preset date range")
    start_date: Optional[date] = Field(None, description="Custom start date")
    end_date: Optional[date] = Field(None, description="Custom end date")


class ReportFilters(HTTPSchemaModel):
    """Common filters for reports."""
    date_range: Optional[ReportDateRange] = None
    business_unit_ids: Optional[List[int]] = Field(None, description="Filter by business units")
    technician_ids: Optional[List[UUID]] = Field(None, description="Filter by technicians")
    category_ids: Optional[List[int]] = Field(None, description="Filter by categories")
    priority_ids: Optional[List[int]] = Field(None, description="Filter by priorities")
    status_ids: Optional[List[int]] = Field(None, description="Filter by statuses")
    tag_ids: Optional[List[int]] = Field(None, description="Filter by tags")


# =============================================================================
# KPI Cards
# =============================================================================


class TrendDirection(str, Enum):
    """Direction of trend."""
    UP = "up"
    DOWN = "down"
    STABLE = "stable"


class KPICard(HTTPSchemaModel):
    """KPI card data for dashboard display."""
    id: str = Field(..., description="Unique identifier for the KPI")
    label: str = Field(..., description="Display label")
    value: float = Field(..., description="Current value")
    unit: Optional[str] = Field(None, description="Unit of measurement (%, hrs, count)")
    previous_value: Optional[float] = Field(None, description="Previous period value for comparison")
    change_percent: Optional[float] = Field(None, description="Percentage change from previous period")
    trend_direction: Optional[TrendDirection] = Field(None, description="Direction of change")
    target: Optional[float] = Field(None, description="Target value if applicable")
    is_target_met: Optional[bool] = Field(None, description="Whether target is met")


class TrendDataPoint(HTTPSchemaModel):
    """Single data point for trend charts."""
    date: date
    value: float
    label: Optional[str] = None


class DistributionItem(HTTPSchemaModel):
    """Item for distribution charts (pie charts, bar charts)."""
    id: str
    label: str
    value: int
    percentage: float
    color: Optional[str] = None


# =============================================================================
# Executive Dashboard
# =============================================================================


class ExecutiveDashboardData(HTTPSchemaModel):
    """Complete executive dashboard data."""
    # Period info
    period_start: date
    period_end: date
    comparison_period_start: Optional[date] = None
    comparison_period_end: Optional[date] = None

    # Summary KPIs
    total_tickets: KPICard
    resolved_tickets: KPICard
    open_tickets: KPICard
    sla_compliance: KPICard
    avg_resolution_time: KPICard
    avg_first_response_time: KPICard

    # Trends (for charts)
    ticket_volume_trend: List[TrendDataPoint] = Field(default_factory=list)
    sla_compliance_trend: List[TrendDataPoint] = Field(default_factory=list)

    # Distributions
    tickets_by_status: List[DistributionItem] = Field(default_factory=list)
    tickets_by_priority: List[DistributionItem] = Field(default_factory=list)
    tickets_by_category: List[DistributionItem] = Field(default_factory=list)
    tickets_by_business_unit: List[DistributionItem] = Field(default_factory=list)

    # Top performers
    top_technicians: List["AgentRankingItem"] = Field(default_factory=list)


# =============================================================================
# SLA Reports
# =============================================================================


class SLABreachItem(HTTPSchemaModel):
    """Details of an SLA breach."""
    request_id: UUID
    title: str
    requester_name: Optional[str] = None
    assigned_technician: Optional[str] = None
    priority_name: str
    status_name: str
    created_at: datetime
    sla_due_at: datetime
    breach_duration_minutes: float
    breach_type: str = Field(..., description="first_response or resolution")


class SLAAgingBucket(HTTPSchemaModel):
    """Aging bucket for ticket analysis."""
    bucket_name: str = Field(..., description="e.g., '0-1 day', '1-3 days', '3-7 days', '7+ days'")
    count: int
    percentage: float
    average_age_hours: float


class SLAComplianceData(HTTPSchemaModel):
    """Complete SLA compliance report data."""
    # Period info
    period_start: date
    period_end: date

    # Summary
    total_tickets: int
    tickets_with_sla: int
    sla_met_count: int
    sla_breached_count: int
    overall_compliance_rate: float

    # First Response SLA
    first_response_sla_met: int
    first_response_sla_breached: int
    first_response_compliance_rate: float
    avg_first_response_minutes: Optional[float] = None

    # Resolution SLA
    resolution_sla_met: int
    resolution_sla_breached: int
    resolution_compliance_rate: float
    avg_resolution_hours: Optional[float] = None

    # Trends
    compliance_trend: List[TrendDataPoint] = Field(default_factory=list)
    first_response_trend: List[TrendDataPoint] = Field(default_factory=list)
    resolution_trend: List[TrendDataPoint] = Field(default_factory=list)

    # Breakdown by priority
    compliance_by_priority: List[DistributionItem] = Field(default_factory=list)

    # Aging analysis
    aging_buckets: List[SLAAgingBucket] = Field(default_factory=list)

    # Recent breaches (limited list)
    recent_breaches: List[SLABreachItem] = Field(default_factory=list)


# =============================================================================
# Volume Reports
# =============================================================================


class VolumeTrendItem(HTTPSchemaModel):
    """Volume trend data point with additional metrics."""
    date: date
    created_count: int
    resolved_count: int
    closed_count: int
    net_change: int = Field(..., description="created - resolved")


class CategoryVolumeItem(HTTPSchemaModel):
    """Volume breakdown by category."""
    category_id: int
    category_name: str
    ticket_count: int
    percentage: float
    avg_resolution_hours: Optional[float] = None
    sla_compliance_rate: Optional[float] = None


class BusinessUnitVolumeItem(HTTPSchemaModel):
    """Volume breakdown by business unit."""
    business_unit_id: int
    business_unit_name: str
    ticket_count: int
    percentage: float
    open_count: int
    resolved_count: int
    avg_resolution_hours: Optional[float] = None


class VolumeReportData(HTTPSchemaModel):
    """Complete volume report data."""
    # Period info
    period_start: date
    period_end: date

    # Summary
    total_created: int
    total_resolved: int
    total_closed: int
    total_reopened: int
    current_backlog: int
    backlog_change: int = Field(..., description="Change in backlog from start to end of period")

    # KPIs
    avg_tickets_per_day: float
    peak_day: Optional[date] = None
    peak_day_count: int = 0

    # Trends
    volume_trend: List[VolumeTrendItem] = Field(default_factory=list)

    # Hourly distribution (for identifying peak hours)
    hourly_distribution: List[DistributionItem] = Field(default_factory=list)

    # Day of week distribution
    day_of_week_distribution: List[DistributionItem] = Field(default_factory=list)

    # Breakdowns
    by_category: List[CategoryVolumeItem] = Field(default_factory=list)
    by_business_unit: List[BusinessUnitVolumeItem] = Field(default_factory=list)
    by_priority: List[DistributionItem] = Field(default_factory=list)


# =============================================================================
# Agent Performance Reports
# =============================================================================


class AgentRankingItem(HTTPSchemaModel):
    """Agent performance ranking item."""
    rank: int
    technician_id: UUID
    technician_name: str
    full_name: Optional[str] = None

    # Performance metrics
    tickets_resolved: int
    tickets_assigned: int
    open_tickets: int
    resolution_rate: float
    avg_resolution_hours: Optional[float] = None
    avg_first_response_minutes: Optional[float] = None
    sla_compliance_rate: Optional[float] = None

    # Change from previous period
    rank_change: Optional[int] = Field(None, description="Positive = improved, negative = declined")


class WorkloadDistributionItem(HTTPSchemaModel):
    """Workload distribution for a technician."""
    technician_id: UUID
    technician_name: str
    full_name: Optional[str] = None
    open_tickets: int
    overdue_tickets: int
    tickets_due_today: int
    tickets_assigned_today: int
    capacity_percentage: Optional[float] = Field(None, description="Current load vs capacity")


class AgentPerformanceData(HTTPSchemaModel):
    """Complete agent performance report data."""
    # Period info
    period_start: date
    period_end: date

    # Team summary
    total_technicians: int
    active_technicians: int
    total_tickets_handled: int
    avg_tickets_per_technician: float

    # Team averages
    team_avg_resolution_hours: Optional[float] = None
    team_avg_first_response_minutes: Optional[float] = None
    team_sla_compliance_rate: Optional[float] = None

    # Rankings
    top_performers: List[AgentRankingItem] = Field(default_factory=list)
    needs_attention: List[AgentRankingItem] = Field(
        default_factory=list,
        description="Technicians with low performance metrics"
    )

    # Workload distribution
    workload_distribution: List[WorkloadDistributionItem] = Field(default_factory=list)

    # Distribution charts
    tickets_by_technician: List[DistributionItem] = Field(default_factory=list)
    resolution_time_distribution: List[DistributionItem] = Field(default_factory=list)
