"""
Outshift Reporting Service - Compliance-grade outshift report generation.

Definitions (LOCKED):
- Outshift = any activity outside BusinessUnit.working_hours
- Activity = User sessions + ticket-related work combined
- Multi-BU agents = metrics calculated independently per Business Unit
- Timezone = Cairo (existing backend configuration)

Edge Cases:
1. BU has no working_hours → treat all activity as in-shift
2. Agent has no BU assignment → exclude entirely
3. Activity crossing shift boundary → split precisely at boundary
4. Overlapping sessions → deterministically deduplicated
5. No activity → return empty but valid report object
"""

import logging
from datetime import datetime, date, timedelta, time
from typing import List, Optional, Dict, Tuple, Set
from uuid import UUID

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import log_database_operation, safe_database_query
from models.database_models import (
    User,
    WebSession,
    BusinessUnit,
    TechnicianBusinessUnit,
    ServiceRequest,
    RequestAssignee,
    ChatMessage,
)
from schemas.reports import (
    ReportFilters,
    ActivityType,
    ShiftClassification,
    OutshiftActivitySegment,
    OutshiftAgentBUMetrics,
    OutshiftAgentReport,
    OutshiftAgentSummary,
    OutshiftGlobalReport,
)
from services.shift_evaluator import ShiftEvaluator
from services.reporting_service import ReportingService

logger = logging.getLogger(__name__)


