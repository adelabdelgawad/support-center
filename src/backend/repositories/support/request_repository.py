"""
Service Request Repository for database operations.

Handles all database queries related to service requests with section-based visibility filtering.
"""

from typing import Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import (
    BusinessUnit,
    ChatMessage,
    RequestAssignee,
    RequestStatus,
    ServiceRequest,
    Subcategory,
    User,
)
from repositories.base_repository import BaseRepository


class ServiceRequestRepository(BaseRepository[ServiceRequest]):
    """Repository for ServiceRequest database operations with section-based visibility filtering."""

    model = ServiceRequest

    @classmethod
    async def find_by_id(
        cls, db: AsyncSession, request_id: UUID
    ) -> Optional[ServiceRequest]:
        """Find service request by ID with relationships loaded."""
        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.id == request_id, ServiceRequest.is_deleted.is_(False)
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    def _get_visibility_filter(cls, user: User):
        """
        Get section-based visibility filter for requests.

        New filtering logic:
        1. Super admin / Admin role → no filter (see all)
        2. Get user's section_ids from TechnicianSection (user.section_assigns)
        3. No section assignments → see nothing
        4. Section filter: ServiceRequest.assigned_to_section_id IN (user_section_ids)
        5. If user has BU assignments → AND with BU filter (geographic narrowing)
        6. Return combined filter
        """
        from sqlalchemy import and_

        # Super admins see all requests (no filter)
        if user.is_super_admin:
            return None

        # Check if user has Admin role
        has_admin_role = any(
            ur.role and ur.role.name == "Admin"
            for ur in user.user_roles
            if ur.is_active and not ur.is_deleted
        )

        if has_admin_role:
            return None  # Admin role users see all requests

        # Get user's section assignments
        active_section_assigns = [
            sa for sa in user.section_assigns if not sa.is_deleted
        ]

        if not active_section_assigns:
            # No section assignments - return empty filter (no results)
            return ServiceRequest.id.is_(None)

        # Section filter: requests assigned to user's sections
        section_ids = [sa.section_id for sa in active_section_assigns]
        section_filter = ServiceRequest.assigned_to_section_id.in_(section_ids)

        # Check if user has business unit assignments for geographic narrowing
        active_bu_assigns = [
            ba
            for ba in user.business_unit_assigns
            if ba.is_active and not ba.is_deleted
        ]

        if active_bu_assigns:
            # Combine section filter with BU filter (AND logic)
            assigned_bu_ids = [ba.business_unit_id for ba in active_bu_assigns]
            bu_filter = ServiceRequest.business_unit_id.in_(assigned_bu_ids)
            return and_(section_filter, bu_filter)

        # No BU assignments - return section filter only
        return section_filter

    @classmethod
    def _apply_business_unit_filter(cls, stmt, business_unit_ids: list[int] | None):
        """
        Apply business unit filter to a query statement.
        Supports multiple business unit IDs and -1 for unassigned (null business_unit_id).

        Args:
            stmt: SQLAlchemy statement to filter
            business_unit_ids: List of business unit IDs. -1 indicates unassigned (null).

        Returns:
            Filtered statement
        """
        if not business_unit_ids:
            return stmt

        has_unassigned = -1 in business_unit_ids
        positive_ids = [id for id in business_unit_ids if id > 0]

        conditions = []
        if has_unassigned:
            conditions.append(ServiceRequest.business_unit_id.is_(None))
        if positive_ids:
            conditions.append(ServiceRequest.business_unit_id.in_(positive_ids))

        if conditions:
            stmt = stmt.where(or_(*conditions))

        return stmt

    @classmethod
    async def build_view_base_query(
        cls,
        user: User,
        view_type: str,
        business_unit_ids: list[int] | None = None,
    ):
        """
        Build base query for a view WITHOUT eager loading (for counting).

        This replicates the filter logic from find_* methods but excludes
        selectinload options to enable efficient COUNT queries.

        Args:
            user: Current user (for region filtering)
            view_type: View type (unassigned, all_unsolved, etc.)
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned.

        Returns:
            SQLAlchemy select statement with filters applied
        """
        # Build base query based on view type
        if view_type == "unassigned":
            # Use NOT EXISTS for better performance
            assigned_exists = exists(
                select(1).where(RequestAssignee.request_id == ServiceRequest.id)
            )

            stmt = select(ServiceRequest).where(
                ~assigned_exists, ServiceRequest.is_deleted.is_(False)
            )

        elif view_type == "all_unsolved":
            # Subquery to get solved status IDs
            solved_subquery = select(RequestStatus.id).where(
                RequestStatus.count_as_solved
            )
            # Use EXISTS for better performance
            assigned_exists = exists(
                select(1).where(RequestAssignee.request_id == ServiceRequest.id)
            )

            stmt = select(ServiceRequest).where(
                ServiceRequest.status_id.notin_(solved_subquery),
                ServiceRequest.is_deleted.is_(False),
                assigned_exists,
            )

        elif view_type == "my_unsolved":
            # Subquery to get solved status IDs
            solved_subquery = select(RequestStatus.id).where(
                RequestStatus.count_as_solved
            )
            # Subquery to get request IDs assigned to user
            my_requests_subquery = select(RequestAssignee.request_id).where(
                RequestAssignee.assignee_id == user.id
            )

            stmt = select(ServiceRequest).where(
                and_(
                    ServiceRequest.id.in_(my_requests_subquery),
                    ServiceRequest.status_id.notin_(solved_subquery),
                    ServiceRequest.is_deleted.is_(False),
                )
            )

        elif view_type in (
            "recently_updated",
            "recently_solved",
            "all_your_requests",
            "urgent_high_priority",
            "pending_requester_response",
            "pending_subtask",
            "new_today",
            "in_progress",
            "all_tickets",
            "all_solved",
        ):
            # For other views, use a simpler base (they all have similar structure)
            # This is a fallback - specific logic can be added per view if needed
            stmt = select(ServiceRequest).where(ServiceRequest.is_deleted.is_(False))

            # Add view-specific filters
            if view_type == "recently_solved":
                solved_subquery = select(RequestStatus.id).where(
                    RequestStatus.count_as_solved
                )
                stmt = stmt.where(ServiceRequest.status_id.in_(solved_subquery))
            elif view_type == "all_solved":
                solved_subquery = select(RequestStatus.id).where(
                    RequestStatus.count_as_solved
                )
                stmt = stmt.where(ServiceRequest.status_id.in_(solved_subquery))

        else:
            # Default to unassigned
            assigned_exists = exists(
                select(1).where(RequestAssignee.request_id == ServiceRequest.id)
            )
            stmt = select(ServiceRequest).where(
                ~assigned_exists, ServiceRequest.is_deleted.is_(False)
            )

        # Apply filters:
        # - If business_unit_ids is explicitly provided, use ONLY that filter (not visibility filter)
        # - Otherwise, apply visibility filter (section + BU) to limit to user's accessible requests
        visibility_filter = cls._get_visibility_filter(user)
        if business_unit_ids:
            # User explicitly selected business units - use only that filter
            stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)
        elif visibility_filter is not None:
            # No explicit BU selection - apply section-based visibility filter
            stmt = stmt.where(visibility_filter)

        return stmt

    @classmethod
    async def find_unassigned_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get unassigned requests (no RequestAssignee records).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned (null BU).
        """
        # Use NOT EXISTS for better performance vs NOT IN
        assigned_exists = exists(
            select(1).where(RequestAssignee.request_id == ServiceRequest.id)
        )

        # Base query
        stmt = (
            select(ServiceRequest)
            .where(~assigned_exists, ServiceRequest.is_deleted.is_(False))
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter (supports multiple IDs and -1 for unassigned)
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Order by created_at DESC
        stmt = stmt.order_by(ServiceRequest.created_at.desc())

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_unsolved_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get all unsolved requests (statuses where count_as_solved is False) that have at least one assignee.
        Excludes unassigned requests (use find_unassigned_requests for those).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned (null BU).
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        # Use EXISTS for better performance vs IN
        assigned_exists = exists(
            select(1).where(RequestAssignee.request_id == ServiceRequest.id)
        )

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id.notin_(solved_subquery),
                ServiceRequest.is_deleted.is_(False),
                assigned_exists,  # Only requests with assignees
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter (supports multiple IDs and -1 for unassigned)
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        stmt = stmt.order_by(ServiceRequest.updated_at.desc())

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_my_unsolved_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests assigned to current user that are not solved/closed.
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned (null BU).
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        # Subquery to get request IDs assigned to user
        my_requests_subquery = select(RequestAssignee.request_id).where(
            RequestAssignee.assignee_id == user.id
        )

        stmt = (
            select(ServiceRequest)
            .where(
                and_(
                    ServiceRequest.id.in_(my_requests_subquery),
                    ServiceRequest.status_id.notin_(solved_subquery),
                    ServiceRequest.is_deleted.is_(False),
                )
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter (supports multiple IDs and -1 for unassigned)
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        stmt = stmt.order_by(ServiceRequest.updated_at.desc())

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_recently_updated_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get recently updated requests (ordered by updated_at DESC).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned (null BU).
        """
        stmt = (
            select(ServiceRequest)
            .where(ServiceRequest.is_deleted.is_(False))
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter (supports multiple IDs and -1 for unassigned)
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_recently_solved_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get recently solved requests (statuses where count_as_solved is True, ordered by resolved_at DESC).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned (null BU).
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id.in_(solved_subquery),
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.resolved_at.desc().nullslast())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter (supports multiple IDs and -1 for unassigned)
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    # ============== NEW VIEW METHODS ==============

    @classmethod
    async def find_all_your_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get all requests ASSIGNED TO the current user (all statuses).
        This shows all tickets where the technician is an assignee.
        """
        # Subquery for user's assigned requests
        my_requests_subquery = select(RequestAssignee.request_id).where(
            RequestAssignee.assignee_id == user.id
        )

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.id.in_(my_requests_subquery),
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.created_at.desc())
        )

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_urgent_high_priority_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests with urgent (1) or high (2) priority that are not solved.
        """
        # Subquery to get solved status IDs
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        stmt = (
            select(ServiceRequest)
            .where(
                and_(
                    ServiceRequest.priority_id.in_([1, 2]),  # Critical=1, High=2
                    ServiceRequest.status_id.notin_(solved_subquery),
                    ServiceRequest.is_deleted.is_(False),
                )
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(
                ServiceRequest.priority_id.asc(), ServiceRequest.created_at.desc()
            )
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_pending_requester_response_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests with status 'pending-requester-response' (ID 7).
        """
        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id == 7,  # pending-requester-response
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_pending_subtask_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests that have at least one incomplete sub-task.
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        # Subquery to find parent request IDs with incomplete subtasks
        # Sub-tasks are identified by parent_task_id being NOT NULL
        incomplete_subtasks_subquery = (
            select(ServiceRequest.parent_task_id)
            .where(
                and_(
                    ServiceRequest.parent_task_id.isnot(None),  # This is a sub-task
                    ServiceRequest.is_deleted.is_(False),
                    ServiceRequest.status_id.notin_(solved_subquery),
                )
            )
            .distinct()
        )

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.id.in_(incomplete_subtasks_subquery),
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_new_today_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests created today (based on server timezone).
        """
        from datetime import datetime, date

        today_start = datetime.combine(date.today(), datetime.min.time())

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.created_at >= today_start,
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.created_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_in_progress_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests with status 'in-progress' (ID 8).
        """
        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id == 8,  # in-progress
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_all_tickets_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get all tickets (no status filter).
        """
        stmt = (
            select(ServiceRequest)
            .where(ServiceRequest.is_deleted.is_(False))
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    @classmethod
    async def find_all_solved_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_ids: list[int] | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get all tickets with a solved status (count_as_solved = True).
        """
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id.in_(solved_subquery),
                ServiceRequest.is_deleted.is_(False),
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.subcategory).selectinload(
                    Subcategory.category
                ),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply visibility filter
        visibility_filter = cls._get_visibility_filter(user)
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Apply business unit filter
        stmt = cls._apply_business_unit_filter(stmt, business_unit_ids)

        # Get total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        result = await db.execute(stmt)
        requests = list(result.scalars().all())

        return requests, total

    # ============== END NEW VIEW METHODS ==============

    @classmethod
    async def get_view_counts(
        cls, db: AsyncSession, user: User, business_unit_ids: list[int] | None = None
    ) -> Dict[str, int]:
        """
        Get counts for all views using a single optimized query.
        Returns dict with keys for all 11 views.

        **NOTE**: Counts include both parent tasks AND subtasks (no parent_task_id filtering).

        Args:
            business_unit_ids: Optional list of business unit IDs to filter. -1 = unassigned (null BU).
        """
        from datetime import datetime, date

        visibility_filter = cls._get_visibility_filter(user)

        # Subquery for solved statuses (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(RequestStatus.count_as_solved)

        # Subquery for assigned request IDs
        assigned_subquery = select(RequestAssignee.request_id).distinct()

        # Subquery for user's assigned requests
        my_requests_subquery = select(RequestAssignee.request_id).where(
            RequestAssignee.assignee_id == user.id
        )

        # Subquery for parent requests with incomplete subtasks (status not in solved statuses)
        # Sub-tasks are identified by parent_task_id being NOT NULL
        incomplete_subtasks_subquery = (
            select(ServiceRequest.parent_task_id)
            .where(
                and_(
                    ServiceRequest.parent_task_id.isnot(None),  # This is a sub-task
                    ServiceRequest.is_deleted.is_(False),
                    ServiceRequest.status_id.notin_(solved_subquery),
                )
            )
            .distinct()
        )

        # Today's date for new_today filter
        today_start = datetime.combine(date.today(), datetime.min.time())

        # Single query with CASE WHEN expressions to count all categories at once
        stmt = (
            select(
                # Existing views
                # Count unassigned: requests not in assigned_subquery
                func.count(
                    case((ServiceRequest.id.notin_(assigned_subquery), 1))
                ).label("unassigned"),
                # Count all unsolved: requests with status not in solved_subquery AND have assignees
                func.count(
                    case(
                        (
                            and_(
                                ServiceRequest.status_id.notin_(solved_subquery),
                                ServiceRequest.id.in_(assigned_subquery),
                            ),
                            1,
                        )
                    )
                ).label("all_unsolved"),
                # Count my unsolved: requests assigned to user AND not solved
                func.count(
                    case(
                        (
                            and_(
                                ServiceRequest.id.in_(my_requests_subquery),
                                ServiceRequest.status_id.notin_(solved_subquery),
                            ),
                            1,
                        )
                    )
                ).label("my_unsolved"),
                # Count recently updated: all requests
                func.count(ServiceRequest.id).label("recently_updated"),
                # Count recently solved: requests with status in solved_subquery
                func.count(
                    case((ServiceRequest.status_id.in_(solved_subquery), 1))
                ).label("recently_solved"),
                # New views
                # Count all_your_requests: requests ASSIGNED TO user (all statuses)
                func.count(
                    case((ServiceRequest.id.in_(my_requests_subquery), 1))
                ).label("all_your_requests"),
                # Count urgent_high_priority: priority 1 or 2 AND not solved
                func.count(
                    case(
                        (
                            and_(
                                ServiceRequest.priority_id.in_([1, 2]),
                                ServiceRequest.status_id.notin_(solved_subquery),
                            ),
                            1,
                        )
                    )
                ).label("urgent_high_priority"),
                # Count pending_requester_response: status_id = 7
                func.count(case((ServiceRequest.status_id == 7, 1))).label(
                    "pending_requester_response"
                ),
                # Count pending_subtask: requests with incomplete subtasks
                func.count(
                    case((ServiceRequest.id.in_(incomplete_subtasks_subquery), 1))
                ).label("pending_subtask"),
                # Count new_today: created today
                func.count(case((ServiceRequest.created_at >= today_start, 1))).label(
                    "new_today"
                ),
                # Count in_progress: status_id = 8
                func.count(case((ServiceRequest.status_id == 8, 1))).label(
                    "in_progress"
                ),
                # Count all_tickets: all tickets
                func.count(ServiceRequest.id).label("all_tickets"),
                # Count all_solved: all tickets with count_as_solved status
                func.count(
                    case((ServiceRequest.status_id.in_(solved_subquery), 1))
                ).label("all_solved"),
            )
            .select_from(ServiceRequest)
            .where(
                ServiceRequest.is_deleted.is_(
                    False
                )  # CRITICAL: Exclude deleted requests from all counts
            )
        )

        # NOTE: View navbar counts ALWAYS show user's total accessible BUs (region filter only)
        # The business_unit_ids parameter is ignored here - it's only used for tabs counts
        # Apply visibility filter to limit counts to user's accessible business units
        if visibility_filter is not None:
            stmt = stmt.where(visibility_filter)

        # Execute single query
        result = await db.execute(stmt)
        row = result.one()

        counts = {
            # Existing views
            "unassigned": row.unassigned or 0,
            "all_unsolved": row.all_unsolved or 0,
            "my_unsolved": row.my_unsolved or 0,
            "recently_updated": row.recently_updated or 0,
            "recently_solved": row.recently_solved or 0,
            # New views
            "all_your_requests": row.all_your_requests or 0,
            "urgent_high_priority": row.urgent_high_priority or 0,
            "pending_requester_response": row.pending_requester_response or 0,
            "pending_subtask": row.pending_subtask or 0,
            "new_today": row.new_today or 0,
            "in_progress": row.in_progress or 0,
            # Additional views
            "all_tickets": row.all_tickets or 0,
            "all_solved": row.all_solved or 0,
        }

        return counts

    @classmethod
    async def get_business_unit_counts(
        cls, db: AsyncSession, user: User, view: Optional[str] = None
    ) -> Tuple[List[Dict], int]:
        """
        Get ticket counts grouped by business unit.
        Shows ALL business units the user has access to (even with 0 count).
        Respects region filtering for the user.

        Args:
            view: Optional view filter to apply (e.g., 'all_unsolved', 'unassigned', etc.)
                  If None, counts all tickets.

        Returns tuple of (list of dicts with: id, name, count, unassigned_count)
        """
        from datetime import datetime, date

        # Determine which business units the user can see
        if user.is_super_admin:
            # Super admins see all business units
            bu_filter = None
        else:
            # Check if user has Admin role
            has_admin_role = any(
                ur.role and ur.role.name == "Admin"
                for ur in user.user_roles
                if ur.is_active and not ur.is_deleted
            )

            if has_admin_role:
                # Admin role users see all business units
                bu_filter = None
            else:
                # Check for section assignments
                active_section_assigns = [
                    sa for sa in user.section_assigns if not sa.is_deleted
                ]

                if not active_section_assigns:
                    # No section assignments - return empty
                    return [], 0

                # Check for business unit assignments (geographic narrowing)
                active_bu_assigns = [
                    ba
                    for ba in user.business_unit_assigns
                    if ba.is_active and not ba.is_deleted
                ]

                if active_bu_assigns:
                    # User has explicit business unit assignments
                    # Show only their assigned business units (not all BUs in the region)
                    assigned_bu_ids = [ba.business_unit_id for ba in active_bu_assigns]
                    bu_filter = BusinessUnit.id.in_(assigned_bu_ids)
                else:
                    # No BU assignments - show all BUs (section filter is applied separately)
                    bu_filter = None

        # Build view-specific filter conditions for ServiceRequest
        view_conditions = [ServiceRequest.is_deleted.is_(False)]

        if view:
            # Subquery for solved statuses (where count_as_solved = True)
            solved_subquery = select(RequestStatus.id).where(
                RequestStatus.count_as_solved
            )

            # Subquery for assigned request IDs
            assigned_subquery = select(RequestAssignee.request_id).distinct()

            # Subquery for user's assigned requests
            my_requests_subquery = select(RequestAssignee.request_id).where(
                RequestAssignee.assignee_id == user.id
            )

            # Subquery for parent requests with incomplete subtasks
            incomplete_subtasks_subquery = (
                select(ServiceRequest.parent_task_id)
                .where(
                    and_(
                        ServiceRequest.parent_task_id.isnot(None),
                        ServiceRequest.is_deleted.is_(False),
                        ServiceRequest.status_id.notin_(solved_subquery),
                    )
                )
                .distinct()
            )

            today_start = datetime.combine(date.today(), datetime.min.time())

            # Apply view-specific filters
            if view == "unassigned":
                view_conditions.append(ServiceRequest.id.notin_(assigned_subquery))
            elif view == "all_unsolved":
                view_conditions.append(ServiceRequest.status_id.notin_(solved_subquery))
                view_conditions.append(ServiceRequest.id.in_(assigned_subquery))
            elif view == "my_unsolved":
                view_conditions.append(ServiceRequest.id.in_(my_requests_subquery))
                view_conditions.append(ServiceRequest.status_id.notin_(solved_subquery))
            elif view == "recently_updated":
                pass  # No additional filter - all requests
            elif view == "recently_solved":
                view_conditions.append(ServiceRequest.status_id.in_(solved_subquery))
            elif view == "all_your_requests":
                view_conditions.append(ServiceRequest.id.in_(my_requests_subquery))
            elif view == "urgent_high_priority":
                view_conditions.append(ServiceRequest.priority_id.in_([1, 2]))
                view_conditions.append(ServiceRequest.status_id.notin_(solved_subquery))
            elif view == "pending_requester_response":
                view_conditions.append(ServiceRequest.status_id == 7)
            elif view == "pending_subtask":
                view_conditions.append(
                    ServiceRequest.id.in_(incomplete_subtasks_subquery)
                )
            elif view == "new_today":
                view_conditions.append(ServiceRequest.created_at >= today_start)
            elif view == "in_progress":
                view_conditions.append(ServiceRequest.status_id == 8)
            elif view == "all_tickets":
                pass  # No filter - all tickets
            elif view == "all_solved":
                view_conditions.append(ServiceRequest.status_id.in_(solved_subquery))

        # Build join condition with view filters
        join_condition = and_(
            ServiceRequest.business_unit_id == BusinessUnit.id, *view_conditions
        )

        # Query to get ALL business units user can access with LEFT JOIN to get counts
        stmt = (
            select(
                BusinessUnit.id,
                BusinessUnit.name,
                func.count(ServiceRequest.id).label("count"),
            )
            .outerjoin(ServiceRequest, join_condition)
            .where(
                BusinessUnit.is_active.is_(True),
                BusinessUnit.is_deleted.is_(False),
            )
            .group_by(BusinessUnit.id, BusinessUnit.name)
            .order_by(func.count(ServiceRequest.id).desc(), BusinessUnit.name)
        )

        # Apply business unit filter
        if bu_filter is not None:
            stmt = stmt.where(bu_filter)

        result = await db.execute(stmt)
        rows = result.all()

        # Get count of unassigned requests (where business_unit_id is NULL)
        # Use the same region filter logic for requests
        visibility_filter = cls._get_visibility_filter(user)
        unassigned_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.business_unit_id.is_(None),
            *view_conditions,  # Apply view filters to unassigned count too
        )
        if visibility_filter is not None:
            unassigned_stmt = unassigned_stmt.where(visibility_filter)

        unassigned_result = await db.execute(unassigned_stmt)
        unassigned_count = unassigned_result.scalar() or 0

        business_units = [
            {"id": row.id, "name": row.name, "count": row.count} for row in rows
        ]

        return business_units, unassigned_count

    @classmethod
    async def get_ticket_type_counts(
        cls, db: AsyncSession, user: User
    ) -> Dict[str, int]:
        """
        Get global ticket type counts (not filtered by view).

        Returns counts for:
        - all: Total tickets accessible to user
        - parents: Parent tasks (requests without parent_task_id)
        - subtasks: Subtasks (requests with parent_task_id)

        Respects user's region/business unit filtering permissions.
        """
        # Get region filter for the user
        visibility_filter = cls._get_visibility_filter(user)

        # Base query with region filter
        base_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.is_deleted.is_(False)
        )
        if visibility_filter is not None:
            base_stmt = base_stmt.where(visibility_filter)

        # Count all tickets
        all_result = await db.execute(base_stmt)
        all_count = all_result.scalar() or 0

        # Count parent tasks (no parent_task_id)
        parent_stmt = base_stmt.where(ServiceRequest.parent_task_id.is_(None))
        parent_result = await db.execute(parent_stmt)
        parent_count = parent_result.scalar() or 0

        # Count subtasks (has parent_task_id)
        subtask_stmt = base_stmt.where(ServiceRequest.parent_task_id.isnot(None))
        subtask_result = await db.execute(subtask_stmt)
        subtask_count = subtask_result.scalar() or 0

        return {
            "all": all_count,
            "parents": parent_count,
            "subtasks": subtask_count,
        }
