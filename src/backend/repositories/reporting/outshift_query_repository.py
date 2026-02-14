"""
Outshift Query Repository - Cross-entity queries for outshift reporting.

Extracted from api/services/outshift_reporting_service.py.
All methods return aggregated data (dicts, lists of dicts, tuples), not model instances.
Does NOT inherit from BaseRepository as it queries across multiple models.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Tuple
from uuid import UUID

from sqlalchemy import select, and_, or_, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import User, WebSession, BusinessUnit, RequestAssignee, ChatMessage

logger = logging.getLogger(__name__)


class OutshiftQueryRepository:
    """Read-only cross-entity queries for outshift reporting."""

    @classmethod
    async def get_agent_sessions(
        cls,
        db: AsyncSession,
        agent_id: UUID,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[WebSession]:
        """
        Get all sessions for an agent within date range.

        Returns list of WebSession model instances.

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
                ),
            )
            .order_by(WebSession.created_at)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_agent_chat_messages(
        cls,
        db: AsyncSession,
        agent_id: UUID,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Tuple[datetime, UUID]]:
        """
        Get chat messages by agent in date range.

        Returns list of tuples: (created_at, request_id)
        """
        msg_stmt = select(ChatMessage.created_at, ChatMessage.request_id).where(
            ChatMessage.sender_id == agent_id,
            ChatMessage.created_at >= start_dt,
            ChatMessage.created_at <= end_dt,
        )
        msg_result = await db.execute(msg_stmt)
        return list(msg_result.all())

    @classmethod
    async def get_agent_request_assignments(
        cls,
        db: AsyncSession,
        agent_id: UUID,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Tuple[datetime, UUID]]:
        """
        Get request assignments to agent in date range.

        Returns list of tuples: (created_at, request_id)
        """
        assign_stmt = select(
            RequestAssignee.created_at, RequestAssignee.request_id
        ).where(
            RequestAssignee.assignee_id == agent_id,
            RequestAssignee.created_at >= start_dt,
            RequestAssignee.created_at <= end_dt,
        )
        assign_result = await db.execute(assign_stmt)
        return list(assign_result.all())

    @classmethod
    async def get_all_technicians(
        cls,
        db: AsyncSession,
    ) -> List[User]:
        """
        Get all active technicians.

        Returns list of User model instances.
        """
        stmt = select(User).where(User.is_technician, User.is_active)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_agent_by_id(
        cls,
        db: AsyncSession,
        agent_id: UUID,
    ) -> User:
        """
        Get agent by ID.

        Returns User model instance or None.
        """
        from sqlalchemy.orm import selectinload

        stmt = (
            select(User)
            .where(User.id == agent_id)
            .options(selectinload(User.business_unit_assigns))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def get_business_units_by_ids(
        cls,
        db: AsyncSession,
        bu_ids: List[int],
    ) -> dict:
        """
        Get business units by IDs.

        Returns dict mapping bu_id -> BusinessUnit instance.
        """
        stmt = select(BusinessUnit).where(BusinessUnit.id.in_(bu_ids))
        result = await db.execute(stmt)
        return {bu.id: bu for bu in result.scalars().all()}

    @classmethod
    async def get_technician_assignments_count(
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
    async def get_technician_resolved_tickets_count(
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
        from db.models import ServiceRequest

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
    async def get_technician_open_tickets_count(
        cls,
        db: AsyncSession,
        technician_id: int,
        open_status_ids: list,
    ) -> int:
        """
        Get count of open tickets for a technician.

        Returns count of open tickets.
        """
        from db.models import ServiceRequest

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
        from db.models import ServiceRequest
        from sqlalchemy import extract

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
        from db.models import ServiceRequest

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
