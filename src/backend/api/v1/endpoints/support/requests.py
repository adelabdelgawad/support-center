"""
Service Request API endpoints with performance optimizations.

This module provides endpoints for managing service requests (tickets), including:
- CRUD operations for service requests
- Technician views for filtering and assigning tickets
- Assignment/unassignment of technicians
- Sub-task management
- Screenshot linking
- Ticket lifecycle management (status changes, resolution)

**Refactored:** All "agent" references renamed to "technician" throughout.

**Authentication:** Most endpoints require authentication. Some require specific roles:
- Requester: Can create and view their own requests
- Technician: Can view, update, and assign requests
- Supervisor: Can delete requests and view statistics
"""

import logging
from typing import List, Optional
from uuid import UUID

from db.database import get_session
from core.dependencies import _get_user_with_roles, get_client_ip, get_current_user, require_supervisor, require_technician
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from db.models import User
from api.schemas import (
    AssignTechnicianRequest,
    ServiceRequestCreateByRequester,
    ServiceRequestDetailRead,
    ServiceRequestList,
    ServiceRequestRead,
    ServiceRequestStats,
    ServiceRequestUpdate,
    ServiceRequestUpdateByTechnician,
    SubTaskCreate,
)
from api.schemas.service_request import (
    AssigneeInfo,
    RequestAssigneesResponse,
)
from api.schemas.technician_views import (
    BusinessUnitCount,
    BusinessUnitCountsResponse,
    BusinessUnitInfo,
    CategoryInfo,
    LastMessageInfo,
    PriorityInfo,
    RequesterInfo,
    StatusInfo,
    SubcategoryInfo,
    TagInfo,
    TechnicianRequestListItem,
    TechnicianViewsResponse,
    TicketTypeCounts,
)
from api.services.request_service import RequestService
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=ServiceRequestRead, status_code=201)
async def create_request(
    request_data: ServiceRequestCreateByRequester,
    http_request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new service request (ticket).

    **Minimal creation flow for requesters:**
    Requesters only need to provide a title. The system auto-populates:
    - Requester ID (from authenticated user)
    - IP address (from request headers)
    - Business unit (matched from IP network CIDR)
    - Priority (defaults to Medium)
    - Status (defaults to Open/Pending)

    **Workflow:**
    1. Create request with minimal data
    2. Trigger new_request system message (adds automated chat message)
    3. Broadcast new ticket via SignalR to technicians

    **Permission:** Authenticated users (any role)

    **Args:**
        request_data: Request data (only title required)
        http_request: FastAPI Request object for IP extraction
        db: Database session
        current_user: Authenticated user (auto-injected from JWT)

    **Returns:**
        Created service request with ID, status, priority, and timestamps

    **Raises:**
        HTTPException 400: Validation error

    **Notes:**
        - Technician will fill in description and other details later
        - Business unit is auto-matched from IP address network CIDR
        - SignalR broadcast failures are logged but don't prevent creation
    """
    client_ip = get_client_ip(http_request)

    # Service handles creation + event triggering + SignalR broadcasting
    request = await RequestService.create_service_request_by_requester(
        db=db,
        request_data=request_data,
        requester_id=current_user.id,
        client_ip=client_ip,
    )

    return request


@router.get("", response_model=ServiceRequestList)
async def list_requests(
    response: Response,
    status_id: Optional[int] = None,
    category_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    requester_view: bool = Query(
        False, description="If true, only show requests with statuses visible to requesters"
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List service requests with filtering and pagination.

    **General-purpose endpoint** for listing requests. For technician-specific
    views with optimized filtering, use `/technician-views` instead.

    **Query Parameters:**
    - status_id: Filter by request status ID
    - category_id: Filter by category ID
    - page: Page number (1-indexed, default: 1)
    - per_page: Items per page (default: 20, max: 100)
    - requester_view: If true, only show statuses visible to requesters

    **Response Headers:**
    - X-Total-Count: Total number of requests matching filter
    - X-Page: Current page number
    - X-Per-Page: Items per page
    - X-Total-Pages: Total number of pages

    **Permission:** Authenticated users

    **Returns:**
        Paginated list of service requests with metadata

    **Notes:**
        - Order: Most recently updated first
        - Use requester_view=true for employee-facing ticket lists
    """
    items, total = await RequestService.get_service_requests(
        db=db,
        status_id=status_id,
        category_id=category_id,
        page=page,
        per_page=per_page,
        requester_view=requester_view,
    )

    # Calculate pagination info
    pages = (total + per_page - 1) // per_page

    # Add pagination headers
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(per_page)
    response.headers["X-Total-Pages"] = str(pages)

    return ServiceRequestList(
        items=items, total=total, page=page, per_page=per_page, pages=pages
    )


@router.get("/stats", response_model=ServiceRequestStats)
async def get_request_statistics(
    technician_id: Optional[int] = None,
    category_id: Optional[int] = None,
    priority_id: Optional[int] = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_supervisor),
):
    """
    Get request statistics for dashboard and reporting.

    **Aggregated metrics** for supervisor dashboard and analytics.

    **Query Parameters:**
    - technician_id: Filter stats for specific technician
    - category_id: Filter stats for specific category
    - priority_id: Filter stats for specific priority

    **Returns:**
        Statistics object with:
        - Total requests
        - Requests by status
        - Requests by priority
        - Requests by category
        - Average resolution time
        - SLA compliance metrics

    **Permission:** Supervisors only (require_supervisor)

    **Raises:**
        HTTPException 403: Non-supervisor attempts access
    """
    stats = await RequestService.get_service_request_stats(
        db=db, category_id=category_id, priority_id=priority_id
    )
    return stats


