"""
Request Status service with performance optimizations.
"""

import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy import and_, func, select, case
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    critical_database_operation,
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import User
from models.database_models import RequestStatus, ServiceRequest
from schemas.request_status.request_status import (
    RequestStatusCreate,
    RequestStatusDetail,
    RequestStatusListItem,
    RequestStatusRead,
    RequestStatusSummary,
    RequestStatusUpdate,
)

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class RequestStatusService:
    """Service for managing request statuses with performance optimizations."""

    @staticmethod
    @transactional_database_operation("create_request_status")
    @log_database_operation("request status creation", level="debug")
    async def create_request_status(
        db: AsyncSession,
        status_data: RequestStatusCreate,
        created_by: Optional[int] = None,
    ) -> RequestStatus:
        """
        Create a new request status.

        Args:
            db: Database session
            status_data: Status creation data
            created_by: User ID who created the status

        Returns:
            Created request status
        """
        # Check if a status with this name already exists
        existing_stmt = select(RequestStatus).where(
            RequestStatus.name == status_data.name
        )
        existing_result = await db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            raise ValueError(
                f"Request status with name '{status_data.name}' already exists"
            )

        # Create new status with auto-generated integer ID
        status = RequestStatus(
            name=status_data.name,
            name_en=status_data.name_en,
            name_ar=status_data.name_ar,
            description=status_data.description,
            color=status_data.color,
            readonly=status_data.readonly,
            is_active=status_data.is_active,
            count_as_solved=status_data.count_as_solved,
            visible_on_requester_page=status_data.visible_on_requester_page,
            created_by=created_by,
            updated_by=created_by,
        )

        db.add(status)
        await db.commit()
        await db.refresh(status)

        return status

    @staticmethod
    @safe_database_query("get_request_status")
    @log_database_operation("request status retrieval", level="debug")
    async def get_request_status(
        db: AsyncSession, status_id: int
    ) -> Optional[RequestStatus]:
        """
        Get a request status by ID with caching.

        Args:
            db: Database session
            status_id: Status ID

        Returns:
            Request status or None
        """
        stmt = select(RequestStatus).where(RequestStatus.id == status_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("get_request_status_by_name")
    @log_database_operation("request status lookup by name", level="debug")
    async def get_request_status_by_name(
        db: AsyncSession, name: str
    ) -> Optional[RequestStatus]:
        """
        Get a request status by name.

        Args:
            db: Database session
            name: Status name

        Returns:
            Request status or None
        """
        stmt = select(RequestStatus).where(RequestStatus.name == name)
        result = await db.execute(stmt)
        status = result.scalar_one_or_none()

        return status

    @staticmethod
    @safe_database_query("list_request_statuses", default_return=([], 0, 0, 0, 0))
    @log_database_operation("request status listing", level="debug")
    async def list_request_statuses(
        db: AsyncSession,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        readonly: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple:
        """
        List request statuses with filtering and pagination. Cached for active_only queries.

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
            func.sum(case((RequestStatus.is_active == True, 1), else_=0)).label("active_count"),
            func.sum(case((RequestStatus.is_active == False, 1), else_=0)).label("inactive_count"),
            func.sum(case((RequestStatus.readonly == True, 1), else_=0)).label("readonly_count"),
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
        statuses = result.scalars().all()

        result_tuple = (statuses, total, active_count, inactive_count, readonly_count)

        return result_tuple

    @staticmethod
    @transactional_database_operation("update_request_status")
    @log_database_operation("request status update", level="debug")
    async def update_request_status(
        db: AsyncSession,
        status_id: int,
        update_data: RequestStatusUpdate,
        updated_by: Optional[int] = None,
    ) -> Optional[RequestStatus]:
        """
        Update a request status.

        Args:
            db: Database session
            status_id: Status ID
            update_data: Update data
            updated_by: User ID who updated the status

        Returns:
            Updated request status or None
        """
        stmt = select(RequestStatus).where(RequestStatus.id == status_id)
        result = await db.execute(stmt)
        status = result.scalar_one_or_none()

        if not status:
            return None

        # Check if readonly status can be updated
        # Readonly only prevents changing name, description, and color
        # Switches (isActive, countAsSolved, visibleOnRequesterPage) can still be toggled
        if status.readonly and (
            update_data.name or
            update_data.name_en or
            update_data.name_ar or
            update_data.description is not None or
            update_data.color is not None or
            update_data.readonly is not None
        ):
            raise ValueError("Cannot modify name, description, or color of readonly request status")

        # Update fields
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(status, field, value)

        status.updated_at = datetime.utcnow()
        if updated_by:
            status.updated_by = updated_by

        await db.commit()
        await db.refresh(status)

        return status

    @staticmethod
    @transactional_database_operation("toggle_request_status_status")
    @log_database_operation("request status toggle", level="debug")
    async def toggle_request_status_status(
        db: AsyncSession,
        status_id: int,
        updated_by: Optional[int] = None,
    ) -> Optional[RequestStatus]:
        """
        Toggle request status active status.

        Args:
            db: Database session
            status_id: Status ID
            updated_by: ID of user toggling the status

        Returns:
            Updated status or None
        """
        stmt = select(RequestStatus).where(RequestStatus.id == status_id)
        result = await db.execute(stmt)
        status = result.scalar_one_or_none()

        if not status:
            return None

        status.is_active = not status.is_active
        status.updated_at = datetime.utcnow()
        if updated_by:
            status.updated_by = updated_by

        await db.commit()
        await db.refresh(status)

        return status

    @staticmethod
    @transactional_database_operation("bulk_update_request_statuses_status")
    @log_database_operation("request statuses bulk status update", level="debug")
    async def bulk_update_request_statuses_status(
        db: AsyncSession,
        status_ids: List[int],
        is_active: bool,
        updated_by: Optional[int] = None,
    ) -> List[RequestStatus]:
        """
        Bulk update request statuses status.

        Args:
            db: Database session
            status_ids: List of status IDs to update
            is_active: New status
            updated_by: ID of user performing the update

        Returns:
            List of updated statuses
        """
        stmt = select(RequestStatus).where(RequestStatus.id.in_(status_ids))
        result = await db.execute(stmt)
        statuses = result.scalars().all()

        for status in statuses:
            status.is_active = is_active
            status.updated_at = datetime.utcnow()
            if updated_by:
                status.updated_by = updated_by

        await db.commit()
        # No need for N+1 refresh loop - objects are already in memory with latest state

        return statuses

    @staticmethod
    @transactional_database_operation("delete_request_status")
    @log_database_operation("request status deletion", level="debug")
    async def delete_request_status(db: AsyncSession, status_id: int) -> bool:
        """
        Delete a request status.

        Args:
            db: Database session
            status_id: Status ID

        Returns:
            True if deleted, False if not found
        """
        stmt = select(RequestStatus).where(RequestStatus.id == status_id)
        result = await db.execute(stmt)
        status = result.scalar_one_or_none()

        if not status:
            return False

        # Check if readonly status can be deleted
        if status.readonly:
            raise ValueError("Cannot delete readonly request status")

        # Check if status is in use
        usage_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status_id == status_id
        )
        usage_result = await db.execute(usage_stmt)
        usage_count = usage_result.scalar()

        if usage_count > 0:
            raise ValueError(
                f"Cannot delete status that is in use by {usage_count} requests"
            )

        await db.delete(status)
        await db.commit()

        return True

    @staticmethod
    @safe_database_query("get_request_status_detail", default_return=None)
    @log_database_operation("request status detail retrieval", level="debug")
    async def get_request_status_detail(
        db: AsyncSession, status_id: str
    ) -> Optional[RequestStatusDetail]:
        """
        Get detailed request status with request count.

        Args:
            db: Database session
            status_id: Status ID

        Returns:
            Detailed request status or None
        """
        # Get status with request count
        status_stmt = select(RequestStatus).where(
            RequestStatus.id == status_id
        )
        count_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.status_id == status_id
        )

        status_result = await db.execute(status_stmt)
        status = status_result.scalar_one_or_none()

        if not status:
            return None

        count_result = await db.execute(count_stmt)
        requests_count = count_result.scalar()

        # Create detail response
        detail = RequestStatusDetail.model_validate(status)
        detail.requests_count = requests_count

        return detail

    @staticmethod
    @safe_database_query("get_request_status_summary", default_return=None)
    @log_database_operation("request status summary retrieval", level="debug")
    async def get_request_status_summary(
        db: AsyncSession,
    ) -> RequestStatusSummary:
        """
        Get summary of all request statuses.

        Args:
            db: Database session

        Returns:
            Request status summary
        """
        # Get all counts in a single query for performance
        count_stmt = select(
            func.count(RequestStatus.id).label("total"),
            func.count(case((RequestStatus.readonly == True, 1))).label("readonly"),
            func.count(case((RequestStatus.is_active == True, 1))).label("active"),
            func.count(case((RequestStatus.is_active == False, 1))).label("inactive"),
        )

        count_result = await db.execute(count_stmt)
        counts = count_result.one()

        summary = RequestStatusSummary(
            total_statuses=counts.total,
            readonly_statuses=counts.readonly,
            active_statuses=counts.active,
            inactive_statuses=counts.inactive,
        )

        return summary

    @staticmethod
    @safe_database_query("get_default_status", default_return=None)
    @log_database_operation("default status retrieval", level="debug")
    async def get_default_status(db: AsyncSession) -> Optional[RequestStatus]:
        """
        Get the default request status (ID "1").

        Args:
            db: Database session

        Returns:
            Default request status or None
        """
        stmt = select(RequestStatus).where(RequestStatus.id == "1")
        result = await db.execute(stmt)
        status = result.scalar_one_or_none()

        return status

    @staticmethod
    @safe_database_query("get_all_active_statuses", default_return=[])
    @log_database_operation("get all active statuses", level="debug")
    async def get_all_active_statuses(db: AsyncSession) -> List[RequestStatus]:
        """
        Get all active request statuses.

        This method is used for metadata caching and WebSocket initial state.
        Returns all statuses where is_active=True, ordered by ID.

        Args:
            db: Database session

        Returns:
            List of active request statuses
        """
        stmt = select(RequestStatus).where(RequestStatus.is_active == True).order_by(RequestStatus.id)
        result = await db.execute(stmt)
        statuses = result.scalars().all()

        return list(statuses)