class OutshiftReportingService:
    """
    Service for generating compliance-grade outshift reports.

    All calculations are deterministic for identical inputs.
    Uses ShiftEvaluator as single source of truth for shift classification.
    """

    # =========================================================================
    # Public Methods
    # =========================================================================

    @staticmethod
    @safe_database_query("get_agent_outshift_report", default_return=None)
    @log_database_operation("agent outshift report generation", level="info")
    async def get_agent_outshift_report(
        db: AsyncSession,
        agent_id: UUID,
        filters: Optional[ReportFilters] = None,
    ) -> Optional[OutshiftAgentReport]:
        """
        Generate outshift report for a single agent.

        Args:
            db: Database session
            agent_id: UUID of the agent
            filters: Optional filters including date range

        Returns:
            OutshiftAgentReport or None if agent not found
        """
        # Resolve date range
        start_date, end_date = ReportingService.resolve_date_range(
            filters.date_range if filters else None
        )
        start_dt = datetime.combine(start_date, time.min)
        end_dt = datetime.combine(end_date, time.max)

        # Get agent with BU assignments
        agent_stmt = (
            select(User)
            .where(User.id == agent_id)
            .options(selectinload(User.business_unit_assigns))
        )
        agent_result = await db.execute(agent_stmt)
        agent = agent_result.scalar_one_or_none()

        if not agent:
            logger.warning(f"Agent not found: {agent_id}")
            return None

        # Get BU assignments
        bu_assigns = [
            tbu for tbu in agent.business_unit_assigns
            if not getattr(tbu, 'is_deleted', False)
        ]

        if not bu_assigns:
            # Agent has no BU assignments - return empty report with flag
            return OutshiftAgentReport(
                period_start=start_date,
                period_end=end_date,
                agent_id=agent.id,
                agent_name=agent.username,
                agent_full_name=agent.full_name,
                total_activity_minutes=0,
                total_in_shift_minutes=0,
                total_out_shift_minutes=0,
                total_out_shift_percentage=0,
                business_unit_metrics=[],
                has_activity=False,
                has_bu_assignments=False,
            )

        # Get all BU details
        bu_ids = [tbu.business_unit_id for tbu in bu_assigns]
        bu_stmt = select(BusinessUnit).where(BusinessUnit.id.in_(bu_ids))
        bu_result = await db.execute(bu_stmt)
        business_units = {bu.id: bu for bu in bu_result.scalars().all()}

        # Get sessions for this agent in date range
        sessions = await OutshiftReportingService._get_agent_sessions(
            db, agent_id, start_dt, end_dt
        )

        # Get ticket activity for this agent in date range
        ticket_activity = await OutshiftReportingService._get_agent_ticket_activity(
            db, agent_id, start_dt, end_dt
        )

        # Calculate metrics per BU
        bu_metrics_list = []
        total_activity = 0.0
        total_in_shift = 0.0
        total_out_shift = 0.0

        for bu_id in bu_ids:
            bu = business_units.get(bu_id)
            if not bu:
                continue

            metrics = await OutshiftReportingService._calculate_bu_metrics(
                bu=bu,
                sessions=sessions,
                ticket_activity=ticket_activity,
                start_dt=start_dt,
                end_dt=end_dt,
            )
            bu_metrics_list.append(metrics)
            total_activity += metrics.total_activity_minutes
            total_in_shift += metrics.in_shift_minutes
            total_out_shift += metrics.out_shift_minutes

        # Calculate total percentage
        total_percentage = 0.0
        if total_activity > 0:
            total_percentage = (total_out_shift / total_activity) * 100

        has_activity = total_activity > 0

        return OutshiftAgentReport(
            period_start=start_date,
            period_end=end_date,
            agent_id=agent.id,
            agent_name=agent.username,
            agent_full_name=agent.full_name,
            total_activity_minutes=round(total_activity, 2),
            total_in_shift_minutes=round(total_in_shift, 2),
            total_out_shift_minutes=round(total_out_shift, 2),
            total_out_shift_percentage=round(total_percentage, 2),
            business_unit_metrics=bu_metrics_list,
            has_activity=has_activity,
            has_bu_assignments=True,
        )

    @staticmethod
    @safe_database_query("get_global_outshift_report", default_return=None)
    @log_database_operation("global outshift report generation", level="info")
    async def get_global_outshift_report(
        db: AsyncSession,
        filters: Optional[ReportFilters] = None,
    ) -> OutshiftGlobalReport:
        """
        Generate aggregate outshift report across all agents.

        Args:
            db: Database session
            filters: Optional filters including date range and business_unit_ids

        Returns:
            OutshiftGlobalReport with agent rankings
        """
        # Resolve date range
        start_date, end_date = ReportingService.resolve_date_range(
            filters.date_range if filters else None
        )
        start_dt = datetime.combine(start_date, time.min)
        end_dt = datetime.combine(end_date, time.max)

        # Get all technicians with BU assignments
        tech_stmt = (
            select(User)
            .where(User.is_technician == True, User.is_active == True)
            .options(selectinload(User.business_unit_assigns))
        )
        tech_result = await db.execute(tech_stmt)
        technicians = tech_result.scalars().all()

        # Filter to only those with BU assignments
        agents_with_bu = []
        for tech in technicians:
            bu_assigns = [
                tbu for tbu in tech.business_unit_assigns
                if not getattr(tbu, 'is_deleted', False)
            ]
            # Apply BU filter if specified
            if filters and filters.business_unit_ids:
                bu_assigns = [
                    tbu for tbu in bu_assigns
                    if tbu.business_unit_id in filters.business_unit_ids
                ]
            if bu_assigns:
                agents_with_bu.append((tech, bu_assigns))

        if not agents_with_bu:
            return OutshiftGlobalReport(
                period_start=start_date,
                period_end=end_date,
                total_agents=0,
                agents_with_activity=0,
                agents_with_outshift=0,
                total_activity_minutes=0,
                total_in_shift_minutes=0,
                total_out_shift_minutes=0,
                overall_out_shift_percentage=0,
                avg_out_shift_percentage=0,
                agent_rankings=[],
                has_data=False,
            )

        # Get all relevant BU details
        all_bu_ids = set()
        for _, bu_assigns in agents_with_bu:
            all_bu_ids.update(tbu.business_unit_id for tbu in bu_assigns)

        bu_stmt = select(BusinessUnit).where(BusinessUnit.id.in_(all_bu_ids))
        bu_result = await db.execute(bu_stmt)
        business_units = {bu.id: bu for bu in bu_result.scalars().all()}

        # Process each agent
        agent_summaries = []
        total_activity = 0.0
        total_in_shift = 0.0
        total_out_shift = 0.0
        agents_with_activity_count = 0
        agents_with_outshift_count = 0

        for agent, bu_assigns in agents_with_bu:
            # Get sessions and ticket activity
            sessions = await OutshiftReportingService._get_agent_sessions(
                db, agent.id, start_dt, end_dt
            )
            ticket_activity = await OutshiftReportingService._get_agent_ticket_activity(
                db, agent.id, start_dt, end_dt
            )

            agent_total_activity = 0.0
            agent_out_shift = 0.0
            agent_out_shift_sessions = 0
            agent_out_shift_tickets: Set[UUID] = set()

            for tbu in bu_assigns:
                bu = business_units.get(tbu.business_unit_id)
                if not bu:
                    continue

                metrics = await OutshiftReportingService._calculate_bu_metrics(
                    bu=bu,
                    sessions=sessions,
                    ticket_activity=ticket_activity,
                    start_dt=start_dt,
                    end_dt=end_dt,
                )
                agent_total_activity += metrics.total_activity_minutes
                agent_out_shift += metrics.out_shift_minutes
                agent_out_shift_sessions += metrics.out_shift_sessions_count
                # Collect unique ticket IDs
                for seg in metrics.activity_segments:
                    if seg.classification == ShiftClassification.OUT_SHIFT:
                        agent_out_shift_tickets.update(seg.ticket_ids)

            if agent_total_activity > 0:
                agents_with_activity_count += 1
                agent_percentage = (agent_out_shift / agent_total_activity) * 100
                if agent_out_shift > 0:
                    agents_with_outshift_count += 1
            else:
                agent_percentage = 0.0

            total_activity += agent_total_activity
            total_in_shift += (agent_total_activity - agent_out_shift)
            total_out_shift += agent_out_shift

            agent_summaries.append({
                "agent_id": agent.id,
                "agent_name": agent.username,
                "agent_full_name": agent.full_name,
                "total_activity_minutes": round(agent_total_activity, 2),
                "total_out_shift_minutes": round(agent_out_shift, 2),
                "total_out_shift_percentage": round(agent_percentage, 2),
                "business_unit_count": len(bu_assigns),
                "out_shift_sessions_count": agent_out_shift_sessions,
                "out_shift_tickets_count": len(agent_out_shift_tickets),
            })

        # Sort by out-shift ticket count (highest first) and assign ranks
        agent_summaries.sort(key=lambda x: x["out_shift_tickets_count"], reverse=True)

        # Create OutshiftAgentSummary objects with proper ranks
        ranked_summaries = []
        for i, summary_data in enumerate(agent_summaries):
            ranked_summaries.append(OutshiftAgentSummary(
                **summary_data,
                rank=i + 1
            ))
        agent_summaries = ranked_summaries

        # Calculate global metrics
        overall_percentage = 0.0
        if total_activity > 0:
            overall_percentage = (total_out_shift / total_activity) * 100

        avg_percentage = 0.0
        if agents_with_activity_count > 0:
            percentages = [s.total_out_shift_percentage for s in agent_summaries if s.total_activity_minutes > 0]
            if percentages:
                avg_percentage = sum(percentages) / len(percentages)

        return OutshiftGlobalReport(
            period_start=start_date,
            period_end=end_date,
            total_agents=len(agents_with_bu),
            agents_with_activity=agents_with_activity_count,
            agents_with_outshift=agents_with_outshift_count,
            total_activity_minutes=round(total_activity, 2),
            total_in_shift_minutes=round(total_in_shift, 2),
            total_out_shift_minutes=round(total_out_shift, 2),
            overall_out_shift_percentage=round(overall_percentage, 2),
            avg_out_shift_percentage=round(avg_percentage, 2),
            agent_rankings=agent_summaries,
            has_data=agents_with_activity_count > 0,
        )

    # =========================================================================
    # Private Helpers - Data Fetching
    # =========================================================================

    @staticmethod
    async def _get_agent_sessions(
        db: AsyncSession,
        agent_id: UUID,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[WebSession]:
        """
        Get all sessions for an agent within date range.

        Includes sessions that:
        - Started within the range
        - Were active (had heartbeats) within the range
        """
        stmt = (
            select(WebSession)
            .where(
                WebSession.user_id == agent_id,
                or_(
                    # Session started within range
                    and_(
                        WebSession.created_at >= start_dt,
                        WebSession.created_at <= end_dt,
                    ),
                    # Session had activity within range
                    and_(
                        WebSession.last_heartbeat >= start_dt,
                        WebSession.last_heartbeat <= end_dt,
                    ),
                    # Session spans the range
                    and_(
                        WebSession.created_at <= start_dt,
                        WebSession.last_heartbeat >= end_dt,
                    ),
                )
            )
            .order_by(WebSession.created_at)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def _get_agent_ticket_activity(
        db: AsyncSession,
        agent_id: UUID,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Tuple[datetime, UUID]]:
        """
        Get all ticket activity timestamps for an agent.

        Returns list of (timestamp, ticket_id) tuples for:
        - Chat messages sent by agent
        - Request assignments to agent
        """
        activity: List[Tuple[datetime, UUID]] = []

        # Chat messages by this agent
        msg_stmt = (
            select(ChatMessage.created_at, ChatMessage.request_id)
            .where(
                ChatMessage.sender_id == agent_id,
                ChatMessage.created_at >= start_dt,
                ChatMessage.created_at <= end_dt,
            )
        )
        msg_result = await db.execute(msg_stmt)
        for row in msg_result.all():
            activity.append((row[0], row[1]))

        # Request assignments to this agent
        assign_stmt = (
            select(RequestAssignee.created_at, RequestAssignee.request_id)
            .where(
                RequestAssignee.assignee_id == agent_id,
                RequestAssignee.created_at >= start_dt,
                RequestAssignee.created_at <= end_dt,
            )
        )
        assign_result = await db.execute(assign_stmt)
        for row in assign_result.all():
            activity.append((row[0], row[1]))

        # Sort by timestamp
        activity.sort(key=lambda x: x[0])
        return activity

    # =========================================================================
    # Private Helpers - Core Algorithm
    # =========================================================================

    @staticmethod
    async def _calculate_bu_metrics(
        bu: BusinessUnit,
        sessions: List[WebSession],
        ticket_activity: List[Tuple[datetime, UUID]],
        start_dt: datetime,
        end_dt: datetime,
    ) -> OutshiftAgentBUMetrics:
        """
        Calculate outshift metrics for a single agent within a single BU.

        This is the core calculation logic.
        """
        working_hours = bu.working_hours
        has_working_hours = bool(working_hours)

        # If no working hours defined, all activity is in-shift
        if not has_working_hours:
            total_minutes = OutshiftReportingService._calculate_total_activity_minutes(
                sessions, ticket_activity, start_dt, end_dt
            )
            return OutshiftAgentBUMetrics(
                business_unit_id=bu.id,
                business_unit_name=bu.name,
                has_working_hours=False,
                total_activity_minutes=round(total_minutes, 2),
                in_shift_minutes=round(total_minutes, 2),
                out_shift_minutes=0,
                out_shift_percentage=0,
                out_shift_sessions_count=0,
                out_shift_tickets_count=0,
                activity_segments=[],
            )

        # Build unified activity segments
        segments = OutshiftReportingService._build_activity_segments(
            sessions, ticket_activity, start_dt, end_dt
        )

        # Classify each segment and split at shift boundaries
        classified_segments = OutshiftReportingService._classify_and_split_segments(
            segments, working_hours
        )

        # Aggregate metrics
        total_minutes = 0.0
        in_shift_minutes = 0.0
        out_shift_minutes = 0.0
        out_shift_session_ids: Set[int] = set()
        out_shift_ticket_ids: Set[UUID] = set()

        for seg in classified_segments:
            total_minutes += seg.duration_minutes
            if seg.classification == ShiftClassification.IN_SHIFT:
                in_shift_minutes += seg.duration_minutes
            else:
                out_shift_minutes += seg.duration_minutes
                if seg.session_id:
                    out_shift_session_ids.add(seg.session_id)
                out_shift_ticket_ids.update(seg.ticket_ids)

        out_shift_percentage = 0.0
        if total_minutes > 0:
            out_shift_percentage = (out_shift_minutes / total_minutes) * 100

        return OutshiftAgentBUMetrics(
            business_unit_id=bu.id,
            business_unit_name=bu.name,
            has_working_hours=True,
            total_activity_minutes=round(total_minutes, 2),
            in_shift_minutes=round(in_shift_minutes, 2),
            out_shift_minutes=round(out_shift_minutes, 2),
            out_shift_percentage=round(out_shift_percentage, 2),
            out_shift_sessions_count=len(out_shift_session_ids),
            out_shift_tickets_count=len(out_shift_ticket_ids),
            activity_segments=classified_segments,
        )

    @staticmethod
    def _calculate_total_activity_minutes(
        sessions: List[WebSession],
        ticket_activity: List[Tuple[datetime, UUID]],
        start_dt: datetime,
        end_dt: datetime,
    ) -> float:
        """Calculate total activity minutes from sessions and ticket activity."""
        total = 0.0

        # Session time
        for session in sessions:
            session_start = max(session.created_at, start_dt)
            session_end = min(session.last_heartbeat, end_dt)
            if session_end > session_start:
                delta = (session_end - session_start).total_seconds() / 60
                total += delta

        return total

    @staticmethod
    def _build_activity_segments(
        sessions: List[WebSession],
        ticket_activity: List[Tuple[datetime, UUID]],
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict]:
        """
        Build unified activity segments from sessions and ticket work.

        Returns list of dicts with:
        - start: datetime
        - end: datetime
        - activity_type: ActivityType
        - session_id: Optional[int]
        - ticket_ids: List[UUID]
        """
        segments = []

        # Add session segments
        for session in sessions:
            session_start = max(session.created_at, start_dt)
            session_end = min(session.last_heartbeat, end_dt)
            if session_end > session_start:
                segments.append({
                    'start': session_start,
                    'end': session_end,
                    'activity_type': ActivityType.SESSION,
                    'session_id': session.id,
                    'ticket_ids': [],
                })

        # Group ticket activity by minute intervals and merge
        # This creates 1-minute activity windows around ticket work
        ticket_windows: Dict[datetime, Set[UUID]] = {}
        for ts, ticket_id in ticket_activity:
            # Round to minute
            minute_start = ts.replace(second=0, microsecond=0)
            if minute_start not in ticket_windows:
                ticket_windows[minute_start] = set()
            ticket_windows[minute_start].add(ticket_id)

        # Create ticket activity segments
        for minute_start, ticket_ids in sorted(ticket_windows.items()):
            minute_end = minute_start + timedelta(minutes=1)
            segments.append({
                'start': minute_start,
                'end': minute_end,
                'activity_type': ActivityType.TICKET_WORK,
                'session_id': None,
                'ticket_ids': list(ticket_ids),
            })

        # Sort by start time
        segments.sort(key=lambda x: x['start'])

        # Merge overlapping segments
        merged = OutshiftReportingService._merge_overlapping_segments(segments)

        return merged

    @staticmethod
    def _merge_overlapping_segments(segments: List[Dict]) -> List[Dict]:
        """
        Merge overlapping segments deterministically.

        When segments overlap:
        - Union the time range
        - Combine ticket_ids
        - Mark as COMBINED activity type
        - Preserve session_id if present
        """
        if not segments:
            return []

        merged = []
        current = segments[0].copy()
        current['ticket_ids'] = list(current['ticket_ids'])

        for seg in segments[1:]:
            # Check for overlap
            if seg['start'] <= current['end']:
                # Merge
                current['end'] = max(current['end'], seg['end'])
                current['ticket_ids'] = list(set(current['ticket_ids']) | set(seg['ticket_ids']))
                if current['activity_type'] != seg['activity_type']:
                    current['activity_type'] = ActivityType.COMBINED
                if seg['session_id'] and not current['session_id']:
                    current['session_id'] = seg['session_id']
            else:
                # No overlap, save current and start new
                merged.append(current)
                current = seg.copy()
                current['ticket_ids'] = list(current['ticket_ids'])

        merged.append(current)
        return merged

    @staticmethod
    def _classify_and_split_segments(
        segments: List[Dict],
        working_hours: Dict,
    ) -> List[OutshiftActivitySegment]:
        """
        Classify each segment as in-shift or out-shift.

        Splits segments at shift boundaries so each resulting segment
        is entirely in-shift or entirely out-shift.
        """
        result = []

        for seg in segments:
            split_segments = OutshiftReportingService._split_at_shift_boundaries(
                seg['start'],
                seg['end'],
                working_hours,
                seg['activity_type'],
                seg['session_id'],
                seg['ticket_ids'],
            )
            result.extend(split_segments)

        return result

    @staticmethod
    def _split_at_shift_boundaries(
        start: datetime,
        end: datetime,
        working_hours: Dict,
        activity_type: ActivityType,
        session_id: Optional[int],
        ticket_ids: List[UUID],
    ) -> List[OutshiftActivitySegment]:
        """
        Split a time range at shift boundaries.

        Returns list of OutshiftActivitySegment, each fully classified.
        """
        if start >= end:
            return []

        result = []
        current = start

        while current < end:
            # Determine classification at current point
            is_out = ShiftEvaluator.is_out_of_shift(working_hours, current)
            classification = (
                ShiftClassification.OUT_SHIFT if is_out
                else ShiftClassification.IN_SHIFT
            )

            # Find next boundary (shift start or end)
            next_boundary = OutshiftReportingService._find_next_shift_boundary(
                current, end, working_hours
            )

            # Create segment from current to boundary
            segment_end = min(next_boundary, end)
            if segment_end > current:
                duration = (segment_end - current).total_seconds() / 60
                result.append(OutshiftActivitySegment(
                    segment_start=current,
                    segment_end=segment_end,
                    duration_minutes=round(duration, 2),
                    activity_type=activity_type,
                    classification=classification,
                    session_id=session_id,
                    ticket_ids=ticket_ids,
                ))

            current = segment_end

        return result

    @staticmethod
    def _find_next_shift_boundary(
        current: datetime,
        max_end: datetime,
        working_hours: Dict,
    ) -> datetime:
        """
        Find the next shift boundary (start or end of shift) after current time.

        Returns max_end if no boundary is found before it.
        """
        # Get the day's working hours
        day_name = current.strftime("%A").lower()
        day_hours = working_hours.get(day_name)

        # If no hours for this day, the boundary is midnight
        if not day_hours:
            next_midnight = (current + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            return min(next_midnight, max_end)

        # Handle both formats: dict (legacy) and list (new)
        shift_ranges = []
        if isinstance(day_hours, dict) and "from" in day_hours and "to" in day_hours:
            # Legacy format
            shift_ranges = [day_hours]
        elif isinstance(day_hours, list):
            # New format
            shift_ranges = day_hours
        else:
            # Invalid format, default to midnight
            next_midnight = (current + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            return min(next_midnight, max_end)

        try:
            boundaries = []

            # Collect all boundaries from all shift ranges
            for shift_range in shift_ranges:
                if not isinstance(shift_range, dict):
                    continue
                if "from" not in shift_range or "to" not in shift_range:
                    continue

                from_str = shift_range.get("from", "00:00")
                to_str = shift_range.get("to", "23:59")

                from_hour, from_min = map(int, from_str.split(":"))
                to_hour, to_min = map(int, to_str.split(":"))

                shift_start = current.replace(hour=from_hour, minute=from_min, second=0, microsecond=0)
                shift_end = current.replace(hour=to_hour, minute=to_min, second=0, microsecond=0)

                # Add boundaries that are after current time
                if shift_start > current:
                    boundaries.append(shift_start)
                if shift_end > current:
                    boundaries.append(shift_end)

                # Next day's shift start
                next_day_start = shift_start + timedelta(days=1)
                if next_day_start > current:
                    boundaries.append(next_day_start)

            # Also consider midnight
            next_midnight = (current + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            boundaries.append(next_midnight)

            if boundaries:
                next_boundary = min(boundaries)
                return min(next_boundary, max_end)

        except (ValueError, AttributeError, KeyError) as e:
            logger.warning(f"Error parsing working hours for boundary: {e}")

        # Default: check hourly
        next_hour = (current + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        return min(next_hour, max_end)
