"""
Reports API endpoints for dashboards and analytics.

Provides endpoints for generating comprehensive reports and analytics
for service requests, SLA compliance, agent performance, and operational metrics.

**Key Features:**
- Executive dashboard with KPIs and trends
- Operations dashboard with volume analysis
- SLA compliance reporting with breach tracking
- Agent performance rankings and metrics
- Outshift reporting (agent-specific and global)
- Flexible date range filtering (presets + custom)
- Multi-dimensional filtering (BU, priority, status, technician)
"""
import logging
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import require_technician
from db.models import User
from api.schemas.reports import (
    ExecutiveDashboardData,
    SLAComplianceData,
    VolumeReportData,
    AgentPerformanceData,
    ReportFilters,
    ReportDateRange,
    DateRangePreset,
    OutshiftAgentReport,
    OutshiftGlobalReport,
)
from api.services.reporting_service import ReportingService
from api.services.outshift_reporting_service import OutshiftReportingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])


def build_filters(
    date_preset: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    business_unit_ids: Optional[str] = None,
    technician_ids: Optional[str] = None,
    priority_ids: Optional[str] = None,
    status_ids: Optional[str] = None,
) -> ReportFilters:
    """
    Build ReportFilters from query parameters.

    Helper function that parses query parameters and constructs a
    ReportFilters object for use in report generation.

    Args:
        date_preset: Preset date range (today, yesterday, last_7_days, etc.)
        start_date: Custom start date (for preset='custom')
        end_date: Custom end date (for preset='custom')
        business_unit_ids: Comma-separated BU IDs
        technician_ids: Comma-separated technician UUIDs
        priority_ids: Comma-separated priority IDs
        status_ids: Comma-separated status IDs

    Returns:
        ReportFilters: Constructed filters object
    """
    date_range = None
    if date_preset or (start_date and end_date):
        preset = None
        if date_preset:
            try:
                preset = DateRangePreset(date_preset)
            except ValueError:
                preset = DateRangePreset.CUSTOM

        date_range = ReportDateRange(
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

    # Parse comma-separated IDs
    bu_ids = None
    if business_unit_ids:
        bu_ids = [int(x.strip()) for x in business_unit_ids.split(",") if x.strip()]

    tech_ids = None
    if technician_ids:
        from uuid import UUID
        tech_ids = [UUID(x.strip()) for x in technician_ids.split(",") if x.strip()]

    pri_ids = None
    if priority_ids:
        pri_ids = [int(x.strip()) for x in priority_ids.split(",") if x.strip()]

    stat_ids = None
    if status_ids:
        stat_ids = [int(x.strip()) for x in status_ids.split(",") if x.strip()]

    return ReportFilters(
        date_range=date_range,
        business_unit_ids=bu_ids,
        technician_ids=tech_ids,
        priority_ids=pri_ids,
        status_ids=stat_ids,
    )


# =============================================================================
# DASHBOARD ENDPOINTS
# =============================================================================


@router.get(
    "/dashboard/executive",
    response_model=ExecutiveDashboardData,
    summary="Get Executive Dashboard",
    description="Returns KPIs, trends, and distributions for executive overview.",
)
async def get_executive_dashboard(
    date_preset: Optional[str] = Query(
        None,
        description="Preset date range: today, yesterday, last_7_days, last_30_days, this_week, last_week, this_month, last_month, this_quarter, last_quarter, this_year, custom",
    ),
    start_date: Optional[date] = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Custom end date (YYYY-MM-DD)"),
    business_unit_ids: Optional[str] = Query(None, description="Comma-separated business unit IDs"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get executive dashboard data with KPIs, trends, and distributions.

    Returns high-level metrics for executive overview including:
    - Total requests, open requests, closed requests
    - Average resolution time
    - SLA compliance percentage
    - Request trends over time
    - Status distribution
    - Priority distribution
    - Category distribution

    Args:
        date_preset: Preset date range or 'custom'
        start_date: Custom start date (required if preset='custom')
        end_date: Custom end date (required if preset='custom')
        business_unit_ids: Optional BU filter
        db: Database session
        current_user: Authenticated technician

    Returns:
        ExecutiveDashboardData: Dashboard metrics and trends

    Raises:
        HTTPException 500: Report generation failed

    **Permissions:** Technicians and above
    """
    filters = build_filters(
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        business_unit_ids=business_unit_ids,
    )

    result = await ReportingService.get_executive_dashboard(db=db, filters=filters)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate executive dashboard",
        )

    return result


@router.get(
    "/dashboard/operations",
    response_model=VolumeReportData,
    summary="Get Operations Dashboard",
    description="Returns ticket volume analysis and operational metrics.",
)
async def get_operations_dashboard(
    date_preset: Optional[str] = Query(None, description="Preset date range"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    business_unit_ids: Optional[str] = Query(None, description="Comma-separated business unit IDs"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get operations dashboard with volume analysis.

    Returns detailed volume metrics for operational oversight:
    - Total volume over time
    - Volume by status
    - Volume by priority
    - Volume by category
    - Volume by business unit

    Args:
        date_preset: Preset date range or 'custom'
        start_date: Custom start date
        end_date: Custom end date
        business_unit_ids: Optional BU filter
        db: Database session
        current_user: Authenticated technician

    Returns:
        VolumeReportData: Volume analysis with breakdowns

    Raises:
        HTTPException 500: Report generation failed

    **Permissions:** Technicians and above
    """
    filters = build_filters(
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        business_unit_ids=business_unit_ids,
    )

    result = await ReportingService.get_volume_report(db=db, filters=filters)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate operations dashboard",
        )

    return result


# =============================================================================
# SLA REPORTS
# =============================================================================


@router.get(
    "/sla/compliance",
    response_model=SLAComplianceData,
    summary="Get SLA Compliance Report",
    description="Returns SLA compliance metrics including breaches and trends.",
)
async def get_sla_compliance_report(
    date_preset: Optional[str] = Query(None, description="Preset date range"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    business_unit_ids: Optional[str] = Query(None, description="Comma-separated business unit IDs"),
    priority_ids: Optional[str] = Query(None, description="Comma-separated priority IDs"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get SLA compliance report with breach analysis.

    Returns SLA performance metrics:
    - Overall compliance percentage
    - Response time compliance
    - Resolution time compliance
    - Breach count by priority
    - Breach trends over time
    - Top breach reasons

    Args:
        date_preset: Preset date range or 'custom'
        start_date: Custom start date
        end_date: Custom end date
        business_unit_ids: Optional BU filter
        priority_ids: Optional priority filter
        db: Database session
        current_user: Authenticated technician

    Returns:
        SLAComplianceData: SLA metrics and breach analysis

    Raises:
        HTTPException 500: Report generation failed

    **Permissions:** Technicians and above
    """
    filters = build_filters(
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        business_unit_ids=business_unit_ids,
        priority_ids=priority_ids,
    )

    result = await ReportingService.get_sla_compliance_report(db=db, filters=filters)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate SLA compliance report",
        )

    return result


# =============================================================================
# AGENT PERFORMANCE REPORTS
# =============================================================================


@router.get(
    "/agents/performance",
    response_model=AgentPerformanceData,
    summary="Get Agent Performance Report",
    description="Returns technician performance metrics and rankings.",
)
async def get_agent_performance_report(
    date_preset: Optional[str] = Query(None, description="Preset date range"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    technician_ids: Optional[str] = Query(None, description="Comma-separated technician UUIDs"),
    business_unit_ids: Optional[str] = Query(None, description="Comma-separated business unit IDs"),
    limit: int = Query(10, ge=1, le=50, description="Number of top performers to return"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get agent performance report with rankings.

    Returns technician performance metrics:
    - Total requests handled
    - Average resolution time
    - SLA compliance rate
    - Customer satisfaction (if available)
    - Rankings by performance
    - Per-technician breakdowns

    Args:
        date_preset: Preset date range or 'custom'
        start_date: Custom start date
        end_date: Custom end date
        technician_ids: Optional technician filter
        business_unit_ids: Optional BU filter
        limit: Number of top performers to return (1-50)
        db: Database session
        current_user: Authenticated technician

    Returns:
        AgentPerformanceData: Performance metrics and rankings

    Raises:
        HTTPException 500: Report generation failed

    **Permissions:** Technicians and above
    """
    filters = build_filters(
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        technician_ids=technician_ids,
        business_unit_ids=business_unit_ids,
    )

    result = await ReportingService.get_agent_performance_report(
        db=db, filters=filters, limit=limit
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate agent performance report",
        )

    return result


# =============================================================================
# VOLUME REPORTS
# =============================================================================


@router.get(
    "/volume/analysis",
    response_model=VolumeReportData,
    summary="Get Volume Analysis Report",
    description="Returns detailed ticket volume analysis with trends and distributions.",
)
async def get_volume_analysis_report(
    date_preset: Optional[str] = Query(None, description="Preset date range"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    business_unit_ids: Optional[str] = Query(None, description="Comma-separated business unit IDs"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get volume analysis report.

    Returns comprehensive volume analysis:
    - Total requests over time
    - Requests by status
    - Requests by priority
    - Requests by category
    - Requests by business unit
    - Trend analysis

    Args:
        date_preset: Preset date range or 'custom'
        start_date: Custom start date
        end_date: Custom end date
        business_unit_ids: Optional BU filter
        db: Database session
        current_user: Authenticated technician

    Returns:
        VolumeReportData: Volume analysis with breakdowns

    Raises:
        HTTPException 500: Report generation failed

    **Permissions:** Technicians and above
    """
    filters = build_filters(
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        business_unit_ids=business_unit_ids,
    )

    result = await ReportingService.get_volume_report(db=db, filters=filters)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate volume analysis report",
        )

    return result


# =============================================================================
# OUTSHIFT REPORTS
# =============================================================================


@router.get(
    "/outshift/agent/{agent_id}",
    response_model=OutshiftAgentReport,
    summary="Get Agent Outshift Report",
    description="Returns outshift metrics for a single agent with per-BU breakdown.",
)
async def get_agent_outshift_report(
    agent_id: str,
    date_preset: Optional[str] = Query(None, description="Preset date range"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get outshift report for a specific agent.

    Outshift measures how much work an agent handles outside their assigned
    business units, providing insight into cross-BU collaboration.

    Access:
    - Super admins: Can view any agent's outshift report
    - Technicians: Can view any agent's outshift report

    Args:
        agent_id: Agent UUID as string
        date_preset: Preset date range or 'custom'
        start_date: Custom start date
        end_date: Custom end date
        db: Database session
        current_user: Authenticated technician

    Returns:
        OutshiftAgentReport:
            - agent_id: Agent UUID
            - agent_name: Agent name
            - total_requests: Total requests handled
            - outshift_percentage: % of work from other BUs
            - business_unit_breakdown: Per-BU metrics

    Raises:
        HTTPException 400: Invalid agent ID format
        HTTPException 404: Agent not found

    **Permissions:** Technicians and above
    """
    from uuid import UUID

    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format. Must be a valid UUID.",
        )

    filters = build_filters(
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
    )

    result = await OutshiftReportingService.get_agent_outshift_report(
        db=db, agent_id=agent_uuid, filters=filters
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID {agent_id} not found",
        )

    return result


@router.get(
    "/outshift/global",
    response_model=OutshiftGlobalReport,
    summary="Get Global Outshift Report",
    description="Returns aggregate outshift metrics across all agents with rankings.",
)
async def get_global_outshift_report(
    date_preset: Optional[str] = Query(None, description="Preset date range"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    business_unit_ids: Optional[str] = Query(None, description="Comma-separated business unit IDs"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get global outshift report with agent rankings.

    Returns aggregate outshift metrics across all agents with rankings.
    Super admins see all data regardless of business_unit_ids filter.

    Access:
    - Super admins: See all agents across all business units (filter ignored)
    - Technicians: See agents filtered by business_unit_ids if provided

    Args:
        date_preset: Preset date range or 'custom'
        start_date: Custom start date
        end_date: Custom end date
        business_unit_ids: Optional BU filter (ignored for super admins)
        db: Database session
        current_user: Authenticated technician

    Returns:
        OutshiftGlobalReport:
            - total_agents: Total agents
            - average_outshift_percentage: Average outshift %
            - top_outshift_agents: Ranked list of agents
            - business_unit_comparison: Per-BU averages

    **Permissions:** Technicians and above
    """
    # Super admins should see ALL data (ignore business_unit_ids filter)
    if current_user.is_super_admin:
        filters = build_filters(
            date_preset=date_preset,
            start_date=start_date,
            end_date=end_date,
            business_unit_ids=None,  # Force to None to show all business units
        )
    else:
        # Regular technicians use the business_unit_ids filter if provided
        filters = build_filters(
            date_preset=date_preset,
            start_date=start_date,
            end_date=end_date,
            business_unit_ids=business_unit_ids,
        )

    result = await OutshiftReportingService.get_global_outshift_report(
        db=db, filters=filters
    )

    return result
