"""
Request Type service with CRUD operations.
"""
import logging
from typing import Dict, List, Optional, Any

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import RequestType
from api.schemas.request_type import RequestTypeCreate, RequestTypeUpdate
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class RequestTypeService:
    """Service for managing request types."""

    @staticmethod
    @safe_database_query("list_request_types", default_return={"types": [], "total": 0, "active_count": 0, "inactive_count": 0})
    @log_database_operation("request type listing", level="debug")
    async def list_request_types(
        db: AsyncSession,
        page: int = 1,
        per_page: int = 10,
        is_active: Optional[bool] = None,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List all request types with pagination and filtering.

        Args:
            db: Database session
            page: Page number (1-indexed)
            per_page: Items per page
            is_active: Filter by active status
            name: Filter by name (partial match)

        Returns:
            Dict with types, total, activeCount, inactiveCount
        """
        # Base query
        stmt = select(RequestType).order_by(RequestType.id)

        # Build count query with all counts in single query
        count_stmt = select(
            func.count(RequestType.id).label("total"),
            func.count(case((RequestType.is_active, 1))).label("active_count"),
            func.count(case((not RequestType.is_active, 1))).label("inactive_count"),
        )

        # Apply filters to both queries
        if is_active is not None:
            stmt = stmt.where(RequestType.is_active == is_active)
            count_stmt = count_stmt.where(RequestType.is_active == is_active)

        if name:
            # Search in both English and Arabic names
            name_filter = (RequestType.name_en.ilike(f"%{name}%")) | (RequestType.name_ar.ilike(f"%{name}%"))
            stmt = stmt.where(name_filter)
            count_stmt = count_stmt.where(name_filter)

        # Get all counts in a single query
        count_result = await db.execute(count_stmt)
        counts = count_result.one()
        total = counts.total or 0
        active_count = counts.active_count or 0
        inactive_count = counts.inactive_count or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        request_types = result.scalars().all()

        return {
            "types": list(request_types),
            "total": total,
            "active_count": active_count,
            "inactive_count": inactive_count,
        }

    @staticmethod
    @safe_database_query("get_request_type")
    @log_database_operation("request type retrieval", level="debug")
    async def get_request_type(
        db: AsyncSession,
        request_type_id: int
    ) -> Optional[RequestType]:
        """
        Get a request type by ID.

        Args:
            db: Database session
            request_type_id: Request type ID

        Returns:
            Request type or None
        """
        stmt = select(RequestType).where(RequestType.id == request_type_id)
        result = await db.execute(stmt)
        request_type = result.scalar_one_or_none()

        return request_type

    @staticmethod
    @transactional_database_operation("create_request_type")
    @log_database_operation("request type creation", level="debug")
    async def create_request_type(
        db: AsyncSession,
        request_type_data: RequestTypeCreate
    ) -> RequestType:
        """
        Create a new request type.

        Args:
            db: Database session
            request_type_data: Request type creation data

        Returns:
            Created request type
        """
        request_type = RequestType(**request_type_data.model_dump())
        db.add(request_type)
        await db.commit()
        await db.refresh(request_type)

        return request_type

    @staticmethod
    @transactional_database_operation("update_request_type")
    @log_database_operation("request type update", level="debug")
    async def update_request_type(
        db: AsyncSession,
        request_type_id: int,
        update_data: RequestTypeUpdate
    ) -> Optional[RequestType]:
        """
        Update a request type.

        Args:
            db: Database session
            request_type_id: Request type ID
            update_data: Update data

        Returns:
            Updated request type or None
        """
        stmt = select(RequestType).where(RequestType.id == request_type_id)
        result = await db.execute(stmt)
        request_type = result.scalar_one_or_none()

        if not request_type:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(request_type, field, value)

        await db.commit()
        await db.refresh(request_type)

        return request_type

    @staticmethod
    @transactional_database_operation("toggle_request_type_status")
    @log_database_operation("request type status toggle", level="debug")
    async def toggle_request_type_status(
        db: AsyncSession,
        request_type_id: int
    ) -> Optional[RequestType]:
        """
        Toggle a request type's active status.

        Args:
            db: Database session
            request_type_id: Request type ID

        Returns:
            Updated request type or None
        """
        stmt = select(RequestType).where(RequestType.id == request_type_id)
        result = await db.execute(stmt)
        request_type = result.scalar_one_or_none()

        if not request_type:
            return None

        request_type.is_active = not request_type.is_active
        await db.commit()
        await db.refresh(request_type)

        return request_type

    @staticmethod
    @transactional_database_operation("bulk_update_request_type_status")
    @log_database_operation("request type bulk status update", level="debug")
    async def bulk_update_request_type_status(
        db: AsyncSession,
        type_ids: List[int],
        is_active: bool
    ) -> List[RequestType]:
        """
        Bulk update request type status.

        Args:
            db: Database session
            type_ids: List of request type IDs
            is_active: New active status

        Returns:
            List of updated request types
        """
        stmt = select(RequestType).where(RequestType.id.in_(type_ids))
        result = await db.execute(stmt)
        request_types = result.scalars().all()

        for request_type in request_types:
            request_type.is_active = is_active

        await db.commit()
        # No need for N+1 refresh loop - objects are already in memory with latest state

        return request_types

    @staticmethod
    @safe_database_query("is_request_type_in_use", default_return=False)
    @log_database_operation("request type usage check", level="debug")
    async def is_request_type_in_use(
        db: AsyncSession,
        request_type_id: int
    ) -> bool:
        """
        Check if a request type is in use by any service requests.

        Args:
            db: Database session
            request_type_id: Request type ID

        Returns:
            True if in use, False otherwise
        """
        from db import ServiceRequest

        stmt = select(ServiceRequest.id).where(
            ServiceRequest.request_type_id == request_type_id
        ).limit(1)
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @staticmethod
    @transactional_database_operation("delete_request_type")
    @log_database_operation("request type deletion", level="debug")
    async def delete_request_type(
        db: AsyncSession,
        request_type_id: int,
        force: bool = False
    ) -> tuple[bool, Optional[str]]:
        """
        Delete a request type (soft delete if in use).

        Args:
            db: Database session
            request_type_id: Request type ID
            force: If True, soft delete even if in use

        Returns:
            Tuple of (success, error_message)
        """
        stmt = select(RequestType).where(RequestType.id == request_type_id)
        result = await db.execute(stmt)
        request_type = result.scalar_one_or_none()

        if not request_type:
            return False, "Request type not found"

        # Check if in use
        in_use = await RequestTypeService.is_request_type_in_use(db, request_type_id)

        if in_use and not force:
            return False, "Cannot delete request type that is in use. Deactivate it instead."

        # If in use, soft delete (mark as inactive)
        if in_use:
            request_type.is_active = False
            await db.commit()
            return True, None

        # If not in use, hard delete
        await db.delete(request_type)
        await db.commit()

        return True, None
