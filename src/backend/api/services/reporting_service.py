"""
Reporting service for generating reports and aggregating metrics.
"""
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional

from sqlalchemy import select, func, and_, or_, case, extract
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import log_database_operation, safe_database_query
from db.models import (
    ServiceRequest,
    RequestStatus,
    Priority,
    Category,
    Subcategory,
    BusinessUnit,
    User,
    RequestAssignee,
)
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
        comp_start, comp_end = ReportingService.get_comparison_period(start_date, end_date)

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())
        comp_start_dt = datetime.combine(comp_start, datetime.min.time())
        comp_end_dt = datetime.combine(comp_end, datetime.max.time())

        # Build base filter conditions
        base_conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
        ]

        comp_conditions = [
            ServiceRequest.created_at >= comp_start_dt,
            ServiceRequest.created_at <= comp_end_dt,
        ]

        if filters:
            if filters.business_unit_ids:
                base_conditions.append(
                    ServiceRequest.business_unit_id.in_(filters.business_unit_ids)
                )
                comp_conditions.append(
                    ServiceRequest.business_unit_id.in_(filters.business_unit_ids)
                )

        # Get current period totals
        total_stmt = select(func.count(ServiceRequest.id)).where(and_(*base_conditions))
        total_result = await db.execute(total_stmt)
        total_tickets = total_result.scalar() or 0

        # Get comparison period totals
        comp_total_stmt = select(func.count(ServiceRequest.id)).where(and_(*comp_conditions))
        comp_total_result = await db.execute(comp_total_stmt)
        comp_total_tickets = comp_total_result.scalar() or 0

        # Get resolved tickets (status_id in [3, 5] or status.count_as_solved)
        resolved_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                ServiceRequest.resolved_at is not None,
            )
        )
        resolved_result = await db.execute(resolved_stmt)
        resolved_tickets = resolved_result.scalar() or 0

        comp_resolved_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *comp_conditions,
                ServiceRequest.resolved_at is not None,
            )
        )
        comp_resolved_result = await db.execute(comp_resolved_stmt)
        comp_resolved_tickets = comp_resolved_result.scalar() or 0

        # Get current open tickets (all time, not filtered by date)
        open_conditions = []
        if filters and filters.business_unit_ids:
            open_conditions.append(
                ServiceRequest.business_unit_id.in_(filters.business_unit_ids)
            )

        # Get statuses that are not resolved/closed
        status_stmt = select(RequestStatus.id).where(
            not RequestStatus.count_as_solved,
            RequestStatus.is_active,
        )
        status_result = await db.execute(status_stmt)
        open_status_ids = [r for r in status_result.scalars().all()]

        open_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status_id.in_(open_status_ids),
            *open_conditions,
        )
        open_result = await db.execute(open_stmt)
        open_tickets = open_result.scalar() or 0

        # SLA compliance
        sla_met_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                not ServiceRequest.sla_resolution_breached,
                ServiceRequest.resolved_at is not None,
            )
        )
        sla_met_result = await db.execute(sla_met_stmt)
        sla_met = sla_met_result.scalar() or 0

        sla_compliance = (sla_met / resolved_tickets * 100) if resolved_tickets > 0 else 100.0

        comp_sla_met_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *comp_conditions,
                not ServiceRequest.sla_resolution_breached,
                ServiceRequest.resolved_at is not None,
            )
        )
        comp_sla_met_result = await db.execute(comp_sla_met_stmt)
        comp_sla_met = comp_sla_met_result.scalar() or 0
        comp_sla_compliance = (
            (comp_sla_met / comp_resolved_tickets * 100)
            if comp_resolved_tickets > 0
            else 100.0
        )

        # Average resolution time (in hours)
        avg_resolution_stmt = select(
            func.avg(
                extract("epoch", ServiceRequest.resolved_at - ServiceRequest.created_at)
                / 3600
            )
        ).where(
            and_(
                *base_conditions,
                ServiceRequest.resolved_at is not None,
            )
        )
        avg_resolution_result = await db.execute(avg_resolution_stmt)
        avg_resolution_hours = avg_resolution_result.scalar() or 0

        comp_avg_resolution_stmt = select(
            func.avg(
                extract("epoch", ServiceRequest.resolved_at - ServiceRequest.created_at)
                / 3600
            )
        ).where(
            and_(
                *comp_conditions,
                ServiceRequest.resolved_at is not None,
            )
        )
        comp_avg_resolution_result = await db.execute(comp_avg_resolution_stmt)
        comp_avg_resolution_hours = comp_avg_resolution_result.scalar() or 0

        # Average first response time (in minutes)
        avg_frt_stmt = select(
            func.avg(
                extract(
                    "epoch", ServiceRequest.first_response_at - ServiceRequest.created_at
                )
                / 60
            )
        ).where(
            and_(
                *base_conditions,
                ServiceRequest.first_response_at is not None,
            )
        )
        avg_frt_result = await db.execute(avg_frt_stmt)
        avg_frt_minutes = avg_frt_result.scalar() or 0

        comp_avg_frt_stmt = select(
            func.avg(
                extract(
                    "epoch", ServiceRequest.first_response_at - ServiceRequest.created_at
                )
                / 60
            )
        ).where(
            and_(
                *comp_conditions,
                ServiceRequest.first_response_at is not None,
            )
        )
        comp_avg_frt_result = await db.execute(comp_avg_frt_stmt)
        comp_avg_frt_minutes = comp_avg_frt_result.scalar() or 0

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
                            TrendDirection.UP if higher_is_better else TrendDirection.DOWN
                        )
                    else:
                        trend_direction = (
                            TrendDirection.DOWN if higher_is_better else TrendDirection.UP
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
        stmt = (
            select(
                func.date(ServiceRequest.created_at).label("day"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(func.date(ServiceRequest.created_at))
            .order_by(func.date(ServiceRequest.created_at))
        )
        result = await db.execute(stmt)
        rows = result.all()

        return [
            TrendDataPoint(date=row.day, value=row.count)
            for row in rows
        ]

    @staticmethod
    async def _get_status_distribution(
        db: AsyncSession,
        base_conditions: list,
    ) -> List[DistributionItem]:
        """Get ticket distribution by status."""
        stmt = (
            select(
                RequestStatus.id,
                RequestStatus.name.label("name"),
                RequestStatus.color,
                func.count(ServiceRequest.id).label("count"),
            )
            .join(RequestStatus, ServiceRequest.status_id == RequestStatus.id)
            .where(and_(*base_conditions))
            .group_by(RequestStatus.id, RequestStatus.name, RequestStatus.color)
            .order_by(func.count(ServiceRequest.id).desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

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
        stmt = (
            select(
                Priority.id,
                Priority.name.label("name"),
                func.count(ServiceRequest.id).label("count"),
            )
            .join(Priority, ServiceRequest.priority_id == Priority.id)
            .where(and_(*base_conditions))
            .group_by(Priority.id, Priority.name)
            .order_by(Priority.id)
        )
        result = await db.execute(stmt)
        rows = result.all()

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
        stmt = (
            select(
                Category.id,
                Category.name_en.label("name"),
                func.count(ServiceRequest.id).label("count"),
            )
            .join(Subcategory, ServiceRequest.subcategory_id == Subcategory.id)
            .join(Category, Subcategory.category_id == Category.id)
            .where(and_(*base_conditions))
            .group_by(Category.id, Category.name_en)
            .order_by(func.count(ServiceRequest.id).desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

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
        stmt = (
            select(
                BusinessUnit.id,
                BusinessUnit.name.label("name"),
                func.count(ServiceRequest.id).label("count"),
            )
            .join(BusinessUnit, ServiceRequest.business_unit_id == BusinessUnit.id)
            .where(and_(*base_conditions))
            .group_by(BusinessUnit.id, BusinessUnit.name)
            .order_by(func.count(ServiceRequest.id).desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

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

            day_conditions = base_conditions + [
                ServiceRequest.resolved_at >= day_start,
                ServiceRequest.resolved_at <= day_end,
            ]

            # Total resolved on this day
            total_stmt = select(func.count(ServiceRequest.id)).where(
                and_(*day_conditions)
            )
            total_result = await db.execute(total_stmt)
            total = total_result.scalar() or 0

            # SLA met on this day
            met_stmt = select(func.count(ServiceRequest.id)).where(
                and_(
                    *day_conditions,
                    not ServiceRequest.sla_resolution_breached,
                )
            )
            met_result = await db.execute(met_stmt)
            met = met_result.scalar() or 0

            compliance_rate = (met / total * 100) if total > 0 else 0

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
        stmt = (
            select(
                Priority.id,
                Priority.name,
                func.count(ServiceRequest.id).label("total"),
                func.sum(
                    case(
                        (not ServiceRequest.sla_resolution_breached, 1),
                        else_=0
                    )
                ).label("met"),
            )
            .join(Priority, ServiceRequest.priority_id == Priority.id)
            .where(
                and_(
                    *base_conditions,
                    ServiceRequest.resolved_at is not None,
                )
            )
            .group_by(Priority.id, Priority.name)
            .order_by(Priority.id)
        )
        result = await db.execute(stmt)
        rows = result.all()

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
                percentage=round((row.met / row.total * 100) if row.total > 0 else 0, 1),
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
        # Get open tickets
        status_stmt = select(RequestStatus.id).where(
            not RequestStatus.count_as_solved,
            RequestStatus.is_active,
        )
        status_result = await db.execute(status_stmt)
        open_status_ids = [r for r in status_result.scalars().all()]

        aging_conditions = base_conditions + [
            ServiceRequest.status_id.in_(open_status_ids),
            ServiceRequest.due_date is not None,
        ]

        now = datetime.utcnow()

        # Define aging buckets based on time remaining
        buckets = [
            ("overdue", "Overdue", None, now),  # Past due date
            ("critical", "< 2 hours", now, now + timedelta(hours=2)),
            ("warning", "2-8 hours", now + timedelta(hours=2), now + timedelta(hours=8)),
            ("normal", "8-24 hours", now + timedelta(hours=8), now + timedelta(hours=24)),
            ("healthy", "> 24 hours", now + timedelta(hours=24), None),
        ]

        # First, get total count for percentage calculation
        total_stmt = select(func.count(ServiceRequest.id)).where(and_(*aging_conditions))
        total_result = await db.execute(total_stmt)
        total_count = total_result.scalar() or 0

        aging_data = []
        for bucket_id, label, range_start, range_end in buckets:
            if range_start is None:
                # Overdue
                bucket_stmt = select(ServiceRequest.id, ServiceRequest.created_at).where(
                    and_(
                        *aging_conditions,
                        ServiceRequest.due_date < range_end,
                    )
                )
            elif range_end is None:
                # Healthy
                bucket_stmt = select(ServiceRequest.id, ServiceRequest.created_at).where(
                    and_(
                        *aging_conditions,
                        ServiceRequest.due_date >= range_start,
                    )
                )
            else:
                # Middle ranges
                bucket_stmt = select(ServiceRequest.id, ServiceRequest.created_at).where(
                    and_(
                        *aging_conditions,
                        ServiceRequest.due_date >= range_start,
                        ServiceRequest.due_date < range_end,
                    )
                )

            bucket_result = await db.execute(bucket_stmt)
            tickets = bucket_result.all()
            count = len(tickets)

            # Calculate average age in hours
            if count > 0:
                total_age_seconds = sum((now - ticket.created_at).total_seconds() for ticket in tickets)
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
        total_stmt = select(func.count(ServiceRequest.id)).where(and_(*base_conditions))
        total_result = await db.execute(total_stmt)
        total_tickets = total_result.scalar() or 0

        # Tickets with SLA (those that have been resolved or have due dates)
        sla_conditions = base_conditions + [
            or_(
                ServiceRequest.resolved_at is not None,
                ServiceRequest.due_date is not None,
            )
        ]
        sla_stmt = select(func.count(ServiceRequest.id)).where(and_(*sla_conditions))
        sla_result = await db.execute(sla_stmt)
        tickets_with_sla = sla_result.scalar() or 0

        # First response SLA
        frt_met_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                ServiceRequest.first_response_at is not None,
                not ServiceRequest.sla_first_response_breached,
            )
        )
        frt_met_result = await db.execute(frt_met_stmt)
        frt_met = frt_met_result.scalar() or 0

        frt_breached_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                ServiceRequest.sla_first_response_breached,
            )
        )
        frt_breached_result = await db.execute(frt_breached_stmt)
        frt_breached = frt_breached_result.scalar() or 0

        frt_total = frt_met + frt_breached
        frt_compliance = (frt_met / frt_total * 100) if frt_total > 0 else 100.0

        # Resolution SLA
        res_met_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                ServiceRequest.resolved_at is not None,
                not ServiceRequest.sla_resolution_breached,
            )
        )
        res_met_result = await db.execute(res_met_stmt)
        res_met = res_met_result.scalar() or 0

        res_breached_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                ServiceRequest.sla_resolution_breached,
            )
        )
        res_breached_result = await db.execute(res_breached_stmt)
        res_breached = res_breached_result.scalar() or 0

        res_total = res_met + res_breached
        res_compliance = (res_met / res_total * 100) if res_total > 0 else 100.0

        # Overall compliance
        total_sla_checks = frt_total + res_total
        total_met = frt_met + res_met
        overall_compliance = (
            (total_met / total_sla_checks * 100) if total_sla_checks > 0 else 100.0
        )

        # Average times
        avg_frt_stmt = select(
            func.avg(
                extract(
                    "epoch", ServiceRequest.first_response_at - ServiceRequest.created_at
                )
                / 60
            )
        ).where(
            and_(
                *base_conditions,
                ServiceRequest.first_response_at is not None,
            )
        )
        avg_frt_result = await db.execute(avg_frt_stmt)
        avg_frt = avg_frt_result.scalar()

        avg_res_stmt = select(
            func.avg(
                extract("epoch", ServiceRequest.resolved_at - ServiceRequest.created_at)
                / 3600
            )
        ).where(
            and_(
                *base_conditions,
                ServiceRequest.resolved_at is not None,
            )
        )
        avg_res_result = await db.execute(avg_res_stmt)
        avg_res = avg_res_result.scalar()

        # Get compliance trend
        compliance_trend = await ReportingService._get_sla_compliance_trend(
            db, start_date, end_date, base_conditions
        )

        # Get compliance by priority
        compliance_by_priority = await ReportingService._get_compliance_by_priority(
            db, base_conditions
        )

        # Get aging buckets
        aging_buckets = await ReportingService._get_aging_buckets(
            db, base_conditions
        )

        # Recent breaches (last 10)
        breaches_stmt = (
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.status),
            )
            .where(
                and_(
                    *base_conditions,
                    or_(
                        ServiceRequest.sla_first_response_breached,
                        ServiceRequest.sla_resolution_breached,
                    ),
                )
            )
            .order_by(ServiceRequest.created_at.desc())
            .limit(10)
        )
        breaches_result = await db.execute(breaches_stmt)
        breach_requests = breaches_result.scalars().all()

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
        created_stmt = select(func.count(ServiceRequest.id)).where(
            and_(*base_conditions)
        )
        created_result = await db.execute(created_stmt)
        total_created = created_result.scalar() or 0

        # Total resolved in period
        resolved_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                ServiceRequest.resolved_at >= start_dt,
                ServiceRequest.resolved_at <= end_dt,
            )
        )
        resolved_result = await db.execute(resolved_stmt)
        total_resolved = resolved_result.scalar() or 0

        # Total closed in period
        closed_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                ServiceRequest.closed_at >= start_dt,
                ServiceRequest.closed_at <= end_dt,
            )
        )
        closed_result = await db.execute(closed_stmt)
        total_closed = closed_result.scalar() or 0

        # Total reopened
        reopened_stmt = select(func.sum(ServiceRequest.reopen_count)).where(
            and_(*base_conditions)
        )
        reopened_result = await db.execute(reopened_stmt)
        total_reopened = reopened_result.scalar() or 0

        # Current backlog (open tickets)
        status_stmt = select(RequestStatus.id).where(
            not RequestStatus.count_as_solved,
            RequestStatus.is_active,
        )
        status_result = await db.execute(status_stmt)
        open_status_ids = [r for r in status_result.scalars().all()]

        backlog_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status_id.in_(open_status_ids)
        )
        backlog_result = await db.execute(backlog_stmt)
        current_backlog = backlog_result.scalar() or 0

        # Calculate averages
        days_in_period = (end_date - start_date).days + 1
        avg_per_day = total_created / days_in_period if days_in_period > 0 else 0

        # Peak day
        peak_stmt = (
            select(
                func.date(ServiceRequest.created_at).label("day"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(func.date(ServiceRequest.created_at))
            .order_by(func.count(ServiceRequest.id).desc())
            .limit(1)
        )
        peak_result = await db.execute(peak_stmt)
        peak_row = peak_result.first()
        peak_day = peak_row.day if peak_row else None
        peak_count = peak_row.count if peak_row else 0

        # Volume trend
        trend_stmt = (
            select(
                func.date(ServiceRequest.created_at).label("day"),
                func.count(ServiceRequest.id).label("created"),
            )
            .where(and_(*base_conditions))
            .group_by(func.date(ServiceRequest.created_at))
            .order_by(func.date(ServiceRequest.created_at))
        )
        trend_result = await db.execute(trend_stmt)
        trend_rows = trend_result.all()

        volume_trend = []
        for row in trend_rows:
            # Get resolved count for this day
            resolved_day_stmt = select(func.count(ServiceRequest.id)).where(
                func.date(ServiceRequest.resolved_at) == row.day
            )
            resolved_day_result = await db.execute(resolved_day_stmt)
            resolved_count = resolved_day_result.scalar() or 0

            closed_day_stmt = select(func.count(ServiceRequest.id)).where(
                func.date(ServiceRequest.closed_at) == row.day
            )
            closed_day_result = await db.execute(closed_day_stmt)
            closed_count = closed_day_result.scalar() or 0

            volume_trend.append(
                VolumeTrendItem(
                    date=row.day,
                    created_count=row.created,
                    resolved_count=resolved_count,
                    closed_count=closed_count,
                    net_change=row.created - resolved_count,
                )
            )

        # Hourly distribution
        hourly_stmt = (
            select(
                extract("hour", ServiceRequest.created_at).label("hour"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(extract("hour", ServiceRequest.created_at))
            .order_by(extract("hour", ServiceRequest.created_at))
        )
        hourly_result = await db.execute(hourly_stmt)
        hourly_rows = hourly_result.all()

        hourly_total = sum(r.count for r in hourly_rows)
        hourly_distribution = [
            DistributionItem(
                id=f"hour_{int(r.hour)}",
                label=f"{int(r.hour):02d}:00",
                value=r.count,
                percentage=round((r.count / hourly_total * 100) if hourly_total > 0 else 0, 1),
            )
            for r in hourly_rows
        ]

        # Day of week distribution
        dow_stmt = (
            select(
                extract("dow", ServiceRequest.created_at).label("dow"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(extract("dow", ServiceRequest.created_at))
            .order_by(extract("dow", ServiceRequest.created_at))
        )
        dow_result = await db.execute(dow_stmt)
        dow_rows = dow_result.all()

        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        dow_total = sum(r.count for r in dow_rows)
        day_of_week_distribution = [
            DistributionItem(
                id=f"dow_{int(r.dow)}",
                label=day_names[int(r.dow)],
                value=r.count,
                percentage=round((r.count / dow_total * 100) if dow_total > 0 else 0, 1),
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

        for tech in technicians:
            # Get assignments in period
            assigned_stmt = select(func.count(RequestAssignee.id)).where(
                RequestAssignee.assignee_id == tech.id,
                RequestAssignee.created_at >= start_dt,
                RequestAssignee.created_at <= end_dt,
            )
            assigned_result = await db.execute(assigned_stmt)
            assigned_count = assigned_result.scalar() or 0

            # Get resolved count
            resolved_stmt = select(func.count(ServiceRequest.id)).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.resolved_at >= start_dt,
                ServiceRequest.resolved_at <= end_dt,
            )
            resolved_result = await db.execute(resolved_stmt)
            resolved_count = resolved_result.scalar() or 0

            # Current open tickets
            status_stmt = select(RequestStatus.id).where(
                not RequestStatus.count_as_solved,
                RequestStatus.is_active,
            )
            status_result = await db.execute(status_stmt)
            open_status_ids = [r for r in status_result.scalars().all()]

            open_stmt = select(func.count(ServiceRequest.id)).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.status_id.in_(open_status_ids),
            )
            open_result = await db.execute(open_stmt)
            open_count = open_result.scalar() or 0

            if assigned_count > 0 or resolved_count > 0:
                active_technicians += 1
                total_tickets_handled += resolved_count

            resolution_rate = (
                (resolved_count / assigned_count * 100) if assigned_count > 0 else 0
            )

            # Average resolution time for this tech
            avg_res_stmt = select(
                func.avg(
                    extract(
                        "epoch", ServiceRequest.resolved_at - ServiceRequest.created_at
                    )
                    / 3600
                )
            ).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.resolved_at >= start_dt,
                ServiceRequest.resolved_at <= end_dt,
            )
            avg_res_result = await db.execute(avg_res_stmt)
            avg_res_hours = avg_res_result.scalar()

            # SLA compliance for this tech
            sla_met_stmt = select(func.count(ServiceRequest.id)).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.resolved_at >= start_dt,
                ServiceRequest.resolved_at <= end_dt,
                not ServiceRequest.sla_resolution_breached,
            )
            sla_met_result = await db.execute(sla_met_stmt)
            sla_met = sla_met_result.scalar() or 0

            sla_compliance = (sla_met / resolved_count * 100) if resolved_count > 0 else 100.0

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
                    avg_resolution_hours=round(avg_res_hours, 2) if avg_res_hours else None,
                    sla_compliance_rate=round(sla_compliance, 2),
                )
            )

        # Sort by tickets resolved (descending)
        rankings.sort(key=lambda x: x.tickets_resolved, reverse=True)

        # Assign ranks
        for i, r in enumerate(rankings):
            r.rank = i + 1

        top_performers = rankings[:limit]
        needs_attention = [r for r in rankings if r.sla_compliance_rate < 90 or r.resolution_rate < 50][:limit]

        # Team averages
        team_avg_res = None
        team_sla = None

        if active_technicians > 0:
            avg_res_hours_list = [r.avg_resolution_hours for r in rankings if r.avg_resolution_hours]
            if avg_res_hours_list:
                team_avg_res = sum(avg_res_hours_list) / len(avg_res_hours_list)

            sla_rates = [r.sla_compliance_rate for r in rankings if r.sla_compliance_rate is not None]
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
                total_tickets_handled / active_technicians if active_technicians > 0 else 0, 2
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
        status_stmt = select(RequestStatus.id).where(
            not RequestStatus.count_as_solved,
            RequestStatus.is_active,
        )
        status_result = await db.execute(status_stmt)
        open_status_ids = [r for r in status_result.scalars().all()]

        workload_items = []
        for tech in technicians:
            # Get current open tickets count
            open_stmt = select(func.count(ServiceRequest.id)).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.status_id.in_(open_status_ids),
            )
            open_result = await db.execute(open_stmt)
            open_count = open_result.scalar() or 0

            # Get overdue count (past due date)
            overdue_stmt = select(func.count(ServiceRequest.id)).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.status_id.in_(open_status_ids),
                ServiceRequest.due_date is not None,
                ServiceRequest.due_date < datetime.utcnow(),
            )
            overdue_result = await db.execute(overdue_stmt)
            overdue_count = overdue_result.scalar() or 0

            # Get tickets due today
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = today_start + timedelta(days=1)

            due_today_stmt = select(func.count(ServiceRequest.id)).where(
                ServiceRequest.id.in_(
                    select(RequestAssignee.request_id).where(
                        RequestAssignee.assignee_id == tech.id
                    )
                ),
                ServiceRequest.status_id.in_(open_status_ids),
                ServiceRequest.due_date is not None,
                ServiceRequest.due_date >= today_start,
                ServiceRequest.due_date < today_end,
            )
            due_today_result = await db.execute(due_today_stmt)
            due_today_count = due_today_result.scalar() or 0

            # Get tickets assigned today
            assigned_today_stmt = select(func.count(RequestAssignee.id)).where(
                RequestAssignee.assignee_id == tech.id,
                RequestAssignee.created_at >= today_start,
                RequestAssignee.created_at < today_end,
            )
            assigned_today_result = await db.execute(assigned_today_stmt)
            assigned_today_count = assigned_today_result.scalar() or 0

            if open_count > 0:  # Only include techs with current workload
                workload_items.append(
                    WorkloadDistributionItem(
                        technician_id=tech.id,
                        technician_name=tech.username,
                        full_name=tech.full_name,
                        open_tickets=open_count,
                        overdue_tickets=overdue_count,
                        tickets_due_today=due_today_count,
                        tickets_assigned_today=assigned_today_count,
                    )
                )

        # Sort by open tickets descending
        workload_items.sort(key=lambda x: x.open_tickets, reverse=True)

        return workload_items
