"""
Reporting service for generating reports and aggregating metrics.
"""

import logging
from datetime import datetime, date, timedelta
from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import log_database_operation, safe_database_query
from db.models import ServiceRequest, User
from api.schemas.reports import (
    ExecutiveDashboardData,
    KPICard,
    TrendDataPoint,
    DistributionItem,
    TrendDirection,
    SLAComplianceData,
    SLABreachItem,
    SLAAgingBucket,
    VolumeReportData,
    VolumeTrendItem,
    AgentPerformanceData,
    AgentRankingItem,
    WorkloadDistributionItem,
    ReportFilters,
    ReportDateRange,
    DateRangePreset,
)
from api.repositories.reporting.reporting_query_repository import ReportingQueryRepository

logger = logging.getLogger(__name__)


class ReportingService:
    """Service for generating reports and analytics."""

    # =========================================================================
    # Date Range Helpers
    # =========================================================================

    @staticmethod
    def resolve_date_range(
        date_range: Optional[ReportDateRange] = None,
    ) -> tuple[date, date]:
        """
        Resolve a date range specification to actual start and end dates.

        Returns (start_date, end_date) tuple.
        """
        today = date.today()

        if not date_range:
            # Default to last 30 days
            return today - timedelta(days=30), today

        if date_range.preset:
            preset = date_range.preset
            if preset == DateRangePreset.TODAY:
                return today, today
            elif preset == DateRangePreset.YESTERDAY:
                yesterday = today - timedelta(days=1)
                return yesterday, yesterday
            elif preset == DateRangePreset.LAST_7_DAYS:
                return today - timedelta(days=7), today
            elif preset == DateRangePreset.LAST_30_DAYS:
                return today - timedelta(days=30), today
            elif preset == DateRangePreset.THIS_WEEK:
                start = today - timedelta(days=today.weekday())
                return start, today
            elif preset == DateRangePreset.LAST_WEEK:
                end = today - timedelta(days=today.weekday() + 1)
                start = end - timedelta(days=6)
                return start, end
            elif preset == DateRangePreset.THIS_MONTH:
                start = today.replace(day=1)
                return start, today
            elif preset == DateRangePreset.LAST_MONTH:
                first_of_month = today.replace(day=1)
                end = first_of_month - timedelta(days=1)
                start = end.replace(day=1)
                return start, end
            elif preset == DateRangePreset.THIS_QUARTER:
                quarter_start_month = ((today.month - 1) // 3) * 3 + 1
                start = today.replace(month=quarter_start_month, day=1)
                return start, today
            elif preset == DateRangePreset.LAST_QUARTER:
                quarter_start_month = ((today.month - 1) // 3) * 3 + 1
                this_quarter_start = today.replace(month=quarter_start_month, day=1)
                end = this_quarter_start - timedelta(days=1)
                last_quarter_start_month = ((end.month - 1) // 3) * 3 + 1
                start = end.replace(month=last_quarter_start_month, day=1)
                return start, end
            elif preset == DateRangePreset.THIS_YEAR:
                start = today.replace(month=1, day=1)
                return start, today
            elif preset == DateRangePreset.CUSTOM:
                if date_range.start_date and date_range.end_date:
                    return date_range.start_date, date_range.end_date

        # Custom dates
        if date_range.start_date and date_range.end_date:
            return date_range.start_date, date_range.end_date

        # Default fallback
        return today - timedelta(days=30), today

    @staticmethod
    def get_comparison_period(
        start_date: date,
        end_date: date,
    ) -> tuple[date, date]:
        """Get the comparison period (same duration, immediately before)."""
        duration = (end_date - start_date).days + 1
        comp_end = start_date - timedelta(days=1)
        comp_start = comp_end - timedelta(days=duration - 1)
        return comp_start, comp_end

    # =========================================================================
    # Executive Dashboard
    # =========================================================================

    @staticmethod
    @safe_database_query("get_executive_dashboard", default_return=None)
    @log_database_operation("executive dashboard generation", level="info")
    async def get_executive_dashboard(
        db: AsyncSession,
        filters: Optional[ReportFilters] = None,
    ) -> ExecutiveDashboardData:
        """Generate executive dashboard data."""
        # Resolve date range
        date_range = filters.date_range if filters else None
        start_date, end_date = ReportingService.resolve_date_range(date_range)
        comp_start, comp_end = ReportingService.get_comparison_period(
            start_date, end_date
        )

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())
        comp_start_dt = datetime.combine(comp_start, datetime.min.time())
        comp_end_dt = datetime.combine(comp_end, datetime.max.time())

        # Build business unit filter
        business_unit_ids = filters.business_unit_ids if filters else None

        # Get current period totals using repository
        (
            total_tickets,
            resolved_tickets,
        ) = await ReportingQueryRepository.get_ticket_counts_by_period(
            db, start_dt, end_dt, business_unit_ids
        )

        # Get comparison period totals using repository
        (
            comp_total_tickets,
            comp_resolved_tickets,
        ) = await ReportingQueryRepository.get_ticket_counts_by_period(
            db, comp_start_dt, comp_end_dt, business_unit_ids
        )

        # Get open status IDs (statuses where count_as_solved = False)
        open_status_ids = await ReportingQueryRepository.get_aging_buckets_by_status_ids(
            db, []
        )

        # Build extra conditions for business unit filter
        extra_conditions = []
        if business_unit_ids:
            extra_conditions.append(ServiceRequest.business_unit_id.in_(business_unit_ids))

        # Get current open tickets using repository
        open_tickets = await ReportingQueryRepository.get_open_tickets_count(
            db, open_status_ids, extra_conditions
        )

        # Get SLA compliance using repository
        sla_compliance, sla_met = await ReportingQueryRepository.get_sla_compliance(
            db, start_dt, end_dt, business_unit_ids
        )
        (
            comp_sla_compliance,
            comp_sla_met,
        ) = await ReportingQueryRepository.get_sla_compliance(
            db, comp_start_dt, comp_end_dt, business_unit_ids
        )

        # Get average resolution time using repository
        avg_resolution_hours = (
            await ReportingQueryRepository.get_average_resolution_time(
                db, start_dt, end_dt, business_unit_ids
            )
        )
        comp_avg_resolution_hours = (
            await ReportingQueryRepository.get_average_resolution_time(
                db, comp_start_dt, comp_end_dt, business_unit_ids
            )
        )

        # Get average first response time using repository
        avg_frt_minutes = (
            await ReportingQueryRepository.get_average_first_response_time(
                db, start_dt, end_dt, business_unit_ids
            )
        )
        comp_avg_frt_minutes = (
            await ReportingQueryRepository.get_average_first_response_time(
                db, comp_start_dt, comp_end_dt, business_unit_ids
            )
        )

        # Helper to create KPI cards
        def create_kpi_card(
            id: str,
            label: str,
            value: float,
            previous: float,
            unit: Optional[str] = None,
            higher_is_better: bool = True,
            target: Optional[float] = None,
        ) -> KPICard:
            change_percent = None
            trend_direction = TrendDirection.STABLE

            if previous > 0:
                change_percent = ((value - previous) / previous) * 100
                if abs(change_percent) > 1:  # More than 1% change
                    if change_percent > 0:
                        trend_direction = (
                            TrendDirection.UP
                            if higher_is_better
                            else TrendDirection.DOWN
                        )
                    else:
                        trend_direction = (
                            TrendDirection.DOWN
                            if higher_is_better
                            else TrendDirection.UP
                        )

            is_target_met = None
            if target is not None:
                is_target_met = value >= target if higher_is_better else value <= target

            return KPICard(
                id=id,
                label=label,
                value=round(value, 2),
                unit=unit,
                previous_value=round(previous, 2) if previous else None,
                change_percent=round(change_percent, 1) if change_percent else None,
                trend_direction=trend_direction,
                target=target,
                is_target_met=is_target_met,
            )

        # Build base conditions for filtering
        base_conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
        ]
        if business_unit_ids:
            base_conditions.append(
                ServiceRequest.business_unit_id.in_(business_unit_ids)
            )

        # Get ticket volume trend
        volume_trend = await ReportingService._get_volume_trend(
            db, start_date, end_date, base_conditions
        )

        # Get tickets by status distribution
        status_dist = await ReportingService._get_status_distribution(
            db, base_conditions
        )

        # Get tickets by priority distribution
        priority_dist = await ReportingService._get_priority_distribution(
            db, base_conditions
        )

        # Get tickets by category distribution
        category_dist = await ReportingService._get_category_distribution(
            db, base_conditions
        )

        # Get tickets by business unit distribution
        business_unit_dist = await ReportingService._get_business_unit_distribution(
            db, base_conditions
        )

        # Get SLA compliance trend
        compliance_trend = await ReportingService._get_compliance_trend(
            db, start_date, end_date, base_conditions
        )

        return ExecutiveDashboardData(
            period_start=start_date,
            period_end=end_date,
            comparison_period_start=comp_start,
            comparison_period_end=comp_end,
            total_tickets=create_kpi_card(
                "total_tickets",
                "Total Tickets",
                total_tickets,
                comp_total_tickets,
                "count",
            ),
            resolved_tickets=create_kpi_card(
                "resolved_tickets",
                "Resolved Tickets",
                resolved_tickets,
                comp_resolved_tickets,
                "count",
            ),
            open_tickets=create_kpi_card(
                "open_tickets",
                "Open Tickets",
                open_tickets,
                0,  # No comparison for current open
                "count",
                higher_is_better=False,
            ),
            sla_compliance=create_kpi_card(
                "sla_compliance",
                "SLA Compliance",
                sla_compliance,
                comp_sla_compliance,
                "%",
                target=95.0,
            ),
            avg_resolution_time=create_kpi_card(
                "avg_resolution_time",
                "Avg Resolution Time",
                avg_resolution_hours,
                comp_avg_resolution_hours,
                "hrs",
                higher_is_better=False,
            ),
            avg_first_response_time=create_kpi_card(
                "avg_first_response_time",
                "Avg First Response",
                avg_frt_minutes,
                comp_avg_frt_minutes,
                "min",
                higher_is_better=False,
            ),
            ticket_volume_trend=volume_trend,
            tickets_by_status=status_dist,
            tickets_by_priority=priority_dist,
            tickets_by_category=category_dist,
            tickets_by_business_unit=business_unit_dist,
            sla_compliance_trend=compliance_trend,
        )

    @staticmethod
    async def _get_volume_trend(
        db: AsyncSession,
        start_date: date,
        end_date: date,
        base_conditions: list,
    ) -> List[TrendDataPoint]:
        """Get daily ticket volume trend."""
        rows = await ReportingQueryRepository.get_volume_trend(
            db, start_date, end_date, base_conditions
        )
        return [TrendDataPoint(date=row.day, value=row.count) for row in rows]

    @staticmethod
    async def _get_status_distribution(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[DistributionItem]:
        """Get ticket distribution by status."""
        rows = await ReportingQueryRepository.get_status_distribution(
            db, base_conditions
        )

        total = sum(row.count for row in rows)
        return [
            DistributionItem(
                id=str(row.id),
                label=row.name,
                value=row.count,
                percentage=round((row.count / total * 100) if total > 0 else 0, 1),
                color=row.color,
            )
            for row in rows
        ]

    @staticmethod
    async def _get_priority_distribution(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[DistributionItem]:
        """Get ticket distribution by priority."""
        rows = await ReportingQueryRepository.get_priority_distribution(
            db, base_conditions
        )

        # Priority colors
        priority_colors = {
            "Critical": "#ef4444",
            "High": "#f97316",
            "Medium": "#eab308",
            "Low": "#22c55e",
            "Lowest": "#64748b",
        }

        total = sum(row.count for row in rows)
        return [
            DistributionItem(
                id=str(row.id),
                label=row.name,
                value=row.count,
                percentage=round((row.count / total * 100) if total > 0 else 0, 1),
                color=priority_colors.get(row.name),
            )
            for row in rows
        ]

    @staticmethod
    async def _get_category_distribution(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[DistributionItem]:
        """Get ticket distribution by category."""
        rows = await ReportingQueryRepository.get_category_distribution(
            db, base_conditions
        )

        total = sum(row.count for row in rows)
        return [
            DistributionItem(
                id=str(row.id),
                label=row.name,
                value=row.count,
                percentage=round((row.count / total * 100) if total > 0 else 0, 1),
            )
            for row in rows
        ]

    @staticmethod
    async def _get_business_unit_distribution(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[DistributionItem]:
        """Get ticket distribution by business unit."""
        rows = await ReportingQueryRepository.get_business_unit_distribution(
            db, base_conditions
        )

        total = sum(row.count for row in rows)
        return [
            DistributionItem(
                id=str(row.id),
                label=row.name,
                value=row.count,
                percentage=round((row.count / total * 100) if total > 0 else 0, 1),
            )
            for row in rows
        ]

    @staticmethod
    async def _get_compliance_trend(
        db: AsyncSession,
        start_date: date,
        end_date: date,
        base_conditions: list,
    ) -> List[TrendDataPoint]:
        """Get daily SLA compliance trend."""
        trend_data = []
        current_date = start_date

        while current_date <= end_date:
            day_start = datetime.combine(current_date, datetime.min.time())
            day_end = datetime.combine(current_date, datetime.max.time())

            compliance_rate = await ReportingQueryRepository.get_daily_compliance_rate(
                db, day_start, day_end
            )

            trend_data.append(
                TrendDataPoint(date=current_date, value=round(compliance_rate, 2))
            )

            current_date += timedelta(days=1)

        return trend_data

    @staticmethod
    async def _get_sla_compliance_trend(
        db: AsyncSession,
        start_date: date,
        end_date: date,
        base_conditions: list,
    ) -> List[TrendDataPoint]:
        """Get daily SLA compliance trend for SLA report."""
        return await ReportingService._get_compliance_trend(
            db, start_date, end_date, base_conditions
        )

    @staticmethod
    async def _get_compliance_by_priority(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[DistributionItem]:
        """Get SLA compliance breakdown by priority."""
        rows = await ReportingQueryRepository.get_compliance_by_priority(
            db, base_conditions
        )

        priority_colors = {
            "Critical": "#ef4444",
            "High": "#f97316",
            "Medium": "#eab308",
            "Low": "#22c55e",
            "Lowest": "#64748b",
        }

        return [
            DistributionItem(
                id=str(row.id),
                label=row.name,
                value=round((row.met / row.total * 100) if row.total > 0 else 0, 2),
                percentage=round(
                    (row.met / row.total * 100) if row.total > 0 else 0, 1
                ),
                color=priority_colors.get(row.name),
            )
            for row in rows
        ]

    @staticmethod
    async def _get_aging_buckets(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[SLAAgingBucket]:
        """Get aging buckets for open tickets approaching SLA breach."""
        # Get open status IDs
        open_status_ids = await ReportingQueryRepository.get_aging_buckets_by_status_ids(
            db, []
        )

        aging_conditions = base_conditions + [
            ServiceRequest.status_id.in_(open_status_ids),
            ServiceRequest.due_date.isnot(None),
        ]

        now = datetime.utcnow()

        # Define aging buckets based on time remaining
        buckets = [
            ("overdue", "Overdue", None, now),  # Past due date
            ("critical", "< 2 hours", now, now + timedelta(hours=2)),
            (
                "warning",
                "2-8 hours",
                now + timedelta(hours=2),
                now + timedelta(hours=8),
            ),
            (
                "normal",
                "8-24 hours",
                now + timedelta(hours=8),
                now + timedelta(hours=24),
            ),
            ("healthy", "> 24 hours", now + timedelta(hours=24), None),
        ]

        # First, get total count for percentage calculation
        total_count = await ReportingQueryRepository.get_total_tickets_count(
            db, aging_conditions
        )

        aging_data = []
        for bucket_id, label, range_start, range_end in buckets:
            tickets = await ReportingQueryRepository.get_aging_bucket_tickets(
                db, aging_conditions, range_start, range_end
            )
            count = len(tickets)

            # Calculate average age in hours
            if count > 0:
                total_age_seconds = sum(
                    (now - ticket.created_at).total_seconds() for ticket in tickets
                )
                average_age_hours = total_age_seconds / count / 3600
            else:
                average_age_hours = 0.0

            # Calculate percentage
            percentage = (count / total_count * 100) if total_count > 0 else 0.0

            aging_data.append(
                SLAAgingBucket(
                    bucket_name=label,
                    count=count,
                    percentage=percentage,
                    average_age_hours=average_age_hours,
                )
            )

        return aging_data

    # =========================================================================
    # SLA Compliance Report
    # =========================================================================

    @staticmethod
    @safe_database_query("get_sla_compliance_report", default_return=None)
    @log_database_operation("sla compliance report generation", level="info")
    async def get_sla_compliance_report(
        db: AsyncSession,
        filters: Optional[ReportFilters] = None,
    ) -> SLAComplianceData:
        """Generate SLA compliance report data."""
        date_range = filters.date_range if filters else None
        start_date, end_date = ReportingService.resolve_date_range(date_range)

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())

        base_conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
        ]

        if filters:
            if filters.business_unit_ids:
                base_conditions.append(
                    ServiceRequest.business_unit_id.in_(filters.business_unit_ids)
                )
            if filters.priority_ids:
                base_conditions.append(
                    ServiceRequest.priority_id.in_(filters.priority_ids)
                )

        # Total tickets
        total_tickets = await ReportingQueryRepository.get_total_tickets_count(
            db, base_conditions
        )

        # Tickets with SLA (those that have been resolved or have due dates)
        sla_conditions = base_conditions + [
            or_(
                ServiceRequest.resolved_at.isnot(None),
                ServiceRequest.due_date.isnot(None),
            )
        ]
        tickets_with_sla = await ReportingQueryRepository.get_total_tickets_count(
            db, sla_conditions
        )

        # First response SLA
        frt_met_conditions = base_conditions + [
            ServiceRequest.first_response_at.isnot(None),
            ~ServiceRequest.sla_first_response_breached,
        ]
        frt_met = await ReportingQueryRepository.get_total_tickets_count(
            db, frt_met_conditions
        )

        frt_breached = await ReportingQueryRepository.get_sla_breached_count(
            db, base_conditions, "sla_first_response_breached"
        )

        frt_total = frt_met + frt_breached
        frt_compliance = (frt_met / frt_total * 100) if frt_total > 0 else 100.0

        # Resolution SLA
        res_met = await ReportingQueryRepository.get_sla_met_count(
            db, base_conditions
        )

        res_breached = await ReportingQueryRepository.get_sla_breached_count(
            db, base_conditions, "sla_resolution_breached"
        )

        res_total = res_met + res_breached
        res_compliance = (res_met / res_total * 100) if res_total > 0 else 100.0

        # Overall compliance
        total_sla_checks = frt_total + res_total
        total_met = frt_met + res_met
        overall_compliance = (
            (total_met / total_sla_checks * 100) if total_sla_checks > 0 else 100.0
        )

        # Average times
        avg_frt = await ReportingQueryRepository.get_avg_first_response_time(
            db, base_conditions
        )

        avg_res = await ReportingQueryRepository.get_avg_resolution_time(
            db, base_conditions
        )

        # Get compliance trend
        compliance_trend = await ReportingService._get_sla_compliance_trend(
            db, start_date, end_date, base_conditions
        )

        # Get compliance by priority
        compliance_by_priority = await ReportingService._get_compliance_by_priority(
            db, base_conditions
        )

        # Get aging buckets
        aging_buckets = await ReportingService._get_aging_buckets(db, base_conditions)

        # Recent breaches (last 10)
        breach_requests = await ReportingQueryRepository.get_sla_breached_requests(
            db, base_conditions, limit=10
        )

        recent_breaches = []
        for req in breach_requests:
            due_at = req.due_date
            breach_duration = 0.0

            if req.sla_first_response_breached and req.sla_first_response_due:
                due_at = req.sla_first_response_due
                if req.first_response_at:
                    breach_duration = (
                        req.first_response_at - req.sla_first_response_due
                    ).total_seconds() / 60

            elif req.sla_resolution_breached and req.due_date:
                if req.resolved_at:
                    breach_duration = (
                        req.resolved_at - req.due_date
                    ).total_seconds() / 60
                else:
                    breach_duration = (
                        datetime.utcnow() - req.due_date
                    ).total_seconds() / 60

            recent_breaches.append(
                SLABreachItem(
                    request_id=req.id,
                    title=req.title,
                    requester_name=req.requester.full_name if req.requester else None,
                    assigned_technician=None,  # Would need to join assignees
                    priority_name=req.priority.name if req.priority else "Unknown",
                    status_name=req.status.name if req.status else "Unknown",
                    created_at=req.created_at,
                    sla_due_at=due_at or req.created_at,
                    breach_duration_minutes=breach_duration,
                )
            )

        return SLAComplianceData(
            period_start=start_date,
            period_end=end_date,
            total_tickets=total_tickets,
            tickets_with_sla=tickets_with_sla,
            sla_met_count=total_met,
            sla_breached_count=frt_breached + res_breached,
            overall_compliance_rate=round(overall_compliance, 2),
            first_response_sla_met=frt_met,
            first_response_sla_breached=frt_breached,
            first_response_compliance_rate=round(frt_compliance, 2),
            avg_first_response_minutes=round(avg_frt, 2) if avg_frt else None,
            resolution_sla_met=res_met,
            resolution_sla_breached=res_breached,
            resolution_compliance_rate=round(res_compliance, 2),
            avg_resolution_hours=round(avg_res, 2) if avg_res else None,
            recent_breaches=recent_breaches,
            compliance_trend=compliance_trend,
            compliance_by_priority=compliance_by_priority,
            aging_buckets=aging_buckets,
        )

    # =========================================================================
    # Volume Report
    # =========================================================================

    @staticmethod
    @safe_database_query("get_volume_report", default_return=None)
    @log_database_operation("volume report generation", level="info")
    async def get_volume_report(
        db: AsyncSession,
        filters: Optional[ReportFilters] = None,
    ) -> VolumeReportData:
        """Generate ticket volume report data."""
        date_range = filters.date_range if filters else None
        start_date, end_date = ReportingService.resolve_date_range(date_range)

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())

        base_conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
        ]

        if filters:
            if filters.business_unit_ids:
                base_conditions.append(
                    ServiceRequest.business_unit_id.in_(filters.business_unit_ids)
                )

        # Total created
        total_created = await ReportingQueryRepository.get_total_tickets_count(
            db, base_conditions
        )

        # Total resolved in period
        total_resolved = await ReportingQueryRepository.get_resolved_count_in_period(
            db, start_dt, end_dt
        )

        # Total closed in period
        total_closed = await ReportingQueryRepository.get_closed_count_in_period(
            db, start_dt, end_dt
        )

        # Total reopened
        total_reopened = await ReportingQueryRepository.get_reopened_sum(
            db, base_conditions
        )

        # Current backlog (open tickets)
        open_status_ids = await ReportingQueryRepository.get_aging_buckets_by_status_ids(
            db, []
        )

        current_backlog = await ReportingQueryRepository.get_backlog_count(
            db, open_status_ids
        )

        # Calculate averages
        days_in_period = (end_date - start_date).days + 1
        avg_per_day = total_created / days_in_period if days_in_period > 0 else 0

        # Peak day
        peak_day, peak_count = await ReportingQueryRepository.get_peak_day(
            db, base_conditions
        )

        # Volume trend
        volume_trend_data = await ReportingQueryRepository.get_volume_trend_with_resolved_closed(
            db, base_conditions, start_date, end_date
        )

        volume_trend = [
            VolumeTrendItem(
                date=item["day"],
                created_count=item["created"],
                resolved_count=item["resolved_count"],
                closed_count=item["closed_count"],
                net_change=item["created"] - item["resolved_count"],
            )
            for item in volume_trend_data
        ]

        # Hourly distribution
        hourly_rows = await ReportingQueryRepository.get_hourly_distribution(
            db, base_conditions
        )

        hourly_total = sum(r.count for r in hourly_rows)
        hourly_distribution = [
            DistributionItem(
                id=f"hour_{int(r.hour)}",
                label=f"{int(r.hour):02d}:00",
                value=r.count,
                percentage=round(
                    (r.count / hourly_total * 100) if hourly_total > 0 else 0, 1
                ),
            )
            for r in hourly_rows
        ]

        # Day of week distribution
        dow_rows = await ReportingQueryRepository.get_day_of_week_distribution(
            db, base_conditions
        )

        day_names = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ]
        dow_total = sum(r.count for r in dow_rows)
        day_of_week_distribution = [
            DistributionItem(
                id=f"dow_{int(r.dow)}",
                label=day_names[int(r.dow)],
                value=r.count,
                percentage=round(
                    (r.count / dow_total * 100) if dow_total > 0 else 0, 1
                ),
            )
            for r in dow_rows
        ]

        return VolumeReportData(
            period_start=start_date,
            period_end=end_date,
            total_created=total_created,
            total_resolved=total_resolved,
            total_closed=total_closed,
            total_reopened=total_reopened,
            current_backlog=current_backlog,
            backlog_change=total_created - total_resolved,
            avg_tickets_per_day=round(avg_per_day, 2),
            peak_day=peak_day,
            peak_day_count=peak_count,
            volume_trend=volume_trend,
            hourly_distribution=hourly_distribution,
            day_of_week_distribution=day_of_week_distribution,
        )

    # =========================================================================
    # Agent Performance Report
    # =========================================================================

    @staticmethod
    @safe_database_query("get_agent_performance_report", default_return=None)
    @log_database_operation("agent performance report generation", level="info")
    async def get_agent_performance_report(
        db: AsyncSession,
        filters: Optional[ReportFilters] = None,
        limit: int = 10,
    ) -> AgentPerformanceData:
        """Generate agent/technician performance report data."""
        date_range = filters.date_range if filters else None
        start_date, end_date = ReportingService.resolve_date_range(date_range)

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())

        # Get all technicians
        tech_stmt = select(User).where(User.is_technician, User.is_active)
        if filters and filters.technician_ids:
            tech_stmt = tech_stmt.where(User.id.in_(filters.technician_ids))

        tech_result = await db.execute(tech_stmt)
        technicians = tech_result.scalars().all()

        total_technicians = len(technicians)
        active_technicians = 0
        total_tickets_handled = 0

        rankings = []

        # Get open status IDs once
        open_status_ids = await ReportingQueryRepository.get_aging_buckets_by_status_ids(
            db, []
        )

        for tech in technicians:
            # Get assignments in period
            assigned_count = await ReportingQueryRepository.get_technician_assignments(
                db, tech.id, start_dt, end_dt
            )

            # Get resolved count
            resolved_count = await ReportingQueryRepository.get_technician_resolved_tickets(
                db, tech.id, start_dt, end_dt
            )

            # Current open tickets
            open_count = await ReportingQueryRepository.get_technician_open_tickets(
                db, tech.id, open_status_ids
            )

            if assigned_count > 0 or resolved_count > 0:
                active_technicians += 1
                total_tickets_handled += resolved_count

            resolution_rate = (
                (resolved_count / assigned_count * 100) if assigned_count > 0 else 0
            )

            # Average resolution time for this tech
            avg_res_hours = await ReportingQueryRepository.get_technician_avg_resolution_time(
                db, tech.id, start_dt, end_dt
            )

            # SLA compliance for this tech
            sla_met = await ReportingQueryRepository.get_technician_sla_met_count(
                db, tech.id, start_dt, end_dt
            )

            sla_compliance = (
                (sla_met / resolved_count * 100) if resolved_count > 0 else 100.0
            )

            rankings.append(
                AgentRankingItem(
                    rank=0,  # Will be set after sorting
                    technician_id=tech.id,
                    technician_name=tech.username,
                    full_name=tech.full_name,
                    tickets_resolved=resolved_count,
                    tickets_assigned=assigned_count,
                    open_tickets=open_count,
                    resolution_rate=round(resolution_rate, 2),
                    avg_resolution_hours=round(avg_res_hours, 2)
                    if avg_res_hours
                    else None,
                    sla_compliance_rate=round(sla_compliance, 2),
                )
            )

        # Sort by tickets resolved (descending)
        rankings.sort(key=lambda x: x.tickets_resolved, reverse=True)

        # Assign ranks
        for i, r in enumerate(rankings):
            r.rank = i + 1

        top_performers = rankings[:limit]
        needs_attention = [
            r for r in rankings if r.sla_compliance_rate < 90 or r.resolution_rate < 50
        ][:limit]

        # Team averages
        team_avg_res = None
        team_sla = None

        if active_technicians > 0:
            avg_res_hours_list = [
                r.avg_resolution_hours for r in rankings if r.avg_resolution_hours
            ]
            if avg_res_hours_list:
                team_avg_res = sum(avg_res_hours_list) / len(avg_res_hours_list)

            sla_rates = [
                r.sla_compliance_rate
                for r in rankings
                if r.sla_compliance_rate is not None
            ]
            if sla_rates:
                team_sla = sum(sla_rates) / len(sla_rates)

        # Calculate workload distribution
        workload_distribution = await ReportingService._get_workload_distribution(
            db, technicians
        )

        return AgentPerformanceData(
            period_start=start_date,
            period_end=end_date,
            total_technicians=total_technicians,
            active_technicians=active_technicians,
            total_tickets_handled=total_tickets_handled,
            avg_tickets_per_technician=round(
                total_tickets_handled / active_technicians
                if active_technicians > 0
                else 0,
                2,
            ),
            team_avg_resolution_hours=round(team_avg_res, 2) if team_avg_res else None,
            team_sla_compliance_rate=round(team_sla, 2) if team_sla else None,
            top_performers=top_performers,
            needs_attention=needs_attention,
            workload_distribution=workload_distribution,
        )

    @staticmethod
    async def _get_workload_distribution(
        db: AsyncSession,
        technicians: List[User],
    ) -> List[WorkloadDistributionItem]:
        """Get current workload distribution across technicians."""
        # Get open status IDs
        open_status_ids = await ReportingQueryRepository.get_aging_buckets_by_status_ids(
            db, []
        )

        # Calculate today's time range
        today_start = datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        today_end = today_start + timedelta(days=1)

        workload_items = []
        for tech in technicians:
            # Get all workload metrics for this technician
            workload_metrics = await ReportingQueryRepository.get_workload_by_technician(
                db, tech.id, open_status_ids, today_start, today_end
            )

            if workload_metrics["open_count"] > 0:  # Only include techs with current workload
                workload_items.append(
                    WorkloadDistributionItem(
                        technician_id=tech.id,
                        technician_name=tech.username,
                        full_name=tech.full_name,
                        open_tickets=workload_metrics["open_count"],
                        overdue_tickets=workload_metrics["overdue_count"],
                        tickets_due_today=workload_metrics["due_today_count"],
                        tickets_assigned_today=workload_metrics["assigned_today_count"],
                    )
                )

        # Sort by open tickets descending
        workload_items.sort(key=lambda x: x.open_tickets, reverse=True)

        return workload_items
