"""Reports and Analytics schemas."""

from .dashboard import (
    # Executive Dashboard
    ExecutiveDashboardData,
    KPICard,
    TrendDataPoint,
    TrendDirection,
    DistributionItem,

    # SLA Reports
    SLAComplianceData,
    SLABreachItem,
    SLAAgingBucket,

    # Volume Reports
    VolumeReportData,
    VolumeTrendItem,
    CategoryVolumeItem,
    BusinessUnitVolumeItem,

    # Agent Reports
    AgentPerformanceData,
    AgentRankingItem,
    WorkloadDistributionItem,

    # Common filters
    DateRangePreset,
    ReportDateRange,
    ReportFilters,
)

from .outshift import (
    # Outshift Reports
    ActivityType,
    ShiftClassification,
    OutshiftActivitySegment,
    OutshiftAgentBUMetrics,
    OutshiftAgentReport,
    OutshiftAgentSummary,
    OutshiftGlobalReport,
)

__all__ = [
    # Executive Dashboard
    "ExecutiveDashboardData",
    "KPICard",
    "TrendDataPoint",
    "TrendDirection",
    "DistributionItem",

    # SLA Reports
    "SLAComplianceData",
    "SLABreachItem",
    "SLAAgingBucket",

    # Volume Reports
    "VolumeReportData",
    "VolumeTrendItem",
    "CategoryVolumeItem",
    "BusinessUnitVolumeItem",

    # Agent Reports
    "AgentPerformanceData",
    "AgentRankingItem",
    "WorkloadDistributionItem",

    # Outshift Reports
    "ActivityType",
    "ShiftClassification",
    "OutshiftActivitySegment",
    "OutshiftAgentBUMetrics",
    "OutshiftAgentReport",
    "OutshiftAgentSummary",
    "OutshiftGlobalReport",

    # Common filters
    "DateRangePreset",
    "ReportDateRange",
    "ReportFilters",
]
