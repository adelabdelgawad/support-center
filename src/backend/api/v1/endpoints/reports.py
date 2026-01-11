"""
Reports API endpoints for dashboards and analytics.
"""
import logging
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user, require_technician, require_technician_or_auditor
from models.database_models import User
from schemas.reports import (
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
from services.reporting_service import ReportingService
from services.outshift_reporting_service import OutshiftReportingService

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
    """Build ReportFilters from query parameters."""
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
# Dashboard Endpoints
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
    """Get executive dashboard data with KPIs, trends, and distributions."""
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
    """Get operations dashboard with volume analysis."""
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
# SLA Reports
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
    """Get SLA compliance report with breach analysis."""
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
# Agent Performance Reports
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
    """Get agent performance report with rankings."""
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
# Volume Reports
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
    """Get volume analysis report."""
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
# Outshift Reports
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
    current_user: User = Depends(require_technician_or_auditor),
):
    """Get outshift report for a specific agent.

    Access:
    - Super admins: Can view any agent's outshift report
    - Auditors: Can view any agent's outshift report
    - Technicians: Can view any agent's outshift report
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
    current_user: User = Depends(require_technician_or_auditor),
):
    """Get global outshift report with agent rankings.

    Access:
    - Super admins: See all agents across all business units (business_unit_ids filter ignored)
    - Auditors: See all agents across all business units (business_unit_ids filter ignored)
    - Technicians: See agents filtered by business_unit_ids if provided
    """
    # Check if user has Auditor role
    has_auditor_role = False
    if hasattr(current_user, 'user_roles'):
        for user_role in current_user.user_roles:
            if (user_role.role and
                user_role.role.name and
                user_role.role.name.lower() == 'auditor' and
                not user_role.is_deleted and
                user_role.role.is_active):
                has_auditor_role = True
                break

    # Super admins and auditors should see ALL data (ignore business_unit_ids filter)
    if current_user.is_super_admin or has_auditor_role:
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
