"""
Request Status Repository for database operations.

Handles all database queries related to request statuses.
"""

from typing import List, Optional, Tuple
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import RequestStatus, ServiceRequest
from repositories.base_repository import BaseRepository


class RequestStatusRepository(BaseRepository[RequestStatus]):
    """Repository for RequestStatus database operations."""

    model = RequestStatus

    @classmethod
    async def get_status_counts_for_requester(
        cls, db: AsyncSession, user_id: int
    ) -> List[dict]:
        """
        Get request status counts with bilingual names and colors for a requester.

        Only returns statuses where visible_on_requester_page is True.

        Args:
            db: Database session
            user_id: Requester user ID

        Returns:
            List of dicts with id, name, name_en, name_ar, color, and count
            (filtered by visible_on_requester_page = True)
        """
        # Use filter in the JOIN condition to preserve outer join behavior
        join_condition = and_(
            ServiceRequest.status_id == RequestStatus.id,
            ServiceRequest.requester_id == user_id,
        )

        status_query = (
            select(
                RequestStatus.id,
                RequestStatus.name,
                RequestStatus.name_en,
                RequestStatus.name_ar,
                RequestStatus.color,
                func.count(ServiceRequest.id).label("count"),
            )
            .outerjoin(ServiceRequest, join_condition)
            .where(RequestStatus.is_active, RequestStatus.visible_on_requester_page)
            .group_by(
                RequestStatus.id,
                RequestStatus.name,
                RequestStatus.name_en,
                RequestStatus.name_ar,
                RequestStatus.color,
            )
            .order_by(RequestStatus.id)
        )

        status_result = await db.execute(status_query)
        status_rows = status_result.all()

        return [
            {
                "id": row.id,
                "name": row.name,
                "name_en": row.name_en,
                "name_ar": row.name_ar,
                "color": row.color,
                "count": row.count,
            }
            for row in status_rows
        ]

    @classmethod
    async def get_all_active_statuses(
        cls,
        db: AsyncSession,
        *,
        is_active: Optional[bool] = None,
        readonly: Optional[bool] = None,
    ) -> List[RequestStatus]:
        """
        Get all active request statuses visible to requesters.

        Args:
            db: Database session
            is_active: Filter by active status (optional)
            readonly: Filter by readonly status (optional)

        Returns:
            List of RequestStatus objects that are visible on the requester page
        """
        # Build query with proper filtering
        # Filter by active and visible_on_requester_page for requester views
        stmt = select(RequestStatus).where(
            RequestStatus.is_active, RequestStatus.visible_on_requester_page
        )

        # Apply optional filters
        if is_active is not None:
            stmt = stmt.where(RequestStatus.is_active == is_active)

        if readonly is not None:
            stmt = stmt.where(RequestStatus.readonly == readonly)

        # Apply ordering
        stmt = stmt.order_by(RequestStatus.id)

        # Execute query
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_by_name(
        cls, db: AsyncSession, name: str
    ) -> Optional[RequestStatus]:
        """
        Find a request status by name.

        Args:
            db: Database session
            name: Status name

        Returns:
            RequestStatus or None if not found
        """
        stmt = select(RequestStatus).where(RequestStatus.name == name)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def list_with_filters_and_pagination(
        cls,
        db: AsyncSession,
        *,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        readonly: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[RequestStatus], int, int, int, int]:
        """
        List request statuses with filtering and pagination.

        Args:
            db: Database session
            name: Filter by name (partial match)
            is_active: Filter by active status
            readonly: Filter by readonly status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of statuses, total, active_count, inactive_count, readonly_count)
        """
        # Build main query
        stmt = select(RequestStatus)

        # Build total count query - ALWAYS get total counts from database (no filters)
        total_count_stmt = select(
            func.count(RequestStatus.id).label("total"),
            func.sum(case((RequestStatus.is_active, 1), else_=0)).label("active_count"),
            func.sum(case((not RequestStatus.is_active, 1), else_=0)).label(
                "inactive_count"
            ),
            func.sum(case((RequestStatus.readonly, 1), else_=0)).label(
                "readonly_count"
            ),
        )

        # Get total counts (unfiltered)
        total_count_result = await db.execute(total_count_stmt)
        total_counts = total_count_result.one()
        total = total_counts.total or 0
        active_count = total_counts.active_count or 0
        inactive_count = total_counts.inactive_count or 0
        readonly_count = total_counts.readonly_count or 0

        # Apply filters to main query only
        if name:
            name_filter = RequestStatus.name.ilike(f"%{name}%")
            stmt = stmt.where(name_filter)
        if is_active is not None:
            stmt = stmt.where(RequestStatus.is_active == is_active)
        if readonly is not None:
            stmt = stmt.where(RequestStatus.readonly == readonly)

        # Apply pagination
        stmt = (
            stmt.order_by(RequestStatus.name)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        statuses = list(result.scalars().all())

        return (statuses, total, active_count, inactive_count, readonly_count)

    @classmethod
    async def count_requests_by_status(
        cls, db: AsyncSession, status_id: int
    ) -> int:
        """
        Count how many service requests use this status.

        Args:
            db: Database session
            status_id: Status ID

        Returns:
            Count of requests using this status
        """
        stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status_id == status_id
        )
        result = await db.execute(stmt)
        return result.scalar()

    @classmethod
    async def get_summary_counts(cls, db: AsyncSession) -> dict:
        """
        Get summary counts of all request statuses.

        Args:
            db: Database session

        Returns:
            Dict with total, readonly, active, inactive counts
        """
        count_stmt = select(
            func.count(RequestStatus.id).label("total"),
            func.count(case((RequestStatus.readonly, 1))).label("readonly"),
            func.count(case((RequestStatus.is_active, 1))).label("active"),
            func.count(case((not RequestStatus.is_active, 1))).label("inactive"),
        )

        count_result = await db.execute(count_stmt)
        counts = count_result.one()

        return {
            "total": counts.total,
            "readonly": counts.readonly,
            "active": counts.active,
            "inactive": counts.inactive,
        }

    @classmethod
    async def bulk_update_status(
        cls,
        db: AsyncSession,
        status_ids: List[int],
        is_active: bool,
    ) -> List[RequestStatus]:
        """
        Bulk update request statuses active status.

        Args:
            db: Database session
            status_ids: List of status IDs to update
            is_active: New active status

        Returns:
            List of updated statuses
        """
        stmt = select(RequestStatus).where(RequestStatus.id.in_(status_ids))
        result = await db.execute(stmt)
        statuses = list(result.scalars().all())

        for status in statuses:
            status.is_active = is_active

        return statuses
