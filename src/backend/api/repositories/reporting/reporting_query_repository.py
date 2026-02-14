"""
Reporting Query Repository - Cross-entity read-only queries for reporting.

Extracted from api/services/reporting_service.py.
All methods return aggregated data (dicts, lists of dicts, tuples), not model instances.
Does NOT inherit from BaseRepository as it queries across multiple models.
"""

import logging
from datetime import datetime, date
from typing import List

from sqlalchemy import select, func, and_, or_, case, extract
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    ServiceRequest,
    RequestStatus,
    Priority,
    Category,
    Subcategory,
    BusinessUnit,
    RequestAssignee,
)

logger = logging.getLogger(__name__)


class ReportingQueryRepository:
    """Read-only cross-entity queries for reporting."""

    @classmethod
    async def get_volume_trend(
        cls,
        db: AsyncSession,
        start_date: date,
        end_date: date,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get daily ticket volume trend.

        Returns list of tuples: (day, count)
        """
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
        return result.all()

    @classmethod
    async def get_status_distribution(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get ticket distribution by status.

        Returns list of tuples: (id, name, color, count)
        """
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
        return result.all()

    @classmethod
    async def get_priority_distribution(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get ticket distribution by priority.

        Returns list of tuples: (id, name, count)
        """
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
        return result.all()

    @classmethod
    async def get_category_distribution(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get ticket distribution by category.

        Returns list of tuples: (id, name, count)
        """
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
        return result.all()

    @classmethod
    async def get_business_unit_distribution(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get ticket distribution by business unit.

        Returns list of tuples: (id, name, count)
        """
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
        return result.all()

    @classmethod
    async def get_compliance_by_priority(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get SLA compliance breakdown by priority.

        Returns list of tuples: (id, name, total, met)
        """
        stmt = (
            select(
                Priority.id,
                Priority.name,
                func.count(ServiceRequest.id).label("total"),
                func.sum(
                    case((not ServiceRequest.sla_resolution_breached, 1), else_=0)
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
        return result.all()

    @classmethod
    async def get_aging_buckets_by_status_ids(
        cls,
        db: AsyncSession,
        open_status_ids: list,
    ) -> List[int]:
        """
        Get open status IDs for aging bucket calculations.

        Returns list of status IDs.
        """
        stmt = select(RequestStatus.id).where(
            not RequestStatus.count_as_solved,
            RequestStatus.is_active,
        )
        result = await db.execute(stmt)
        return [r for r in result.scalars().all()]

    @classmethod
    async def get_aging_bucket_tickets(
        cls,
        db: AsyncSession,
        base_conditions: list,
        range_start: datetime = None,
        range_end: datetime = None,
    ) -> List[tuple]:
        """
        Get tickets for aging bucket calculation.

        Returns list of tuples: (id, created_at)

        Args:
            db: Database session
            base_conditions: Base filter conditions
            range_start: Start datetime for bucket range (exclusive for first bucket)
            range_end: End datetime for bucket range (exclusive)
        """
        if range_start is None:
            # Overdue
            stmt = select(ServiceRequest.id, ServiceRequest.created_at).where(
                and_(
                    *base_conditions,
                    ServiceRequest.due_date < range_end,
                )
            )
        elif range_end is None:
            # Healthy
            stmt = select(ServiceRequest.id, ServiceRequest.created_at).where(
                and_(
                    *base_conditions,
                    ServiceRequest.due_date >= range_start,
                )
            )
        else:
            # Middle ranges
            stmt = select(ServiceRequest.id, ServiceRequest.created_at).where(
                and_(
                    *base_conditions,
                    ServiceRequest.due_date >= range_start,
                    ServiceRequest.due_date < range_end,
                )
            )

        result = await db.execute(stmt)
        return result.all()

    @classmethod
    async def get_sla_breached_requests(
        cls,
        db: AsyncSession,
        base_conditions: list,
        limit: int = 10,
    ) -> List[ServiceRequest]:
        """
        Get recent SLA breached requests.

        Returns list of ServiceRequest model instances with relationships loaded.

        Args:
            db: Database session
            base_conditions: Base filter conditions
            limit: Maximum number of records to return
        """
        from sqlalchemy.orm import selectinload

        stmt = (
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
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_workload_by_technician(
        cls,
        db: AsyncSession,
        technician_id: int,
        open_status_ids: list,
        today_start: datetime,
        today_end: datetime,
    ) -> dict:
        """
        Get workload metrics for a single technician.

        Returns dict with: open_count, overdue_count, due_today_count, assigned_today_count

        Args:
            db: Database session
            technician_id: User ID of technician
            open_status_ids: List of open status IDs
            today_start: Start of today datetime
            today_end: End of today datetime
        """
        result = {}

        # Get current open tickets count
        open_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.status_id.in_(open_status_ids),
        )
        open_result = await db.execute(open_stmt)
        result["open_count"] = open_result.scalar() or 0

        # Get overdue count (past due date)
        overdue_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.status_id.in_(open_status_ids),
            ServiceRequest.due_date is not None,
            ServiceRequest.due_date < datetime.utcnow(),
        )
        overdue_result = await db.execute(overdue_stmt)
        result["overdue_count"] = overdue_result.scalar() or 0

        # Get tickets due today
        due_today_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.status_id.in_(open_status_ids),
            ServiceRequest.due_date is not None,
            ServiceRequest.due_date >= today_start,
            ServiceRequest.due_date < today_end,
        )
        due_today_result = await db.execute(due_today_stmt)
        result["due_today_count"] = due_today_result.scalar() or 0

        # Get tickets assigned today
        assigned_today_stmt = select(func.count(RequestAssignee.id)).where(
            RequestAssignee.assignee_id == technician_id,
            RequestAssignee.created_at >= today_start,
            RequestAssignee.created_at < today_end,
        )
        assigned_today_result = await db.execute(assigned_today_stmt)
        result["assigned_today_count"] = assigned_today_result.scalar() or 0

        return result

    @classmethod
    async def get_technician_assignments(
        cls,
        db: AsyncSession,
        technician_id: int,
        start_dt: datetime,
        end_dt: datetime,
    ) -> int:
        """
        Get count of assignments for a technician in date range.

        Returns count of assignments.
        """
        stmt = select(func.count(RequestAssignee.id)).where(
            RequestAssignee.assignee_id == technician_id,
            RequestAssignee.created_at >= start_dt,
            RequestAssignee.created_at <= end_dt,
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_technician_resolved_tickets(
        cls,
        db: AsyncSession,
        technician_id: int,
        start_dt: datetime,
        end_dt: datetime,
    ) -> int:
        """
        Get count of resolved tickets for a technician in date range.

        Returns count of resolved tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.resolved_at >= start_dt,
            ServiceRequest.resolved_at <= end_dt,
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_technician_open_tickets(
        cls,
        db: AsyncSession,
        technician_id: int,
        open_status_ids: list,
    ) -> int:
        """
        Get count of open tickets for a technician.

        Returns count of open tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.status_id.in_(open_status_ids),
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_technician_avg_resolution_time(
        cls,
        db: AsyncSession,
        technician_id: int,
        start_dt: datetime,
        end_dt: datetime,
    ) -> float:
        """
        Get average resolution time for a technician in date range (in hours).

        Returns average resolution time in hours.
        """
        stmt = select(
            func.avg(
                extract("epoch", ServiceRequest.resolved_at - ServiceRequest.created_at)
                / 3600
            )
        ).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.resolved_at >= start_dt,
            ServiceRequest.resolved_at <= end_dt,
        )
        result = await db.execute(stmt)
        return result.scalar()

    @classmethod
    async def get_technician_sla_met_count(
        cls,
        db: AsyncSession,
        technician_id: int,
        start_dt: datetime,
        end_dt: datetime,
    ) -> int:
        """
        Get count of SLA-met tickets for a technician in date range.

        Returns count of SLA-met tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.id.in_(
                select(RequestAssignee.request_id).where(
                    RequestAssignee.assignee_id == technician_id
                )
            ),
            ServiceRequest.resolved_at >= start_dt,
            ServiceRequest.resolved_at <= end_dt,
            not ServiceRequest.sla_resolution_breached,
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_open_tickets_count(
        cls,
        db: AsyncSession,
        open_status_ids: list,
        extra_conditions: list = None,
    ) -> int:
        """
        Get count of open tickets with optional extra conditions.

        Returns count of open tickets.
        """
        conditions = [ServiceRequest.status_id.in_(open_status_ids)]
        if extra_conditions:
            conditions.extend(extra_conditions)

        stmt = select(func.count(ServiceRequest.id)).where(and_(*conditions))
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_backlog_count(
        cls,
        db: AsyncSession,
        open_status_ids: list,
    ) -> int:
        """
        Get current backlog (open tickets count).

        Returns count of open tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status_id.in_(open_status_ids)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_peak_day(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> tuple:
        """
        Get the peak day (day with most tickets created).

        Returns tuple: (day, count) or (None, 0) if no data.
        """
        stmt = (
            select(
                func.date(ServiceRequest.created_at).label("day"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(func.date(ServiceRequest.created_at))
            .order_by(func.count(ServiceRequest.id).desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.first()
        return (row.day, row.count) if row else (None, 0)

    @classmethod
    async def get_volume_trend_with_resolved_closed(
        cls,
        db: AsyncSession,
        base_conditions: list,
        start_date: date,
        end_date: date,
    ) -> List[dict]:
        """
        Get volume trend with resolved and closed counts per day.

        Returns list of dicts with day, created, resolved_count, closed_count.
        """
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
                {
                    "day": row.day,
                    "created": row.created,
                    "resolved_count": resolved_count,
                    "closed_count": closed_count,
                }
            )

        return volume_trend

    @classmethod
    async def get_hourly_distribution(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get ticket distribution by hour of day.

        Returns list of tuples: (hour, count)
        """
        stmt = (
            select(
                extract("hour", ServiceRequest.created_at).label("hour"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(extract("hour", ServiceRequest.created_at))
            .order_by(extract("hour", ServiceRequest.created_at))
        )
        result = await db.execute(stmt)
        return result.all()

    @classmethod
    async def get_day_of_week_distribution(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> List[tuple]:
        """
        Get ticket distribution by day of week.

        Returns list of tuples: (dow, count)
        """
        stmt = (
            select(
                extract("dow", ServiceRequest.created_at).label("dow"),
                func.count(ServiceRequest.id).label("count"),
            )
            .where(and_(*base_conditions))
            .group_by(extract("dow", ServiceRequest.created_at))
            .order_by(extract("dow", ServiceRequest.created_at))
        )
        result = await db.execute(stmt)
        return result.all()

    @classmethod
    async def get_daily_compliance_rate(
        cls,
        db: AsyncSession,
        day_start: datetime,
        day_end: datetime,
    ) -> float:
        """
        Get SLA compliance rate for a specific day.

        Returns compliance rate percentage.
        """
        total_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.resolved_at >= day_start,
            ServiceRequest.resolved_at <= day_end,
        )
        total_result = await db.execute(total_stmt)
        total = total_result.scalar() or 0

        if total == 0:
            return 0.0

        met_stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                ServiceRequest.resolved_at >= day_start,
                ServiceRequest.resolved_at <= day_end,
                not ServiceRequest.sla_resolution_breached,
            )
        )
        met_result = await db.execute(met_stmt)
        met = met_result.scalar() or 0

        return met / total * 100

    @classmethod
    async def get_resolved_count_in_period(
        cls,
        db: AsyncSession,
        start_dt: datetime,
        end_dt: datetime,
    ) -> int:
        """
        Get count of resolved tickets in a time period.

        Returns count of resolved tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.resolved_at >= start_dt,
            ServiceRequest.resolved_at <= end_dt,
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_closed_count_in_period(
        cls,
        db: AsyncSession,
        start_dt: datetime,
        end_dt: datetime,
    ) -> int:
        """
        Get count of closed tickets in a time period.

        Returns count of closed tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.closed_at >= start_dt,
            ServiceRequest.closed_at <= end_dt,
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_reopened_sum(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> int:
        """
        Get sum of reopen counts.

        Returns total reopen count.
        """
        stmt = select(func.sum(ServiceRequest.reopen_count)).where(
            and_(*base_conditions)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_total_tickets_count(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> int:
        """
        Get total count of tickets.

        Returns count of tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(and_(*base_conditions))
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_resolved_tickets_count(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> int:
        """
        Get count of resolved tickets.

        Returns count of resolved tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                ServiceRequest.resolved_at is not None,
            )
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_sla_met_count(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> int:
        """
        Get count of SLA-met tickets.

        Returns count of SLA-met tickets.
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            and_(
                *base_conditions,
                not ServiceRequest.sla_resolution_breached,
                ServiceRequest.resolved_at is not None,
            )
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_sla_breached_count(
        cls,
        db: AsyncSession,
        base_conditions: list,
        breached_field: str = "sla_resolution_breached",
    ) -> int:
        """
        Get count of SLA-breached tickets.

        Returns count of SLA-breached tickets.

        Args:
            db: Database session
            base_conditions: Base filter conditions
            breached_field: Field to check for breach (default: sla_resolution_breached)
        """
        condition = getattr(ServiceRequest, breached_field)
        stmt = select(func.count(ServiceRequest.id)).where(
            and_(*base_conditions, condition)
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_avg_resolution_time(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> float:
        """
        Get average resolution time in hours.

        Returns average resolution time in hours.
        """
        stmt = select(
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
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_avg_first_response_time(
        cls,
        db: AsyncSession,
        base_conditions: list,
    ) -> float:
        """
        Get average first response time in minutes.

        Returns average first response time in minutes.
        """
        stmt = select(
            func.avg(
                extract(
                    "epoch",
                    ServiceRequest.first_response_at - ServiceRequest.created_at,
                )
                / 60
            )
        ).where(
            and_(
                *base_conditions,
                ServiceRequest.first_response_at is not None,
            )
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    @classmethod
    async def get_ticket_counts_by_period(
        cls,
        db: AsyncSession,
        start_dt: datetime,
        end_dt: datetime,
        business_unit_ids: list = None,
    ) -> tuple[int, int]:
        """
        Get total and resolved ticket counts for a period.

        Returns tuple: (total_tickets, resolved_tickets)
        """
        conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
        ]
        if business_unit_ids:
            conditions.append(ServiceRequest.business_unit_id.in_(business_unit_ids))

        # Total tickets
        total_stmt = select(func.count(ServiceRequest.id)).where(and_(*conditions))
        total_result = await db.execute(total_stmt)
        total_tickets = total_result.scalar() or 0

        # Resolved tickets
        resolved_conditions = conditions + [ServiceRequest.resolved_at.isnot(None)]
        resolved_stmt = select(func.count(ServiceRequest.id)).where(
            and_(*resolved_conditions)
        )
        resolved_result = await db.execute(resolved_stmt)
        resolved_tickets = resolved_result.scalar() or 0

        return total_tickets, resolved_tickets

    @classmethod
    async def get_sla_compliance(
        cls,
        db: AsyncSession,
        start_dt: datetime,
        end_dt: datetime,
        business_unit_ids: list = None,
    ) -> tuple[float, int]:
        """
        Get SLA compliance rate and met count for a period.

        Returns tuple: (compliance_percentage, sla_met_count)
        """
        conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
            ServiceRequest.resolved_at.isnot(None),
        ]
        if business_unit_ids:
            conditions.append(ServiceRequest.business_unit_id.in_(business_unit_ids))

        # Total resolved
        total_stmt = select(func.count(ServiceRequest.id)).where(and_(*conditions))
        total_result = await db.execute(total_stmt)
        total = total_result.scalar() or 0

        if total == 0:
            return 100.0, 0

        # SLA met
        met_conditions = conditions + [~ServiceRequest.sla_resolution_breached]
        met_stmt = select(func.count(ServiceRequest.id)).where(and_(*met_conditions))
        met_result = await db.execute(met_stmt)
        sla_met = met_result.scalar() or 0

        compliance = (sla_met / total * 100) if total > 0 else 100.0
        return compliance, sla_met

    @classmethod
    async def get_average_resolution_time(
        cls,
        db: AsyncSession,
        start_dt: datetime,
        end_dt: datetime,
        business_unit_ids: list = None,
    ) -> float:
        """
        Get average resolution time in hours for a period.

        Returns average resolution time in hours.
        """
        conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
            ServiceRequest.resolved_at.isnot(None),
        ]
        if business_unit_ids:
            conditions.append(ServiceRequest.business_unit_id.in_(business_unit_ids))

        stmt = select(
            func.avg(
                extract("epoch", ServiceRequest.resolved_at - ServiceRequest.created_at)
                / 3600
            )
        ).where(and_(*conditions))
        result = await db.execute(stmt)
        return result.scalar() or 0.0

    @classmethod
    async def get_average_first_response_time(
        cls,
        db: AsyncSession,
        start_dt: datetime,
        end_dt: datetime,
        business_unit_ids: list = None,
    ) -> float:
        """
        Get average first response time in minutes for a period.

        Returns average first response time in minutes.
        """
        conditions = [
            ServiceRequest.created_at >= start_dt,
            ServiceRequest.created_at <= end_dt,
            ServiceRequest.first_response_at.isnot(None),
        ]
        if business_unit_ids:
            conditions.append(ServiceRequest.business_unit_id.in_(business_unit_ids))

        stmt = select(
            func.avg(
                extract(
                    "epoch",
                    ServiceRequest.first_response_at - ServiceRequest.created_at,
                )
                / 60
            )
        ).where(and_(*conditions))
        result = await db.execute(stmt)
        return result.scalar() or 0.0
