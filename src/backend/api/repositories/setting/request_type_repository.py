"""
Request Type repository with specialized queries.
"""

from typing import Dict, List, Optional, Tuple

from db import RequestType, ServiceRequest
from api.repositories.base_repository import BaseRepository
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class RequestTypeRepository(BaseRepository[RequestType]):
    model = RequestType

    @classmethod
    async def find_active_with_section(
        cls,
        db: AsyncSession,
    ) -> List[RequestType]:
        """
        Find active request types with section.

        Note: This method extracts the active filter logic from the service.
        Section-related queries should be added in service layer.

        Args:
            db: Database session

        Returns:
            List of active request types
        """
        stmt = select(RequestType).order_by(RequestType.__table__.c.id)
        stmt = stmt.where(RequestType.__table__.c.is_active.is_(True))

        result = await db.execute(stmt)
        request_types = result.scalars().all()

        return list(request_types)

    @classmethod
    async def find_by_section(
        cls,
        db: AsyncSession,
        section_id: int,
    ) -> List[RequestType]:
        """
        Find request types by section ID.

        Args:
            db: Database session
            section_id: Section ID to filter by

        Returns:
            List of request types
        """
        stmt = select(RequestType).order_by(RequestType.__table__.c.id)
        stmt = stmt.where(RequestType.__table__.c.section_id == section_id)

        result = await db.execute(stmt)
        request_types = result.scalars().all()

        return list(request_types)

    @classmethod
    async def find_paginated_with_counts(
        cls,
        db: AsyncSession,
        page: int = 1,
        per_page: int = 10,
        is_active: Optional[bool] = None,
        name: Optional[str] = None,
    ) -> Dict:
        """
        List all request types with pagination, filtering, and counts.

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
        stmt = select(RequestType).order_by(RequestType.__table__.c.id)

        # Build count query with all counts in single query
        count_stmt = select(
            func.count().label("total"),
            func.count(case((RequestType.__table__.c.is_active.is_(True), 1))).label("active_count"),
            func.count(case((RequestType.__table__.c.is_active.is_(False), 1))).label("inactive_count"),
        )

        # Apply filters to both queries
        if is_active is not None:
            stmt = stmt.where(RequestType.__table__.c.is_active == is_active)
            count_stmt = count_stmt.where(RequestType.__table__.c.is_active == is_active)

        if name:
            # Search in both English and Arabic names
            name_filter = (RequestType.__table__.c.name_en.ilike(f"%{name}%")) | (
                RequestType.__table__.c.name_ar.ilike(f"%{name}%")
            )
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

    @classmethod
    async def toggle_status(cls, db: AsyncSession, request_type_id: int) -> Optional[RequestType]:
        """
        Toggle a request type's active status.

        Args:
            db: Database session
            request_type_id: Request type ID

        Returns:
            Updated request type or None. Caller must commit.
        """
        request_type = await cls.find_by_id(db, request_type_id)

        if not request_type:
            return None

        request_type.is_active = not request_type.is_active
        await db.flush()
        await db.refresh(request_type)

        return request_type

    @classmethod
    async def bulk_update_status(
        cls, db: AsyncSession, type_ids: List[int], is_active: bool
    ) -> List[RequestType]:
        """
        Bulk update request type status.

        Args:
            db: Database session
            type_ids: List of request type IDs
            is_active: New active status

        Returns:
            List of updated request types. Caller must commit.
        """
        stmt = select(RequestType).where(RequestType.__table__.c.id.in_(type_ids))
        result = await db.execute(stmt)
        request_types = result.scalars().all()

        for request_type in request_types:
            request_type.is_active = is_active

        await db.flush()

        return list(request_types)

    @classmethod
    async def is_in_use(cls, db: AsyncSession, request_type_id: int) -> bool:
        """
        Check if a request type is in use by any service requests.

        Args:
            db: Database session
            request_type_id: Request type ID

        Returns:
            True if in use, False otherwise
        """
        stmt = select(ServiceRequest.__table__.c.id).where(
            ServiceRequest.__table__.c.request_type_id == request_type_id
        ).limit(1)
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @classmethod
    async def delete_with_check(
        cls, db: AsyncSession, request_type_id: int, force: bool = False
    ) -> Tuple[bool, Optional[str]]:
        """
        Delete a request type (soft delete if in use).

        Args:
            db: Database session
            request_type_id: Request type ID
            force: If True, soft delete even if in use

        Returns:
            Tuple of (success, error_message). Caller must commit.
        """
        request_type = await cls.find_by_id(db, request_type_id)

        if not request_type:
            return False, "Request type not found"

        # Check if in use
        in_use = await cls.is_in_use(db, request_type_id)

        if in_use and not force:
            return False, "Cannot delete request type that is in use. Deactivate it instead."

        # If in use, soft delete (mark as inactive)
        if in_use:
            request_type.is_active = False
            await db.flush()
            return True, None

        # If not in use, hard delete
        await db.delete(request_type)
        await db.flush()

        return True, None