@router.get("/technician-views", response_model=TechnicianViewsResponse)
async def get_technician_views(
    view: str = Query(
        "unassigned",
        description="View type: unassigned, all_unsolved, my_unsolved, recently_updated, recently_solved, all_your_requests, urgent_high_priority, pending_requester_response, pending_subtask, new_today, in_progress",
    ),
    business_unit_id: int | None = Query(
        None,
        description="Optional business unit ID to filter by. Use -1 to show only unassigned requests.",
    ),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get service requests for technician views with filtering and optimization.

    **Primary endpoint for technician ticket queue.** Optimized for performance
    with sequential execution and reduced latency (~1.5-2s vs ~4-5s).

    **View Types:**
    - **unassigned**: Requests with no assigned technician
    - **all_unsolved**: All requests not in Solved/Closed status
    - **my_unsolved**: Current user's assigned unsolved requests
    - **recently_updated**: All requests ordered by update time (newest first)
    - **recently_solved**: Requests with Solved status
    - **all_your_requests**: All requests assigned to current user (any status)
    - **urgent_high_priority**: High/Critical priority unsolved requests
    - **pending_requester_response**: Waiting for requester reply
    - **pending_subtask**: Requests with incomplete sub-tasks
    - **new_today**: Requests created today
    - **in_progress**: Requests with "in progress" status

    **Business Unit Filtering:**
    - business_unit_id=<id>: Filter to specific business unit
    - business_unit_id=-1: Show only unassigned requests (null business_unit_id)
    - No filter: Show all requests (respecting region permissions)

    **Region Authorization:**
    - Super admins (is_super_admin=True): See ALL requests
    - Users with 'Admin' role: See ALL requests
    - Other users: See only requests from their business_unit_region

    **Returns:**
        - data: List of requests with status, requester, priority, business unit, last message
        - counts: Counts for all view types (for sidebar navigation)
        - filter_counts: All/Parents/Subtasks counts for current view
        - total: Total count for current view
        - page/per_page: Pagination info

    **Performance Optimizations:**
    - Sequential DB operations (asyncpg limitation)
    - Eager loading of relationships
    - Reduced N+1 queries with batch loading

    **Permission:** Technicians only (require_technician)

    **Raises:**
        HTTPException 400: Invalid view type
    """
    # Validate view type
    valid_views = [
        # Existing views
        "unassigned",
        "all_unsolved",
        "my_unsolved",
        "recently_updated",
        "recently_solved",
        # New views
        "all_your_requests",
        "urgent_high_priority",
        "pending_requester_response",
        "pending_subtask",
        "new_today",
        "in_progress",
    ]
    if view not in valid_views:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid view type. Must be one of: {', '.join(valid_views)}",
        )

    # Get requests for the specified view (MUST complete first to get request_ids)
    requests, total = await RequestService.get_technician_view_requests(
        db=db,
        user=current_user,
        view_type=view,
        business_unit_id=business_unit_id,
        page=page,
        per_page=per_page,
    )

    # Execute sequentially - asyncpg doesn't support concurrent operations on the same session
    from crud.service_request_crud import ServiceRequestCRUD
    from crud.chat_crud import ChatMessageCRUD

    request_ids = [req.id for req in requests]

    counts_dict = await RequestService.get_technician_view_counts(db, current_user, business_unit_id)
    last_messages_dict = await ServiceRequestCRUD.get_last_messages_for_requests(db, request_ids)
    requester_unread_dict = await ChatMessageCRUD.check_requester_unread_for_requests(db, request_ids)
    technician_unread_dict = await ChatMessageCRUD.check_technician_unread_for_requests(db, request_ids)
    filter_counts_dict = await RequestService.get_view_filter_counts(db, current_user, view, business_unit_id)

    # Build response items
    items = []
    for req in requests:
        # Get last message for this request
        last_msg = last_messages_dict.get(req.id)
        last_message_info = None
        if last_msg:
            last_message_info = LastMessageInfo(
                content=last_msg.content,
                sender_name=last_msg.sender.full_name if last_msg.sender else None,
                created_at=last_msg.created_at,
                sequence_number=last_msg.sequence_number,
            )

        # Build item
        from api.schemas.technician_views import (
            StatusInfo,
            RequesterInfo,
            PriorityInfo,
            BusinessUnitInfo,
            TagInfo,
            CategoryInfo,
            SubcategoryInfo,
        )

        # Build business unit info if available
        business_unit_info = None
        if req.business_unit:
            business_unit_info = BusinessUnitInfo(
                id=req.business_unit.id,
                name=req.business_unit.name,
            )

        # Build tag info if available
        tag_info = None
        if req.tag:
            tag_info = TagInfo(
                id=req.tag.id,
                name_en=req.tag.name_en,
                name_ar=req.tag.name_ar,
            )

        # Build category info from tag if available
        category_info = None
        if req.tag and req.tag.category:
            category_info = CategoryInfo(
                id=req.tag.category.id,
                name=req.tag.category.name,
                name_en=req.tag.category.name_en,
                name_ar=req.tag.category.name_ar,
            )

        # Build subcategory info if available
        subcategory_info = None
        if req.subcategory:
            subcategory_info = SubcategoryInfo(
                id=req.subcategory.id,
                name=req.subcategory.name,
                name_en=req.subcategory.name_en,
                name_ar=req.subcategory.name_ar,
            )

        item = TechnicianRequestListItem(
            id=req.id,
            status=StatusInfo(
                id=req.status.id,
                name=req.status.name,
                color=req.status.color,
                count_as_solved=req.status.count_as_solved,
            ),
            subject=req.title,  # ServiceRequest has 'title' field
            requester=RequesterInfo(
                id=req.requester.id,
                full_name=req.requester.full_name,
            ),
            requested=req.created_at,
            due_date=req.due_date,  # SLA-based due date
            priority=PriorityInfo(
                id=req.priority.id,
                name=req.priority.name,
                response_time_minutes=req.priority.response_time_minutes,
                resolution_time_hours=req.priority.resolution_time_hours,
            ),
            business_unit=business_unit_info,
            last_message=last_message_info,
            tag=tag_info,
            category=category_info,
            subcategory=subcategory_info,
            requester_has_unread=requester_unread_dict.get(req.id, False),
            technician_has_unread=technician_unread_dict.get(req.id, False),
            # Sub-task fields
            parent_task_id=req.parent_task_id,
            is_blocked=req.is_blocked,
            assigned_to_section_id=req.assigned_to_section_id,
            assigned_to_technician_id=req.assigned_to_technician_id,
            completed_at=req.completed_at,
            estimated_hours=req.estimated_hours,
        )
        items.append(item)

    # Build counts response
    from api.schemas.technician_views import ViewCounts

    counts = ViewCounts(
        # Existing views
        unassigned=counts_dict.get("unassigned", 0),
        all_unsolved=counts_dict.get("all_unsolved", 0),
        my_unsolved=counts_dict.get("my_unsolved", 0),
        recently_updated=counts_dict.get("recently_updated", 0),
        recently_solved=counts_dict.get("recently_solved", 0),
        # New views
        all_your_requests=counts_dict.get("all_your_requests", 0),
        urgent_high_priority=counts_dict.get("urgent_high_priority", 0),
        pending_requester_response=counts_dict.get("pending_requester_response", 0),
        pending_subtask=counts_dict.get("pending_subtask", 0),
        new_today=counts_dict.get("new_today", 0),
        in_progress=counts_dict.get("in_progress", 0),
    )

    # Build filter counts response
    filter_counts = TicketTypeCounts(
        all=filter_counts_dict.get("all", 0),
        parents=filter_counts_dict.get("parents", 0),
        subtasks=filter_counts_dict.get("subtasks", 0),
    )

    # Build response object
    response_data = TechnicianViewsResponse(
        data=items,
        counts=counts,
        filter_counts=filter_counts,
        total=total,
        page=page,
        per_page=per_page,
    )

    return response_data


@router.get("/technician-views/counts", response_model=dict)
async def get_technician_views_counts_only(
    view: str = Query(
        "unassigned",
        description="View type to get counts for",
    ),
    business_unit_id: int | None = Query(
        None,
        description="Optional business unit ID to filter by. Use -1 to show only unassigned requests.",
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Lightweight endpoint that returns only counts without fetching full request data.

    **Performance optimization** for frontend when only counts are needed
    (e.g., perPage=1 requests). ~95% faster than full endpoint.

    **Query Parameters:**
    - view: View type (same as /technician-views)
    - business_unit_id: Optional business unit filter

    **Returns:**
        - counts: Counts for all view types
        - filter_counts: All/Parents/Subtasks counts for current view

    **Permission:** Technicians only (require_technician)

    **Raises:**
        HTTPException 400: Invalid view type

    **Use Case:**
        Call this when frontend only needs count badges (e.g., sidebar navigation)
        without fetching actual ticket data.
    """
    # Validate view type
    valid_views = [
        "unassigned",
        "all_unsolved",
        "my_unsolved",
        "recently_updated",
        "recently_solved",
        "all_your_requests",
        "urgent_high_priority",
        "pending_requester_response",
        "pending_subtask",
        "new_today",
        "in_progress",
    ]
    if view not in valid_views:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid view type. Must be one of: {', '.join(valid_views)}",
        )

    # Execute sequentially - asyncpg doesn't support concurrent operations on the same session
    counts_dict = await RequestService.get_technician_view_counts(db, current_user, business_unit_id)
    filter_counts_dict = await RequestService.get_view_filter_counts(db, current_user, view, business_unit_id)

    # Build response
    from api.schemas.technician_views import ViewCounts

    counts = ViewCounts(
        unassigned=counts_dict.get("unassigned", 0),
        all_unsolved=counts_dict.get("all_unsolved", 0),
        my_unsolved=counts_dict.get("my_unsolved", 0),
        recently_updated=counts_dict.get("recently_updated", 0),
        recently_solved=counts_dict.get("recently_solved", 0),
        all_your_requests=counts_dict.get("all_your_requests", 0),
        urgent_high_priority=counts_dict.get("urgent_high_priority", 0),
        pending_requester_response=counts_dict.get("pending_requester_response", 0),
        pending_subtask=counts_dict.get("pending_subtask", 0),
        new_today=counts_dict.get("new_today", 0),
        in_progress=counts_dict.get("in_progress", 0),
    )

    filter_counts = TicketTypeCounts(
        all=filter_counts_dict.get("all", 0),
        parents=filter_counts_dict.get("parents", 0),
        subtasks=filter_counts_dict.get("subtasks", 0),
    )

    response = {
        "counts": counts.model_dump(),
        "filter_counts": filter_counts.model_dump(),
    }

    return response


