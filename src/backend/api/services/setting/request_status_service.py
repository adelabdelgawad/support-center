"""
Request Status service with performance optimizations.
"""

import logging
from uuid import UUID
from datetime import datetime
from typing import Any, cast, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db.models import RequestStatus
from api.schemas.request_status import (
    RequestStatusCreate,
    RequestStatusDetail,
    RequestStatusSummary,
    RequestStatusUpdate,
)
from api.repositories.setting.request_status_repository import RequestStatusRepository

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
        existing = await RequestStatusRepository.find_by_name(db, status_data.name)
        if existing:
            raise ValueError(
                f"Request status with name '{status_data.name}' already exists"
            )

        # Create new status with auto-generated integer ID
        status_dict = status_data.model_dump()
        status_dict["created_by"] = created_by
        status_dict["updated_by"] = created_by

        status = await RequestStatusRepository.create(db, obj_in=status_dict)

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
        return await RequestStatusRepository.find_by_id(db, status_id)

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
        return await RequestStatusRepository.find_by_name(db, name)

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
        return await RequestStatusRepository.list_with_filters_and_pagination(
            db,
            name=name,
            is_active=is_active,
            readonly=readonly,
            page=page,
            per_page=per_page,
        )

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
        status = await RequestStatusRepository.find_by_id(db, status_id)

        if not status:
            return None

        # Check if readonly status can be updated
        # Readonly only prevents changing name, description, and color
        # Switches (isActive, countAsSolved, visibleOnRequesterPage) can still be toggled
        if status.readonly and (
            update_data.name
            or update_data.name_en
            or update_data.name_ar
            or update_data.description is not None
            or update_data.color is not None
            or update_data.readonly is not None
        ):
            raise ValueError(
                "Cannot modify name, description, or color of readonly request status"
            )

        # Update fields (filter None to protect NOT NULL columns)
        update_dict = {
            k: v
            for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }
        update_dict["updated_at"] = datetime.utcnow()
        if updated_by:
            update_dict["updated_by"] = updated_by

        status = await RequestStatusRepository.update(
            db, id_value=status_id, obj_in=update_dict
        )

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
        status = await RequestStatusRepository.find_by_id(db, status_id)

        if not status:
            return None

        update_dict = {
            "is_active": not status.is_active,
            "updated_at": datetime.utcnow(),
        }
        if updated_by:
            update_dict["updated_by"] = updated_by

        status = await RequestStatusRepository.update(
            db, id_value=status_id, obj_in=update_dict
        )

        return status

    @staticmethod
    @transactional_database_operation("bulk_update_request_statuses_status")
    @log_database_operation("request statuses bulk status update", level="debug")
    async def bulk_update_request_statuses_status(
        db: AsyncSession,
        status_ids: List[int],
        is_active: bool,
        updated_by: Optional[UUID] = None,
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
        statuses = await RequestStatusRepository.bulk_update_status(
            db, status_ids, is_active
        )

        for status in statuses:
            status.updated_at = datetime.utcnow()
            if updated_by:
                status.updated_by = cast(Any, updated_by)

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
        status = await RequestStatusRepository.find_by_id(db, status_id)

        if not status:
            return False

        # Check if readonly status can be deleted
        if status.readonly:
            raise ValueError("Cannot delete readonly request status")

        # Check if status is in use
        usage_count = await RequestStatusRepository.count_requests_by_status(
            db, status_id
        )

        if usage_count > 0:
            raise ValueError(
                f"Cannot delete status that is in use by {usage_count} requests"
            )

        return await RequestStatusRepository.delete(db, id_value=status_id)

    @staticmethod
    @safe_database_query("get_request_status_detail", default_return=None)
    @log_database_operation("request status detail retrieval", level="debug")
    async def get_request_status_detail(
        db: AsyncSession, status_id: int
    ) -> Optional[RequestStatusDetail]:
        """
        Get detailed request status with request count.

        Args:
            db: Database session
            status_id: Status ID

        Returns:
            Detailed request status or None
        """
        status = await RequestStatusRepository.find_by_id(db, status_id)

        if not status:
            return None

        requests_count = await RequestStatusRepository.count_requests_by_status(
            db, cast(Any, status_id)
        )

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
        counts = await RequestStatusRepository.get_summary_counts(db)

        summary = RequestStatusSummary(
            total_statuses=counts["total"],
            readonly_statuses=counts["readonly"],
            active_statuses=counts["active"],
            inactive_statuses=counts["inactive"],
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
        return await RequestStatusRepository.find_by_id(db, 1)

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
        return await RequestStatusRepository.get_all_active_statuses(db)
