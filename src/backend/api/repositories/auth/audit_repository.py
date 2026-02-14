from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Audit, User
from api.repositories.base_repository import BaseRepository


class AuditRepository(BaseRepository[Audit]):
    model = Audit

    @classmethod
    async def find_paginated_with_filters(
        cls,
        db: AsyncSession,
        page: int,
        per_page: int,
        filters: Dict[str, Any],
    ) -> Tuple[List[Audit], int]:
        """
        Get audit logs with filtering and pagination.

        Args:
            db: Database session
            page: Page number (1-indexed)
            per_page: Items per page
            filters: Filter criteria including:
                - user_id: Filter by user
                - action: Filter by action type
                - resource_type: Filter by resource type
                - resource_id: Filter by resource ID
                - correlation_id: Filter by correlation ID
                - search: Search in changes_summary, endpoint, resource_id, username, full_name
                - start_date: Filter by start date
                - end_date: Filter by end date

        Returns:
            Tuple of (list of Audit records, total count)
        """
        # Build query
        query = (
            select(Audit)
            .outerjoin(User, Audit.user_id == User.id)
            .order_by(Audit.created_at.desc())
        )

        # Apply filters
        if filters.get("user_id"):
            query = query.where(Audit.user_id == filters["user_id"])
        if filters.get("action"):
            query = query.where(Audit.action == filters["action"])
        if filters.get("resource_type"):
            query = query.where(Audit.resource_type == filters["resource_type"])
        if filters.get("resource_id"):
            query = query.where(Audit.resource_id == filters["resource_id"])
        if filters.get("correlation_id"):
            query = query.where(Audit.correlation_id == filters["correlation_id"])
        if filters.get("search"):
            search_term = f"%{filters['search']}%"
            query = query.where(
                or_(
                    Audit.changes_summary.ilike(search_term),
                    Audit.endpoint.ilike(search_term),
                    Audit.resource_id.ilike(search_term),
                    User.username.ilike(search_term),
                    User.full_name.ilike(search_term),
                )
            )
        if filters.get("start_date"):
            query = query.where(Audit.created_at >= filters["start_date"])
        if filters.get("end_date"):
            query = query.where(Audit.created_at <= filters["end_date"])

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total_count = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        query = query.limit(per_page).offset(offset)

        # Execute query
        result = await db.execute(query)
        audit_logs = list(result.scalars().all())

        return audit_logs, total_count

    @classmethod
    async def find_distinct_actions(
        cls,
        db: AsyncSession,
    ) -> List[str]:
        """
        Get distinct action types for filter dropdown.

        Args:
            db: Database session

        Returns:
            List of distinct action values
        """
        result = await db.execute(
            select(Audit.action).distinct().order_by(Audit.action.asc())
        )
        return [row[0] for row in result.all() if row[0] is not None]

    @classmethod
    async def find_distinct_resource_types(
        cls,
        db: AsyncSession,
    ) -> List[str]:
        """
        Get distinct resource types for filter dropdown.

        Args:
            db: Database session

        Returns:
            List of distinct resource_type values
        """
        result = await db.execute(
            select(Audit.resource_type).distinct().order_by(Audit.resource_type.asc())
        )
        return [row[0] for row in result.all() if row[0] is not None]

    @classmethod
    async def find_distinct_users(
        cls,
        db: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """
        Get distinct users who performed actions for filter dropdown.

        Args:
            db: Database session

        Returns:
            List of dicts with user_id, username, full_name
        """
        result = await db.execute(
            select(
                Audit.user_id,
                User.username,
                User.full_name,
            )
            .join(User, Audit.user_id == User.id)
            .distinct()
            .order_by(User.full_name.asc())
        )
        return [
            {
                "user_id": str(row.user_id),
                "username": row.username,
                "full_name": row.full_name,
            }
            for row in result.all()
            if row.user_id is not None
        ]

    @classmethod
    async def find_by_id_with_user(
        cls,
        db: AsyncSession,
        audit_id: int,
    ) -> Optional[Audit]:
        """
        Get a single audit log by ID with user info.

        Args:
            db: Database session
            audit_id: Audit log ID

        Returns:
            Audit log or None if not found
        """
        query = (
            select(Audit)
            .outerjoin(User, Audit.user_id == User.id)
            .where(Audit.id == audit_id)
            .options(selectinload(Audit.user))
        )

        result = await db.execute(query)
        return result.scalar_one_or_none()
