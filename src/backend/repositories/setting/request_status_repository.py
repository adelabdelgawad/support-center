"""
Request Status Repository for database operations.

Handles all database queries related to request statuses.
"""

from typing import List, Optional
from sqlalchemy import and_, func, select
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