@router.get("/business-unit-counts", response_model=BusinessUnitCountsResponse)
async def get_business_unit_counts(
    view: Optional[str] = Query(
        None,
        description="View filter to apply (e.g., 'all_unsolved', 'unassigned', 'my_unsolved')"
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get ticket counts grouped by business unit.

    **View Filtering:**
    - If view is provided, counts are filtered to match the current view
    - Supported views: unassigned, all_unsolved, my_unsolved, recently_updated,
      recently_solved, all_your_requests, urgent_high_priority,
      pending_requester_response, pending_subtask, new_today, in_progress
    - If view is None, counts all tickets

    **Region Filtering:**
    - Super admins (is_super_admin=True) see ALL business units
    - Users with 'Admin' role see ALL business units
    - Other users see only business units from their assigned regions

    **Returns:**
        - business_units: List of business units with ticket counts
        - total: Total count across all business units
        - unassigned_count: Count of requests without a business unit

    **Permission:** Technicians only (require_technician)
    """
    from crud.service_request_crud import ServiceRequestCRUD

    bu_counts, unassigned_count = await ServiceRequestCRUD.get_business_unit_counts(
        db=db, user=current_user, view=view
    )

    business_units = [
        BusinessUnitCount(id=bu["id"], name=bu["name"], count=bu["count"])
        for bu in bu_counts
    ]

    response = BusinessUnitCountsResponse(
        business_units=business_units,
        total=sum(bu.count for bu in business_units),
        unassigned_count=unassigned_count,
    )

    return response


@router.get("/ticket-type-counts", response_model=TicketTypeCounts)
async def get_ticket_type_counts(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get global ticket type counts (not filtered by current view).

    Returns total counts for:
    - all: All tickets
    - parents: Parent tasks (requests without parent_task_id)
    - subtasks: Subtasks (requests with parent_task_id)

    **Note:** Counts respect user's region filtering permissions.

    **Permission:** Technicians only (require_technician)
    """
    from crud.service_request_crud import ServiceRequestCRUD

    counts = await ServiceRequestCRUD.get_ticket_type_counts(
        db=db, user=current_user
    )

    return TicketTypeCounts(
        all=counts["all"],
        parents=counts["parents"],
        subtasks=counts["subtasks"],
    )


@router.get("/{request_id}", response_model=ServiceRequestDetailRead)
async def get_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific service request by ID with full nested relationships.

    **Single request lookup** with eager-loaded relationships:
    - Status, Priority, Requester
    - Category, Subcategory, Tag
    - Business Unit
    - Assigned Technicians
    - Parent Task (if sub-task)

    **Permission:** Authenticated users

    **Returns:**
        Full service request details with all nested data

    **Raises:**
        HTTPException 404: Request not found
    """
    request = await RequestService.get_service_request_detail(
        db=db, request_id=request_id
    )

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    return request


@router.get("/{request_id}/full-details")
async def get_request_full_details(
    request_id: UUID,
    messages_limit: int = Query(100, ge=1, le=500, description="Maximum messages to return"),
    sub_tasks_limit: int = Query(20, ge=1, le=100, description="Maximum sub-tasks to return"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get complete request details in a single optimized call.

    **Aggregation endpoint** that combines 6 separate API calls into one:
    1. Ticket details with nested relationships
    2. Notes for the request
    3. Assignees for the request
    4. Initial chat messages
    5. Sub-tasks
    6. Sub-task statistics

    **Use this endpoint for ticket detail page** to reduce API calls from 6 to 1.

    **Query Parameters:**
    - messages_limit: Maximum chat messages to return (default: 100, max: 500)
    - sub_tasks_limit: Maximum sub-tasks to return (default: 20, max: 100)

    **Returns:**
        - request: Complete ticket with nested status, priority, requester
        - notes: Array of notes with creator info
        - assignees: Array of assigned technicians with user info
        - messages: Initial messages array with sender info
        - sub_tasks: Array of sub-tasks
        - sub_task_stats: Sub-task statistics (total, completed, pending)
        - serverTime: Current server timestamp

    **Permission:** Authenticated users

    **Raises:**
        HTTPException 404: Request not found
    """

    result = await RequestService.get_full_request_details(
        db=db,
        request_id=request_id,
        messages_limit=messages_limit,
        sub_tasks_limit=sub_tasks_limit,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Request not found")

    return result


@router.patch("/{request_id}", response_model=ServiceRequestRead)
async def update_request(
    request_id: UUID,
    update_data: ServiceRequestUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update a service request (general endpoint).

    **Permission-based field updates:**
    - Technicians/Supervisors: Can update all fields
    - Requesters: Can only update description

    **Triggers:**
    - Status change: Creates system chat message
    - Status to solved: Creates resolution celebration message
    - Any change: Broadcasts via SignalR to affected users

    **Args:**
        request_id: Request UUID
        update_data: Fields to update (all optional)

    **Returns:**
        Updated service request

    **Raises:**
        HTTPException 404: Request not found
        HTTPException 400: Validation error

    **Notes:**
        - Resolution field is REQUIRED when changing to solved status (status_id 6 or 8)
        - Broadcast failures are logged but don't prevent update
    """
    # Get old request to track changes
    old_request = await RequestService.get_service_request_by_id(
        db=db, request_id=request_id
    )
    if not old_request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Capture old values BEFORE update (SQLAlchemy identity map will sync objects after flush)
    old_status_id_snapshot = old_request.status_id

    # Update request
    request = await RequestService.update_service_request(
        db=db,
        request_id=request_id,
        update_data=update_data,
    )

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Track what changed and broadcast updates

    changed_fields = []
    new_values = {}
    status_changed = False
    old_status_name_en = None
    old_status_name_ar = None
    new_status_name_en = None
    new_status_name_ar = None

    if update_data.status_id and update_data.status_id != old_status_id_snapshot:
        changed_fields.append("status")
        new_values["status_id"] = update_data.status_id
        status_changed = True

        # Get old and new status names for system message (bilingual)
        if old_request.status:
            old_status_name_en = old_request.status.name_en
            old_status_name_ar = old_request.status.name_ar
        if request.status:
            new_status_name_en = request.status.name_en
            new_status_name_ar = request.status.name_ar

    if update_data.priority_id and update_data.priority_id != old_request.priority_id:
        changed_fields.append("priority")
        new_values["priority_id"] = update_data.priority_id

    if (
        update_data.subcategory_id
        and update_data.subcategory_id != old_request.subcategory_id
    ):
        changed_fields.append("subcategory")
        new_values["subcategory_id"] = update_data.subcategory_id

    if update_data.description and update_data.description != old_request.description:
        changed_fields.append("description")
        new_values["description"] = update_data.description

    if update_data.resolution and update_data.resolution != old_request.resolution:
        changed_fields.append("resolution")
        new_values["resolution"] = update_data.resolution

    # Trigger system event if status changed
    if status_changed and old_status_name_en and new_status_name_en:
        try:
            from api.services.event_trigger_service import EventTriggerService

            await EventTriggerService.trigger_status_changed(
                db=db,
                request_id=request_id,
                old_status_en=old_status_name_en,
                old_status_ar=old_status_name_ar,
                new_status_en=new_status_name_en,
                new_status_ar=new_status_name_ar,
                changed_by=current_user,
            )
        except Exception as e:
            # Log error but don't fail the request update
            logger.warning(f"Failed to trigger status change event: {e}")

    # Trigger solved message if new status has count_as_solved=True
    if status_changed and request.status and request.status.count_as_solved:
        try:
            from api.services.event_trigger_service import EventTriggerService

            await EventTriggerService.trigger_request_solved(
                db=db,
                request_id=request_id,
                solver=current_user
            )
        except Exception as e:
            # Log error but don't fail the request update
            logger.warning(f"Failed to trigger request_solved event: {e}")

    # Emit task_status_changed event if marked as solved
    if status_changed and request.status and request.status.count_as_solved:
        try:
            from api.services.signalr_client import signalr_client

            await signalr_client.broadcast_task_status_changed(
                request_id=str(request_id),
                status="solved",
                changed_by=current_user.full_name or current_user.username,
            )

            logger.info(f"Task {request_id} marked as solved, closure event emitted")
        except Exception as e:
            logger.warning(f"Failed to emit task closure event: {e}")

    # Broadcast ticket update if anything changed
    if changed_fields:
        try:
            from api.services.signalr_client import signalr_client

            await signalr_client.broadcast_ticket_update(
                request_id=str(request_id),
                update_type="fields_updated",
                update_data={
                    "updatedFields": changed_fields,
                    "newValues": new_values,
                    "updatedBy": {
                        "id": str(current_user.id),
                        "username": current_user.username,
                        "fullName": current_user.full_name,
                    },
                    "request": request.model_dump(mode="json"),
                },
            )

            # Broadcast to user ticket lists (requester + assignees)
            user_ids_str = [str(request.requester_id)]
            user_ids_str.extend([str(a.assignee_id) for a in request.assignees if a.assignee_id])
            await signalr_client.broadcast_user_ticket_update(
                user_ids=list(set(user_ids_str)),  # Dedupe
                request_id=str(request_id),
                update_type="fields_updated",
                update_data={"updatedFields": changed_fields},
            )

        except Exception as e:
            logger.warning(f"Failed to broadcast ticket update: {e}")

    return request


@router.patch("/{request_id}/technician-update", response_model=ServiceRequestRead)
async def update_request_by_technician(
    request_id: UUID,
    update_data: ServiceRequestUpdateByTechnician,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Update a service request by technician - fills in missing details.

    **Technician-specific update endpoint** for adding details to new requests.
    Technicians can update:
    - description: Detailed description of the issue
    - subcategory_id: Request subcategory for categorization
    - business_unit_id: Business unit (can override IP-based assignment)
    - priority_id: Priority level (affects SLA)
    - status_id: Request status
    - resolution: Resolution details (required for solved status)

    **Workflow:**
    1. Update request with provided fields
    2. If status changed to solved: Trigger celebration message
    3. Broadcast update via SignalR

    **Permission:** Technicians only (require_technician)

    **Returns:**
        Updated service request

    **Raises:**
        HTTPException 404: Request not found
        HTTPException 400: Validation error

    **Notes:**
        - Resolution is MANDATORY when changing to solved status
    """

    # Get old request to track changes
    old_request = await RequestService.get_service_request_by_id(
        db=db, request_id=request_id
    )
    if not old_request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Capture old values BEFORE update (SQLAlchemy identity map will sync objects after flush)
    old_status_id_snapshot = old_request.status_id

    # Update request
    request = await RequestService.update_service_request_by_technician(
        db=db,
        request_id=request_id,
        update_data=update_data,
        technician_id=current_user.id,
    )

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Track what changed and broadcast updates

    changed_fields = []
    new_values = {}
    status_changed = False
    old_status_name_en = None
    old_status_name_ar = None
    new_status_name_en = None
    new_status_name_ar = None

    if update_data.description and update_data.description != old_request.description:
        changed_fields.append("description")
        new_values["description"] = update_data.description

    if (
        update_data.subcategory_id
        and update_data.subcategory_id != old_request.subcategory_id
    ):
        changed_fields.append("subcategory")
        new_values["subcategory_id"] = update_data.subcategory_id

    if (
        update_data.business_unit_id
        and update_data.business_unit_id != old_request.business_unit_id
    ):
        changed_fields.append("business_unit")
        new_values["business_unit_id"] = update_data.business_unit_id

    if update_data.priority_id and update_data.priority_id != old_request.priority_id:
        changed_fields.append("priority")
        new_values["priority_id"] = update_data.priority_id

    if update_data.status_id and update_data.status_id != old_status_id_snapshot:
        changed_fields.append("status")
        new_values["status_id"] = update_data.status_id
        status_changed = True

        # Get old and new status names for system message (bilingual)
        if old_request.status:
            old_status_name_en = old_request.status.name_en
            old_status_name_ar = old_request.status.name_ar
        if request.status:
            new_status_name_en = request.status.name_en
            new_status_name_ar = request.status.name_ar

    if update_data.resolution and update_data.resolution != old_request.resolution:
        changed_fields.append("resolution")
        new_values["resolution"] = update_data.resolution

    # Check if task is being marked as solved (count_as_solved=True)
    task_marked_as_solved = False
    if status_changed and request.status and request.status.count_as_solved:
        task_marked_as_solved = True

    # Trigger system event if status changed
    if status_changed and old_status_name_en and new_status_name_en:
        try:
            from api.services.event_trigger_service import EventTriggerService

            await EventTriggerService.trigger_status_changed(
                db=db,
                request_id=request_id,
                old_status_en=old_status_name_en,
                old_status_ar=old_status_name_ar,
                new_status_en=new_status_name_en,
                new_status_ar=new_status_name_ar,
                changed_by=current_user,
            )
        except Exception as e:
            # Log error but don't fail the request update
            logger.warning(f"Failed to trigger status change event: {e}")

    # Trigger solved message if new status has count_as_solved=True
    if task_marked_as_solved:
        try:
            from api.services.event_trigger_service import EventTriggerService

            await EventTriggerService.trigger_request_solved(
                db=db,
                request_id=request_id,
                solver=current_user
            )
        except Exception as e:
            # Log error but don't fail the request update
            logger.warning(f"Failed to trigger request_solved event: {e}")

    # Broadcast task closure event if marked as solved
    if task_marked_as_solved:
        try:
            from api.services.signalr_client import signalr_client

            await signalr_client.broadcast_task_status_changed(
                request_id=str(request_id),
                status="solved",
                changed_by=current_user.full_name or current_user.username,
            )

            logger.info(f"Task {request_id} marked as solved, closure event emitted")
        except Exception as e:
            logger.warning(f"Failed to emit task closure event: {e}")

    # Broadcast ticket update if anything changed
    if changed_fields:
        try:
            from api.services.signalr_client import signalr_client

            await signalr_client.broadcast_ticket_update(
                request_id=str(request_id),
                update_type="technician_updated",
                update_data={
                    "updatedFields": changed_fields,
                    "newValues": new_values,
                    "updatedBy": {
                        "id": str(current_user.id),
                        "username": current_user.username,
                        "fullName": current_user.full_name,
                    },
                    "request": request.model_dump(mode="json"),
                },
            )

            # Broadcast to user ticket lists (requester + assignees)
            user_ids = [str(request.requester_id)]
            user_ids.extend([str(a.assignee_id) for a in request.assignees if a.assignee_id])
            await signalr_client.broadcast_user_ticket_update(
                user_ids=list(set(user_ids)),  # Dedupe
                request_id=str(request_id),
                update_type="technician_updated",
                update_data={"updatedFields": changed_fields},
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast ticket update: {e}")

    return request


@router.delete("/{request_id}", status_code=204)
async def delete_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_supervisor),
):
    """
    Delete a service request (soft delete).

    **Supervisor-only operation** for removing requests.
    Sets is_deleted flag without removing data from database.

    **Permission:** Supervisors only (require_supervisor)

    **Returns:**
        204 No Content on success

    **Raises:**
        HTTPException 403: Non-supervisor attempts deletion
        HTTPException 404: Request not found
    """
    success = await RequestService.delete_service_request(db=db, request_id=request_id)

    if not success:
        raise HTTPException(status_code=404, detail="Request not found")

    return Response(status_code=204)


@router.post("/{request_id}/assign", response_model=ServiceRequestRead)
async def assign_request(
    request_id: UUID,
    assign_data: AssignTechnicianRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_get_user_with_roles),
):
    """
    Assign a technician to a request.

    **Assignment rules:**
    - If request has 0 assignees: Use /take endpoint instead (self-assign only)
    - If request has 1+ assignees: Only supervisors can assign
    - Creates RequestAssignee record
    - Updates request status to 'in-progress' (8) if currently Open (1)

    **Workflow:**
    1. Create RequestAssignee record
    2. Trigger ticket_assigned system message
    3. Broadcast assignment via SignalR

    **Permission:**
    - First assignment: Any technician (self-assign via /take recommended)
    - Additional assignments: Supervisors only

    **Returns:**
        Updated service request with new assignee

    **Raises:**
        HTTPException 403: Permission denied (not supervisor, request already has assignees)
        HTTPException 404: Request or technician not found
        HTTPException 400: Technician already assigned
    """

    # Check if this is the first assignment (before creating the assignment)
    from crud.service_request_crud import ServiceRequestCRUD

    await ServiceRequestCRUD.count_assignees(db, request_id)

    # Use service layer to assign technician
    try:
        request = await RequestService.assign_user_to_request(
            db=db,
            request_id=request_id,
            user_id=assign_data.technician_id,
            assigned_by=current_user.id,
            assigner_user=current_user,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(status_code=404, detail=error_msg)
        else:
            raise HTTPException(status_code=500, detail=error_msg)

    # Trigger ticket_assigned system message for every new assignee
    # (Removed is_first_assignment condition - each new assignee should receive notification)
    try:
        from api.services.event_trigger_service import EventTriggerService
        from crud.user_crud import UserCRUD

        technician = await UserCRUD.find_by_id(db, assign_data.technician_id)
        if technician:
            await EventTriggerService.trigger_ticket_assigned(
                db=db, request_id=request_id, technician=technician
            )
    except Exception as e:
        logger.warning(f"Failed to trigger ticket_assigned event: {e}")

    # Broadcast the update via SignalR
    try:
        from api.services.signalr_client import signalr_client

        await signalr_client.broadcast_ticket_update(
            request_id=str(request_id),
            update_type="assigned",
            update_data={
                "updatedFields": ["assignedTechnician"],
                "newValues": {
                    "assignedTechnicianId": str(assign_data.technician_id) if assign_data.technician_id else None,
                },
                "updatedBy": {
                    "id": str(current_user.id),
                    "username": current_user.username,
                    "fullName": current_user.full_name,
                },
            },
        )

        # Broadcast to user ticket lists (requester + all assignees including new one)
        user_ids_str = [str(request.requester_id)]
        user_ids_str.extend([str(a.assignee_id) for a in request.assignees if a.assignee_id])
        await signalr_client.broadcast_user_ticket_update(
            user_ids=list(set(user_ids_str)),  # Dedupe
            request_id=str(request_id),
            update_type="assigned",
            update_data={"updatedFields": ["assignedTechnician"]},
        )

        # Invalidate technician views cache for affected users
        user_ids_int = [request.requester_id]
        user_ids_int.extend([a.assignee_id for a in request.assignees if a.assignee_id])
    except Exception as e:
        logger.warning(f"Failed to broadcast assignment update: {e}")

    return request


@router.get("/{request_id}/assignees", response_model=RequestAssigneesResponse)
async def get_request_assignees(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get all assignees for a request.

    **Returns list** of all technicians assigned to this request with:
    - User information (username, full name, title)
    - Assignment metadata (assigned by, assigned date)

    **Permission:** Authenticated users

    **Returns:**
        List of assignees with user details and assignment metadata
    """
    # Use service layer to get assignees
    try:
        assignments = await RequestService.get_request_assignees(
            db=db, request_id=request_id
        )
    except Exception as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=str(e))

    # Transform to response format
    assignees = [
        AssigneeInfo(
            id=a.id,
            user_id=a.assignee_id,
            username=a.assignee.username if a.assignee else "Unknown",
            full_name=a.assignee.full_name if a.assignee else None,
            title=a.assignee.title if a.assignee else None,
            assigned_by=a.assigned_by,
            assigned_by_name=a.assigner.full_name if a.assigner else None,
            created_at=a.created_at,
        )
        for a in assignments
    ]

    return RequestAssigneesResponse(
        request_id=request_id,
        assignees=assignees,
        total=len(assignees),
    )


@router.post("/{request_id}/unassign")
async def unassign_request(
    request_id: UUID,
    assign_data: AssignTechnicianRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_get_user_with_roles),
):
    """
    Unassign a technician from a request.

    **Unassignment rules:**
    - Only supervisors can unassign when request has assignees
    - Cannot remove the last assignee (must keep at least one)
    - Removes RequestAssignee record

    **Workflow:**
    1. Remove RequestAssignee record
    2. Broadcast unassignment via SignalR

    **Permission:** Supervisors only

    **Returns:**
        Success message

    **Raises:**
        HTTPException 403: Permission denied
        HTTPException 400: Cannot remove last assignee
        HTTPException 404: Request or assignment not found
    """

    # Use service layer to unassign technician
    try:
        await RequestService.unassign_user_from_request(
            db=db,
            request_id=request_id,
            user_id=assign_data.technician_id,
            unassigner_user=current_user,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        error_msg = str(e)
        if error_msg == "must_have_assignee":
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last assignee. Requests must have at least one assignee."
            )
        # Re-raise other ValueError types (e.g., "not assigned")
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(status_code=404, detail=error_msg)
        else:
            raise HTTPException(status_code=500, detail=error_msg)

    # Broadcast the update via SignalR
    try:
        from api.services.signalr_client import signalr_client

        await signalr_client.broadcast_ticket_update(
            request_id=str(request_id),
            update_type="unassigned",
            update_data={
                "updatedFields": ["unassignedTechnician"],
                "newValues": {
                    "unassignedTechnicianId": str(assign_data.technician_id) if assign_data.technician_id else None,
                },
                "updatedBy": {
                    "id": str(current_user.id),
                    "username": current_user.username,
                    "fullName": current_user.full_name,
                },
            },
        )

        # Broadcast to user ticket lists (requester + remaining assignees + unassigned user)
        request = await RequestService.get_service_request_by_id(db=db, request_id=request_id)
        if request:
            user_ids = [str(request.requester_id)]
            user_ids.extend([str(a.assignee_id) for a in request.assignees if a.assignee_id])
            # Also notify the unassigned user so their list updates
            if assign_data.technician_id:
                user_ids.append(str(assign_data.technician_id))
            await signalr_client.broadcast_user_ticket_update(
                user_ids=list(set(user_ids)),  # Dedupe
                request_id=str(request_id),
                update_type="unassigned",
                update_data={"updatedFields": ["unassignedTechnician"]},
            )
    except Exception as e:
        logger.warning(f"Failed to broadcast unassignment update: {e}")

    return {"success": True, "message": "Technician unassigned successfully"}


@router.post("/{request_id}/pickup", response_model=ServiceRequestRead)
async def pickup_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Technician picks up an unassigned request (status change only).

    **Quick action** to change request status to "in-progress"
    without assigning to a specific technician.

    **Use /take instead** to self-assign and update status.

    **Permission:** Technicians only (require_technician)

    **Returns:**
        Updated service request

    **Raises:**
        HTTPException 404: Request not found
    """

    update_data = ServiceRequestUpdate(
        status_id=3  # status_id 3 = "in_progress" (or "on-progress")
    )

    request = await RequestService.update_service_request(
        db=db,
        request_id=request_id,
        update_data=update_data,
    )

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    return request


@router.post("/{request_id}/take", response_model=ServiceRequestRead)
async def take_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Technician takes (self-assigns) an unassigned request.

    **Self-assignment flow** for claiming unassigned tickets:
    1. Creates RequestAssignee record for the technician
    2. Updates request status to "on-progress" (status_id 3)
    3. Triggers ticket_assigned system message
    4. Broadcasts update via SignalR

    **Use this when:** Request has 0 assignees and you want to claim it.

    **Use /assign instead when:** Request already has assignees and you're
    a supervisor adding another technician.

    **Permission:** Technicians only (require_technician)

    **Returns:**
        Updated service request with current user as assignee

    **Raises:**
        HTTPException 400: Request already has assignees
        HTTPException 404: Request not found
    """

    # Use service layer to take the request
    try:
        request = await RequestService.take_request(
            db=db,
            request_id=request_id,
            technician_id=current_user.id,
        )
    except Exception as e:
        if "already assigned" in str(e):
            raise HTTPException(status_code=400, detail=str(e))
        elif "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=str(e))

    # Trigger ticket_assigned system message
    try:
        from api.services.event_trigger_service import EventTriggerService

        await EventTriggerService.trigger_ticket_assigned(
            db=db, request_id=request_id, technician=current_user
        )
    except Exception as e:
        logger.warning(f"Failed to trigger ticket_assigned event: {e}")

    # Broadcast the update via SignalR
    try:
        from api.services.signalr_client import signalr_client

        await signalr_client.broadcast_ticket_update(
            request_id=str(request_id),
            update_type="picked_up",
            update_data={
                "updatedFields": ["status", "assignedTechnician"],
                "newValues": {
                    "statusId": 3,
                    "assignedTechnicianId": str(current_user.id),
                },
                "updatedBy": {
                    "id": str(current_user.id),
                    "username": current_user.username,
                    "fullName": current_user.full_name,
                },
                "request": request.model_dump(mode="json"),
            },
        )

        # Broadcast to user ticket lists (requester + new assignee)
        user_ids_str = [str(request.requester_id)]
        user_ids_str.extend([str(a.assignee_id) for a in request.assignees if a.assignee_id])
        await signalr_client.broadcast_user_ticket_update(
            user_ids=list(set(user_ids_str)),  # Dedupe
            request_id=str(request_id),
            update_type="picked_up",
            update_data={"updatedFields": ["status", "assignedTechnician"]},
        )

        # Invalidate technician views cache for affected users
        user_ids_int = [request.requester_id]
        user_ids_int.extend([a.assignee_id for a in request.assignees if a.assignee_id])
    except Exception as e:
        logger.warning(f"Failed to broadcast pickup update: {e}")

    return request


# ==================================================================================
# SUB-TASK ENDPOINTS
# ==================================================================================

@router.post("/{parent_id}/sub-tasks", response_model=TechnicianRequestListItem, status_code=201)
async def create_sub_task(
    parent_id: UUID,
    sub_task: SubTaskCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician)
):
    """
    Create a sub-task under a parent request.

    **Sub-task breakdown:** Break complex requests into smaller trackable tasks.
    Sub-tasks inherit category/priority from parent but have separate status.

    **Permission:** Technicians only (require_technician)

    **Workflow:**
    1. Create sub-task with parent_task_id set to parent_id
    2. Link to parent request
    3. Return sub-task with full nested data

    **Returns:**
        Created sub-task with status, priority, requester, business unit

    **Raises:**
        HTTPException 404: Parent request not found
        HTTPException 400: Validation error

    **Notes:**
        - Requesters cannot create sub-tasks (technician-only feature)
        - Sub-tasks can have their own sub-tasks (nested hierarchy)
    """
    from api.services.request_service import RequestService
    from sqlmodel import select
    from sqlalchemy.orm import selectinload
    from db.models import ServiceRequest, Tag

    # Convert schema to dict
    sub_task_data = sub_task.model_dump(exclude_unset=True)

    # Create sub-task
    created_sub_task = await RequestService.create_sub_task(
        db, parent_id, sub_task_data, current_user.id
    )

    # Reload with all relationships to build proper response
    result = await db.execute(
        select(ServiceRequest)
        .options(
            selectinload(ServiceRequest.status),
            selectinload(ServiceRequest.priority),
            selectinload(ServiceRequest.requester),
            selectinload(ServiceRequest.business_unit),
            selectinload(ServiceRequest.tag).selectinload(Tag.category),
            selectinload(ServiceRequest.subcategory)
        )
        .where(ServiceRequest.id == created_sub_task.id)
    )
    req = result.scalar_one()

    # Build response with nested data
    business_unit_info = None
    if req.business_unit:
        business_unit_info = BusinessUnitInfo(
            id=req.business_unit.id,
            name=req.business_unit.name,
        )

    tag_info = None
    if req.tag:
        tag_info = TagInfo(
            id=req.tag.id,
            name_en=req.tag.name_en,
            name_ar=req.tag.name_ar,
        )

    category_info = None
    if req.tag and req.tag.category:
        category_info = CategoryInfo(
            id=req.tag.category.id,
            name=req.tag.category.name,
            name_en=req.tag.category.name_en,
            name_ar=req.tag.category.name_ar,
        )

    subcategory_info = None
    if req.subcategory:
        subcategory_info = SubcategoryInfo(
            id=req.subcategory.id,
            name=req.subcategory.name,
            name_en=req.subcategory.name_en,
            name_ar=req.subcategory.name_ar,
        )

    return TechnicianRequestListItem(
        id=req.id,
        status=StatusInfo(
            id=req.status.id,
            name=req.status.name,
            color=req.status.color,
            count_as_solved=req.status.count_as_solved,
        ),
        subject=req.title,
        requester=RequesterInfo(
            id=req.requester.id,
            full_name=req.requester.full_name,
        ),
        requested=req.created_at,
        due_date=req.due_date,
        priority=PriorityInfo(
            id=req.priority.id,
            name=req.priority.name,
            response_time_minutes=req.priority.response_time_minutes,
            resolution_time_hours=req.priority.resolution_time_hours,
        ),
        business_unit=business_unit_info,
        last_message=None,  # No messages yet for new sub-task
        tag=tag_info,
        category=category_info,
        subcategory=subcategory_info,
        requester_has_unread=False,
        technician_has_unread=False,
        parent_task_id=req.parent_task_id,
        is_blocked=req.is_blocked,
        assigned_to_section_id=req.assigned_to_section_id,
        assigned_to_technician_id=req.assigned_to_technician_id,
        completed_at=req.completed_at,
        estimated_hours=req.estimated_hours,
    )


@router.get("/{parent_id}/sub-tasks", response_model=List[TechnicianRequestListItem])
async def get_sub_tasks(
    parent_id: UUID,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_session)
):
    """
    Get all sub-tasks for a parent request with full nested data.

    **Hierarchy listing:** Get all direct children of a parent request.

    **Query Parameters:**
    - skip: Pagination offset (default: 0)
    - limit: Maximum results (default: 20)

    **Returns:**
        List of sub-tasks with status, priority, requester, business unit

    **Notes:**
        - Ordered by order field, then created_at
        - Only returns direct children (not nested sub-sub-tasks)
    """
    from sqlmodel import select
    from sqlalchemy.orm import selectinload
    from db.models import ServiceRequest, Tag

    # Fetch sub-tasks with all relationships
    query = (
        select(ServiceRequest)
        .options(
            selectinload(ServiceRequest.status),
            selectinload(ServiceRequest.priority),
            selectinload(ServiceRequest.requester),
            selectinload(ServiceRequest.business_unit),
            selectinload(ServiceRequest.tag).selectinload(Tag.category),
            selectinload(ServiceRequest.subcategory)
        )
        .where(ServiceRequest.parent_task_id == parent_id)
        .where(not ServiceRequest.is_deleted)
        .order_by(ServiceRequest.order.asc(), ServiceRequest.created_at.asc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    sub_tasks = list(result.scalars().all())

    # Build response items with nested data
    items = []
    for req in sub_tasks:
        business_unit_info = None
        if req.business_unit:
            business_unit_info = BusinessUnitInfo(
                id=req.business_unit.id,
                name=req.business_unit.name,
            )

        tag_info = None
        if req.tag:
            tag_info = TagInfo(
                id=req.tag.id,
                name_en=req.tag.name_en,
                name_ar=req.tag.name_ar,
            )

        category_info = None
        if req.tag and req.tag.category:
            category_info = CategoryInfo(
                id=req.tag.category.id,
                name=req.tag.category.name,
                name_en=req.tag.category.name_en,
                name_ar=req.tag.category.name_ar,
            )

        subcategory_info = None
        if req.subcategory:
            subcategory_info = SubcategoryInfo(
                id=req.subcategory.id,
                name=req.subcategory.name,
                name_en=req.subcategory.name_en,
                name_ar=req.subcategory.name_ar,
            )

        item = TechnicianRequestListItem(
            id=req.id,
            status=StatusInfo(
                id=req.status.id,
                name=req.status.name,
                color=req.status.color,
                count_as_solved=req.status.count_as_solved,
            ),
            subject=req.title,
            requester=RequesterInfo(
                id=req.requester.id,
                full_name=req.requester.full_name,
            ),
            requested=req.created_at,
            due_date=req.due_date,
            priority=PriorityInfo(
                id=req.priority.id,
                name=req.priority.name,
                response_time_minutes=req.priority.response_time_minutes,
                resolution_time_hours=req.priority.resolution_time_hours,
            ),
            business_unit=business_unit_info,
            last_message=None,  # We don't fetch last message for sub-tasks list
            tag=tag_info,
            category=category_info,
            subcategory=subcategory_info,
            requester_has_unread=False,
            technician_has_unread=False,
            parent_task_id=req.parent_task_id,
            is_blocked=req.is_blocked,
            assigned_to_section_id=req.assigned_to_section_id,
            assigned_to_technician_id=req.assigned_to_technician_id,
            completed_at=req.completed_at,
            estimated_hours=req.estimated_hours,
        )
        items.append(item)

    return items


@router.get("/{parent_id}/sub-tasks/stats", response_model=dict)
async def get_sub_task_stats(
    parent_id: UUID,
    db: AsyncSession = Depends(get_session)
):
    """
    Get statistics for sub-tasks of a parent request.

    **Progress tracking:** Get completion status of all sub-tasks.

    **Returns:**
        - total: Total number of sub-tasks
        - completed: Number of completed sub-tasks
        - pending: Number of pending sub-tasks
        - blocked: Number of blocked sub-tasks

    **Use Case:** Display progress bar on parent request detail page
    """
    from api.services.request_service import RequestService

    return await RequestService.get_sub_task_stats(db, parent_id)


@router.put("/{parent_id}/sub-tasks/reorder")
async def reorder_sub_tasks(
    parent_id: UUID,
    task_ids: List[UUID],
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Reorder sub-tasks by providing ordered list of task IDs.

    **Drag-and-drop ordering:** Update display order of sub-tasks.

    **Permission:** Technicians only (require_technician)

    **Args:**
        parent_id: Parent request UUID
        task_ids: Ordered list of sub-task UUIDs

    **Returns:**
        Success message
    """
    from api.services.request_service import RequestService

    await RequestService.update_sub_task_order(db, parent_id, task_ids)

    return {"message": "Sub-tasks reordered successfully"}


@router.get("/technician/my-tasks", response_model=List[ServiceRequestRead])
async def get_my_tasks(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get all tasks (including sub-tasks) assigned to current technician.

    **Technician's personal task list:** All requests where current user
    is assigned (either as parent or sub-task).

    **Query Parameters:**
    - status: Comma-separated status IDs (e.g., "1,2,3")
    - skip: Pagination offset (default: 0)
    - limit: Maximum results (default: 20)

    **Returns:**
        List of assigned requests with status and details

    **Use Case:** Display "My Tasks" list on technician dashboard
    """
    from api.services.request_service import RequestService

    # Parse status filter
    status_filter = None
    if status:
        try:
            status_filter = [int(s.strip()) for s in status.split(",")]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status format")

    return await RequestService.get_technician_tasks(
        db, current_user.id, status_filter, skip, limit
    )


# ==================================================================================
# SCREENSHOT LINKING ENDPOINTS
# ==================================================================================

@router.post("/{request_id}/screenshots/{screenshot_id}/link", status_code=201)
async def link_screenshot_to_request(
    request_id: UUID,
    screenshot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Link a screenshot from parent task to a sub-task.

    **Screenshot sharing:** Share screenshots between parent and sub-tasks
    without re-uploading.

    **Permission:** Technicians only (require_technician)

    **Args:**
        request_id: Target request (sub-task) UUID
        screenshot_id: Screenshot ID to link

    **Returns:**
        Success message with link ID

    **Raises:**
        HTTPException 400: Screenshot already linked or invalid request
        HTTPException 404: Screenshot or request not found

    **Notes:**
        - Original screenshot remains attached to parent request
        - Link creates reference in screenshot_links table
    """
    from api.services.screenshot_service import ScreenshotService

    try:
        link = await ScreenshotService.link_screenshot(
            db, request_id, screenshot_id, current_user.id
        )
        return {"message": "Screenshot linked successfully", "link_id": link.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{request_id}/screenshots/{screenshot_id}/link", status_code=204)
async def unlink_screenshot_from_request(
    request_id: UUID,
    screenshot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Unlink a screenshot from a sub-task.

    **Remove screenshot link:** Stop sharing screenshot with sub-task.
    Original screenshot remains attached to parent request.

    **Permission:** Technicians only (require_technician)

    **Args:**
        request_id: Request UUID
        screenshot_id: Screenshot ID to unlink

    **Returns:**
        204 No Content on success

    **Raises:**
        HTTPException 404: Link not found

    **Notes:**
        - Does not delete the screenshot, only removes the link
    """
    from api.services.screenshot_service import ScreenshotService

    try:
        await ScreenshotService.unlink_screenshot(db, request_id, screenshot_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{request_id}/screenshots/all", response_model=List[dict])
async def get_all_screenshots_for_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session)
):
    """
    Get all screenshots for a request (owned + linked from parent).

    **Complete screenshot list:** Returns both:
    - Screenshots directly uploaded to this request
    - Screenshots linked from parent request

    **Returns:**
        List of screenshots with:
        - id: Screenshot ID
        - request_id: Owner request UUID
        - filename: Original filename
        - file_size: File size in bytes
        - mime_type: MIME type (image/png, etc.)
        - uploaded_by: User ID of uploader
        - created_at: Upload timestamp
        - upload_status: Upload status (pending, completed, failed)

    **Use Case:** Display all available screenshots in gallery
    """
    from api.services.screenshot_service import ScreenshotService

    screenshots = await ScreenshotService.get_all_screenshots_for_request(db, request_id)

    # Convert to dict for response
    return [
        {
            "id": s.id,
            "request_id": str(s.request_id),
            "filename": s.filename,
            "file_size": s.file_size,
            "mime_type": s.mime_type,
            "uploaded_by": str(s.uploaded_by),
            "created_at": s.created_at.isoformat(),
            "upload_status": s.upload_status
        }
        for s in screenshots
    ]
