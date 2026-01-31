"""
Service Request CRUD for database operations.

Handles all database queries related to service requests with business unit region filtering.
"""
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, case, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import (
    BusinessUnit,
    ChatMessage,
    RequestAssignee,
    RequestStatus,
    ServiceRequest,
    Subcategory,
    Tag,
    User,
)
from crud.base_repository import BaseCRUD


class ServiceRequestCRUD(BaseCRUD[ServiceRequest]):
    """CRUD for ServiceRequest database operations with region filtering."""

    model = ServiceRequest

    @classmethod
    async def find_by_id(
        cls, db: AsyncSession, request_id: UUID
    ) -> Optional[ServiceRequest]:
        """Find service request by ID with relationships loaded."""
        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                not ServiceRequest.is_deleted
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
    def _get_region_filter(cls, user: User):
        """
        Get business unit region filter for requests.

        Priority order:
        1. Super admins and users with 'Admin' role see all requests
        2. Users with business unit assignments see requests from ALL business units in the same region(s)
           (e.g., if assigned to BU "SMH" in Region "Egypt", they see ALL BUs in "Egypt" region)
        3. Users with region assignments see requests from all business units in those regions
        4. Users with business_unit_region_id see requests from that region
        5. No assignments = no results
        """
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

        # PRIORITY 1: Check for business unit assignments (NEW - technicians assigned to BUs)
        active_bu_assigns = [
            ba for ba in user.business_unit_assigns
            if ba.is_active and not ba.is_deleted
        ]

        if active_bu_assigns:
            # User has explicit business unit assignments
            # Show only requests from the agent's directly assigned business units
            assigned_bu_ids = [ba.business_unit_id for ba in active_bu_assigns]
            return ServiceRequest.business_unit_id.in_(assigned_bu_ids)

        # PRIORITY 2: Check for region assignments via RegionUserAssign table
        active_region_assigns = [
            ra for ra in user.region_assigns
            if ra.is_active and not ra.is_deleted
        ]

        if active_region_assigns:
            # User has explicit region assignments - filter by all assigned regions
            assigned_region_ids = [ra.region_id for ra in active_region_assigns]
            return ServiceRequest.business_unit_id.in_(
                select(BusinessUnit.id).where(
                    BusinessUnit.business_unit_region_id.in_(assigned_region_ids)
                )
            )

        # PRIORITY 3: Fall back to single business_unit_region_id if no explicit assigns
        if user.business_unit_region_id:
            return ServiceRequest.business_unit_id.in_(
                select(BusinessUnit.id).where(
                    BusinessUnit.business_unit_region_id == user.business_unit_region_id
                )
            )

        # User has no region assigned - return empty filter (no results)
        return ServiceRequest.id.is_(None)

    @classmethod
    async def build_view_base_query(
        cls,
        user: User,
        view_type: str,
        business_unit_id: Optional[int] = None,
    ):
        """
        Build base query for a view WITHOUT eager loading (for counting).

        This replicates the filter logic from find_* methods but excludes
        selectinload options to enable efficient COUNT queries.

        Args:
            user: Current user (for region filtering)
            view_type: View type (unassigned, all_unsolved, etc.)
            business_unit_id: Optional filter

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
                ~assigned_exists,
                not ServiceRequest.is_deleted
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
                not ServiceRequest.is_deleted,
                assigned_exists
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
                    not ServiceRequest.is_deleted
                )
            )

        elif view_type in ("recently_updated", "recently_solved", "all_your_requests",
                          "urgent_high_priority", "pending_requester_response",
                          "pending_subtask", "new_today", "in_progress"):
            # For other views, use a simpler base (they all have similar structure)
            # This is a fallback - specific logic can be added per view if needed
            stmt = select(ServiceRequest).where(not ServiceRequest.is_deleted)

            # Add view-specific filters
            if view_type == "recently_solved":
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
                ~assigned_exists,
                not ServiceRequest.is_deleted
            )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

        return stmt

    @classmethod
    async def find_unassigned_requests(
        cls,
        db: AsyncSession,
        user: User,
        *,
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get unassigned requests (no RequestAssignee records).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
        """
        # Use NOT EXISTS for better performance vs NOT IN
        assigned_exists = exists(
            select(1).where(RequestAssignee.request_id == ServiceRequest.id)
        )

        # Base query
        stmt = (
            select(ServiceRequest)
            .where(
                ~assigned_exists,
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            # Filter for unassigned (null business_unit_id)
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            # Filter for specific business unit
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

        # Order by created_at DESC
        stmt = stmt.order_by(ServiceRequest.created_at.desc())

        # Get total count
        count_stmt = select(func.count()).select_from(
            stmt.subquery()
        )
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
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get all unsolved requests (statuses where count_as_solved is False) that have at least one assignee.
        Excludes unassigned requests (use find_unassigned_requests for those).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(
            RequestStatus.count_as_solved
        )

        # Use EXISTS for better performance vs IN
        assigned_exists = exists(
            select(1).where(RequestAssignee.request_id == ServiceRequest.id)
        )

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id.notin_(solved_subquery),
                not ServiceRequest.is_deleted,
                assigned_exists  # Only requests with assignees
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            # Filter for unassigned (null business_unit_id)
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            # Filter for specific business unit
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests assigned to current user that are not solved/closed.
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(
            RequestStatus.count_as_solved
        )

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
                    not ServiceRequest.is_deleted
                )
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            # Filter for unassigned (null business_unit_id)
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            # Filter for specific business unit
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get recently updated requests (ordered by updated_at DESC).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
        """
        stmt = (
            select(ServiceRequest)
            .where(not ServiceRequest.is_deleted)
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            # Filter for unassigned (null business_unit_id)
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            # Filter for specific business unit
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get recently solved requests (statuses where count_as_solved is True, ordered by resolved_at DESC).
        Filtered by user's business unit region unless admin/super_admin.

        Args:
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(
            RequestStatus.count_as_solved
        )

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.status_id.in_(solved_subquery),
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.resolved_at.desc().nullslast())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            # Filter for unassigned (null business_unit_id)
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            # Filter for specific business unit
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
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
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.created_at.desc())
        )

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests with urgent (1) or high (2) priority that are not solved.
        """
        # Subquery to get solved status IDs
        solved_subquery = select(RequestStatus.id).where(
            RequestStatus.count_as_solved
        )

        stmt = (
            select(ServiceRequest)
            .where(
                and_(
                    ServiceRequest.priority_id.in_([1, 2]),  # Critical=1, High=2
                    ServiceRequest.status_id.notin_(solved_subquery),
                    not ServiceRequest.is_deleted
                )
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.priority_id.asc(), ServiceRequest.created_at.desc())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
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
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get requests that have at least one incomplete sub-task.
        """
        # Subquery to get solved status IDs (where count_as_solved = True)
        solved_subquery = select(RequestStatus.id).where(
            RequestStatus.count_as_solved
        )

        # Subquery to find parent request IDs with incomplete subtasks
        # Sub-tasks are identified by parent_task_id being NOT NULL
        incomplete_subtasks_subquery = (
            select(ServiceRequest.parent_task_id)
            .where(
                and_(
                    ServiceRequest.parent_task_id.isnot(None),  # This is a sub-task
                    not ServiceRequest.is_deleted,
                    ServiceRequest.status_id.notin_(solved_subquery),
                )
            )
            .distinct()
        )

        stmt = (
            select(ServiceRequest)
            .where(
                ServiceRequest.id.in_(incomplete_subtasks_subquery),
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
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
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.created_at.desc())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        business_unit_id: Optional[int] = None,
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
                not ServiceRequest.is_deleted
            )
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.business_unit),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .order_by(ServiceRequest.updated_at.desc())
        )

        # Apply region filter
        region_filter = cls._get_region_filter(user)
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter
        if business_unit_id == -1:
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
        cls, db: AsyncSession, user: User, business_unit_id: Optional[int] = None
    ) -> Dict[str, int]:
        """
        Get counts for all views using a single optimized query.
        Returns dict with keys for all 11 views.

        **NOTE**: Counts include both parent tasks AND subtasks (no parent_task_id filtering).

        Args:
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
        """
        from datetime import datetime, date

        region_filter = cls._get_region_filter(user)

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

        # Subquery for parent requests with incomplete subtasks (status not in solved statuses)
        # Sub-tasks are identified by parent_task_id being NOT NULL
        incomplete_subtasks_subquery = (
            select(ServiceRequest.parent_task_id)
            .where(
                and_(
                    ServiceRequest.parent_task_id.isnot(None),  # This is a sub-task
                    not ServiceRequest.is_deleted,
                    ServiceRequest.status_id.notin_(solved_subquery),
                )
            )
            .distinct()
        )

        # Today's date for new_today filter
        today_start = datetime.combine(date.today(), datetime.min.time())

        # Single query with CASE WHEN expressions to count all categories at once
        stmt = select(
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
                            ServiceRequest.id.in_(assigned_subquery)
                        ),
                        1
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
            func.count(
                case((ServiceRequest.status_id == 7, 1))
            ).label("pending_requester_response"),
            # Count pending_subtask: requests with incomplete subtasks
            func.count(
                case((ServiceRequest.id.in_(incomplete_subtasks_subquery), 1))
            ).label("pending_subtask"),
            # Count new_today: created today
            func.count(
                case((ServiceRequest.created_at >= today_start, 1))
            ).label("new_today"),
            # Count in_progress: status_id = 8
            func.count(
                case((ServiceRequest.status_id == 8, 1))
            ).label("in_progress"),
        ).select_from(ServiceRequest).where(
            not ServiceRequest.is_deleted  # CRITICAL: Exclude deleted requests from all counts
        )

        # Apply region filter to all counts
        if region_filter is not None:
            stmt = stmt.where(region_filter)

        # Apply business unit filter (same logic as individual view methods)
        if business_unit_id == -1:
            # Filter for unassigned (null business_unit_id)
            stmt = stmt.where(ServiceRequest.business_unit_id.is_(None))
        elif business_unit_id is not None and business_unit_id > 0:
            # Filter for specific business unit
            stmt = stmt.where(ServiceRequest.business_unit_id == business_unit_id)

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
                # PRIORITY 1: Check for business unit assignments
                active_bu_assigns = [
                    ba for ba in user.business_unit_assigns
                    if ba.is_active and not ba.is_deleted
                ]

                if active_bu_assigns:
                    # User has explicit business unit assignments
                    # Find ALL business units in the same regions as the assigned BUs
                    # This allows technicians to see counts for ALL BUs in their region
                    assigned_bu_ids = [ba.business_unit_id for ba in active_bu_assigns]

                    # Get regions of assigned business units
                    region_ids_subquery = select(BusinessUnit.business_unit_region_id).where(
                        BusinessUnit.id.in_(assigned_bu_ids),
                        BusinessUnit.business_unit_region_id.is_not(None)
                    ).distinct()

                    # Show all BUs in those regions
                    bu_filter = BusinessUnit.business_unit_region_id.in_(region_ids_subquery)
                else:
                    # PRIORITY 2: Check for region assignments
                    active_region_assigns = [
                        ra for ra in user.region_assigns
                        if ra.is_active and not ra.is_deleted
                    ]

                    if active_region_assigns:
                        # User has explicit region assignments
                        assigned_region_ids = [ra.region_id for ra in active_region_assigns]
                        bu_filter = BusinessUnit.business_unit_region_id.in_(assigned_region_ids)
                    elif user.business_unit_region_id:
                        # PRIORITY 3: Fall back to single business_unit_region_id
                        bu_filter = BusinessUnit.business_unit_region_id == user.business_unit_region_id
                    else:
                        # User has no assignments - return empty
                        return [], 0

        # Build view-specific filter conditions for ServiceRequest
        view_conditions = [not ServiceRequest.is_deleted]

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
                        not ServiceRequest.is_deleted,
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
                view_conditions.append(ServiceRequest.id.in_(incomplete_subtasks_subquery))
            elif view == "new_today":
                view_conditions.append(ServiceRequest.created_at >= today_start)
            elif view == "in_progress":
                view_conditions.append(ServiceRequest.status_id == 8)

        # Build join condition with view filters
        join_condition = and_(
            ServiceRequest.business_unit_id == BusinessUnit.id,
            *view_conditions
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
                BusinessUnit.is_active,
                not BusinessUnit.is_deleted,
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
        region_filter = cls._get_region_filter(user)
        unassigned_stmt = select(func.count(ServiceRequest.id)).where(
            ServiceRequest.business_unit_id.is_(None),
            *view_conditions  # Apply view filters to unassigned count too
        )
        if region_filter is not None:
            unassigned_stmt = unassigned_stmt.where(region_filter)

        unassigned_result = await db.execute(unassigned_stmt)
        unassigned_count = unassigned_result.scalar() or 0

        business_units = [
            {"id": row.id, "name": row.name, "count": row.count}
            for row in rows
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
        region_filter = cls._get_region_filter(user)

        # Base query with region filter
        base_stmt = select(func.count(ServiceRequest.id)).where(
            not ServiceRequest.is_deleted
        )
        if region_filter is not None:
            base_stmt = base_stmt.where(region_filter)

        # Count all tickets
        all_result = await db.execute(base_stmt)
        all_count = all_result.scalar() or 0

        # Count parent tasks (no parent_task_id)
        parents_stmt = base_stmt.where(ServiceRequest.parent_task_id.is_(None))
        parents_result = await db.execute(parents_stmt)
        parents_count = parents_result.scalar() or 0

        # Count subtasks (has parent_task_id)
        subtasks_stmt = base_stmt.where(ServiceRequest.parent_task_id.isnot(None))
        subtasks_result = await db.execute(subtasks_stmt)
        subtasks_count = subtasks_result.scalar() or 0

        return {
            "all": all_count,
            "parents": parents_count,
            "subtasks": subtasks_count,
        }

    @classmethod
    async def get_last_message_for_request(
        cls, db: AsyncSession, request_id: UUID
    ) -> Optional[ChatMessage]:
        """Get the most recent chat message for a request."""
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.request_id == request_id)
            .options(selectinload(ChatMessage.sender))
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def get_last_messages_for_requests(
        cls, db: AsyncSession, request_ids: List[UUID]
    ) -> Dict[UUID, Optional[ChatMessage]]:
        """
        Get the most recent chat message for multiple requests.
        Returns dict mapping request_id -> ChatMessage.
        """
        if not request_ids:
            return {}

        # Subquery to get the latest message ID for each request
        latest_msg_subquery = (
            select(
                ChatMessage.request_id,
                func.max(ChatMessage.created_at).label("max_created_at"),
            )
            .where(ChatMessage.request_id.in_(request_ids))
            .group_by(ChatMessage.request_id)
            .subquery()
        )

        # Get the actual messages
        stmt = (
            select(ChatMessage)
            .join(
                latest_msg_subquery,
                and_(
                    ChatMessage.request_id == latest_msg_subquery.c.request_id,
                    ChatMessage.created_at
                    == latest_msg_subquery.c.max_created_at,
                ),
            )
            .options(selectinload(ChatMessage.sender))
        )

        result = await db.execute(stmt)
        messages = result.scalars().all()

        # Build dict
        message_dict: Dict[UUID, Optional[ChatMessage]] = {
            req_id: None for req_id in request_ids
        }
        for msg in messages:
            message_dict[msg.request_id] = msg

        return message_dict

    @classmethod
    async def check_existing_assignment(
        cls, db: AsyncSession, request_id: UUID, user_id: int
    ) -> Optional[RequestAssignee]:
        """
        Check if a user is already assigned to a request.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User ID to check

        Returns:
            RequestAssignee record if found, None otherwise
        """
        stmt = (
            select(RequestAssignee)
            .where(
                and_(
                    RequestAssignee.request_id == request_id,
                    RequestAssignee.assignee_id == user_id,
                )
            )
            .options(selectinload(RequestAssignee.assignee))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def create_assignment(
        cls,
        db: AsyncSession,
        request_id: UUID,
        user_id: int,
        assigned_by: int,
    ) -> RequestAssignee:
        """
        Create a new user-request assignment.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User ID to assign
            assigned_by: User ID who made the assignment

        Returns:
            Created RequestAssignee record
        """
        assignment = RequestAssignee(
            request_id=request_id,
            assignee_id=user_id,
            assigned_by=assigned_by,
        )
        db.add(assignment)
        await db.flush()
        await db.refresh(assignment)
        return assignment

    @classmethod
    async def get_request_assignees(
        cls, db: AsyncSession, request_id: UUID
    ) -> List[RequestAssignee]:
        """
        Get all assignees for a specific request.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            List of RequestAssignee records with user and assigner loaded
        """
        # Build the base query
        stmt = (
            select(RequestAssignee)
            .options(
                selectinload(RequestAssignee.assignee),
                selectinload(RequestAssignee.assigner),
            )
            .where(RequestAssignee.request_id == request_id)
            .order_by(RequestAssignee.created_at.desc())
        )

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def delete_assignment(
        cls, db: AsyncSession, request_id: UUID, user_id: int
    ) -> bool:
        """
        Delete a user-request assignment.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User ID to unassign

        Returns:
            True if assignment was deleted, False if not found
        """
        assignment = await cls.check_existing_assignment(
            db, request_id, user_id
        )
        if assignment:
            await db.delete(assignment)
            await db.commit()
            return True
        return False

    @classmethod
    async def count_assignees(
        cls, db: AsyncSession, request_id: UUID
    ) -> int:
        """
        Count the number of assignees for a request.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            Count of assignees for the request
        """
        stmt = (
            select(func.count(RequestAssignee.id))
            .where(RequestAssignee.request_id == request_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one()
