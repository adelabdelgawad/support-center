"""
Service Request API endpoints with performance optimizations.

REFACTORED: Renamed all "agent" references to "technician" throughout.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import _get_user_with_roles, get_client_ip, get_current_user, require_supervisor, require_technician
from models.database_models import User
from schemas import (
    AssignTechnicianRequest,
    ServiceRequestCreate,
    ServiceRequestCreateByRequester,
    ServiceRequestDetailRead,
    ServiceRequestList,
    ServiceRequestListItem,
    ServiceRequestRead,
    ServiceRequestStats,
    ServiceRequestUpdate,
    ServiceRequestUpdateByTechnician,
    SubTaskCreate,
)
from schemas.service_request.service_request import (
    AssigneeInfo,
    RequestAssigneesResponse,
)
from schemas.service_request.technician_views import (
    TechnicianViewsResponse,
    TechnicianRequestListItem,
    LastMessageInfo,
    BusinessUnitCount,
    BusinessUnitCountsResponse,
    TicketTypeCounts,
    StatusInfo,
    RequesterInfo,
    PriorityInfo,
    BusinessUnitInfo,
    TagInfo,
    CategoryInfo,
    SubcategoryInfo,
)
from services.request_service import RequestService

router = APIRouter()


@router.post("/", response_model=ServiceRequestRead, status_code=201)
async def create_request(
    request_data: ServiceRequestCreateByRequester,
    http_request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new service request by requester.

    Requester provides only:
    - **title**: Brief summary of the request

    System automatically captures:
    - IP address from request
    - Business unit (matched from IP network)
    - Requester ID (from authenticated user)
    - Priority (defaults to Medium)
    - Status (defaults to Pending)

    Technician will fill in description and other details later.
    """
    client_ip = get_client_ip(http_request)

    request = await RequestService.create_service_request_by_requester(
        db=db,
        request_data=request_data,
        requester_id=current_user.id,
        client_ip=client_ip,
    )

    # Trigger new_request system message
    try:
        from services.event_trigger_service import EventTriggerService

        await EventTriggerService.trigger_new_request(db=db, request=request)
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to trigger new_request event: {e}")

    # Broadcast new ticket via SignalR
    try:
        from services.signalr_client import signalr_client

        await signalr_client.broadcast_new_ticket(
            requester_id=str(request.requester_id),
            assigned_to_id=None,  # New requests are unassigned
            ticket=request.model_dump(mode="json"),
        )

        # Notify requester of subscription to their new ticket
        await signalr_client.notify_subscription_added(
            user_id=str(request.requester_id),
            request_id=str(request.id),
        )
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to broadcast new ticket via SignalR: {e}")

    return request


@router.get("/", response_model=ServiceRequestList)
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

    - **status_id**: Filter by status
    - **category_id**: Filter by category
    - **page**: Page number (1-indexed)
    - **per_page**: Items per page (max 100)
    - **requester_view**: If true, only show requests with statuses visible to requesters
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
):
    """
    Get request statistics.

    - **technician_id**: Optional technician ID to filter stats
    - **category_id**: Optional category ID to filter stats
    - **priority_id**: Optional priority ID to filter stats
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
    Get service requests for technician views with filtering by business unit region.

    **View Types:**
    - **unassigned**: Requests with no assigned technician
    - **all_unsolved**: All requests not in Solved/Closed status
    - **my_unsolved**: Current user's assigned requests that are unsolved
    - **recently_updated**: All requests ordered by update time
    - **recently_solved**: Requests with Solved status

    **Business Unit Filtering:**
    - Optional business_unit_id parameter to filter by specific business unit
    - Use business_unit_id=-1 to filter for unassigned (null business_unit_id)

    **Region Filtering:**
    - Super admins (is_super_admin=True) see ALL requests
    - Users with 'Admin' role see ALL requests
    - Other users see only requests from their business_unit_region

    **Returns:**
    - Request list with: status, subject, requester, requested date, priority, business unit, last message
    - Counts for all 5 views (for sidebar display)
    - Pagination info
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

    # Get requests for the specified view
    requests, total = await RequestService.get_technician_view_requests(
        db=db,
        user=current_user,
        view_type=view,
        business_unit_id=business_unit_id,
        page=page,
        per_page=per_page,
    )

    # Get counts for all views (with same business_unit_id filter as list)
    counts_dict = await RequestService.get_technician_view_counts(
        db=db,
        user=current_user,
        business_unit_id=business_unit_id,
    )

    # Get last messages for all requests in current page
    from repositories.service_request_repository import ServiceRequestRepository
    from repositories.chat_repository import ChatMessageRepository

    request_ids = [req.id for req in requests]
    last_messages_dict = await ServiceRequestRepository.get_last_messages_for_requests(
        db=db,
        request_ids=request_ids,
    )

    # Check if requesters have unread messages for these requests (requester hasn't read agent's messages)
    requester_unread_dict = await ChatMessageRepository.check_requester_unread_for_requests(
        db=db,
        request_ids=request_ids,
    )

    # Check if technicians have unread messages from requesters (agent hasn't read requester's messages)
    technician_unread_dict = await ChatMessageRepository.check_technician_unread_for_requests(
        db=db,
        request_ids=request_ids,
    )

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
        from schemas.service_request.technician_views import (
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
    from schemas.service_request.technician_views import ViewCounts

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

    # Get filter counts for current view (All/Parents/Subtasks)
    filter_counts_dict = await RequestService.get_view_filter_counts(
        db=db,
        user=current_user,
        view_type=view,
        business_unit_id=business_unit_id,
    )

    filter_counts = TicketTypeCounts(
        all=filter_counts_dict.get("all", 0),
        parents=filter_counts_dict.get("parents", 0),
        subtasks=filter_counts_dict.get("subtasks", 0),
    )

    return TechnicianViewsResponse(
        data=items,
        counts=counts,
        filter_counts=filter_counts,
        total=total,
        page=page,
        per_page=per_page,
    )


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
    - List of business units with ticket counts
    - Total count
    - Unassigned count (requests without a business unit)
    """
    from repositories.service_request_repository import ServiceRequestRepository

    bu_counts, unassigned_count = await ServiceRequestRepository.get_business_unit_counts(
        db=db, user=current_user, view=view
    )

    business_units = [
        BusinessUnitCount(id=bu["id"], name=bu["name"], count=bu["count"])
        for bu in bu_counts
    ]

    return BusinessUnitCountsResponse(
        business_units=business_units,
        total=sum(bu.count for bu in business_units),
        unassigned_count=unassigned_count,
    )


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
    """
    from repositories.service_request_repository import ServiceRequestRepository

    counts = await ServiceRequestRepository.get_ticket_type_counts(
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
    Get a specific service request by ID with nested relationships.
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

    This endpoint combines 6 separate API calls into one:
    - Ticket details with nested relationships
    - Notes for the request
    - Assignees for the request
    - Initial chat messages
    - Sub-tasks
    - Sub-task statistics

    Use this endpoint for the ticket detail page to reduce API calls from 6 to 1.

    Query Parameters:
    - **messages_limit**: Maximum number of chat messages to return (default: 100, max: 500)
    - **sub_tasks_limit**: Maximum number of sub-tasks to return (default: 20, max: 100)

    Returns:
    - Complete ticket data with nested status, priority, requester
    - Notes array with creator info
    - Assignees array with user info
    - Initial messages array with sender info
    - Sub-tasks array
    - Sub-task statistics
    - Server timestamp
    """
    from schemas.service_request.full_details import FullRequestDetailsResponse

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
    Update a service request.

    Only technicians and supervisors can update most fields.
    Requesters can only update description.
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
    from services.chat_service import ChatService

    changed_fields = []
    new_values = {}
    status_changed = False
    old_status_name = None
    new_status_name = None
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
            old_status_name = old_request.status.name
            old_status_name_en = old_request.status.name_en
            old_status_name_ar = old_request.status.name_ar
        if request.status:
            new_status_name = request.status.name
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
            from services.event_trigger_service import EventTriggerService

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
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to trigger status change event: {e}")

    # Trigger solved message if new status has count_as_solved=True
    if status_changed and request.status and request.status.count_as_solved:
        try:
            from services.event_trigger_service import EventTriggerService

            await EventTriggerService.trigger_request_solved(
                db=db,
                request_id=request_id,
                solver=current_user
            )
        except Exception as e:
            # Log error but don't fail the request update
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to trigger request_solved event: {e}")

    # Emit task_status_changed event if marked as solved
    if status_changed and request.status and request.status.count_as_solved:
        try:
            from services.signalr_client import signalr_client

            await signalr_client.broadcast_task_status_changed(
                request_id=str(request_id),
                status="solved",
                changed_by=current_user.full_name or current_user.username,
            )

            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Task {request_id} marked as solved, closure event emitted")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to emit task closure event: {e}")

    # Broadcast ticket update if anything changed
    if changed_fields:
        try:
            from services.signalr_client import signalr_client

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
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
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

    Technicians can add/update:
    - **description**: Detailed description
    - **subcategory_id**: Request subcategory
    - **business_unit_id**: Business unit (can override auto-assigned)
    - **priority_id**: Priority level
    - **status_id**: Request status
    - **resolution**: Resolution details

    Requires technician role (is_technician=True or is_super_admin=True).
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
    from services.chat_service import ChatService

    changed_fields = []
    new_values = {}
    status_changed = False
    old_status_name = None
    new_status_name = None
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
            old_status_name = old_request.status.name
            old_status_name_en = old_request.status.name_en
            old_status_name_ar = old_request.status.name_ar
        if request.status:
            new_status_name = request.status.name
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
            from services.event_trigger_service import EventTriggerService

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
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to trigger status change event: {e}")

    # Trigger solved message if new status has count_as_solved=True
    if task_marked_as_solved:
        try:
            from services.event_trigger_service import EventTriggerService

            await EventTriggerService.trigger_request_solved(
                db=db,
                request_id=request_id,
                solver=current_user
            )
        except Exception as e:
            # Log error but don't fail the request update
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to trigger request_solved event: {e}")

    # Broadcast task closure event if marked as solved
    if task_marked_as_solved:
        try:
            from services.signalr_client import signalr_client

            await signalr_client.broadcast_task_status_changed(
                request_id=str(request_id),
                status="solved",
                changed_by=current_user.full_name or current_user.username,
            )

            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Task {request_id} marked as solved, closure event emitted")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to emit task closure event: {e}")

    # Broadcast ticket update if anything changed
    if changed_fields:
        try:
            from services.signalr_client import signalr_client

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
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to broadcast ticket update: {e}")

    return request


@router.delete("/{request_id}", status_code=204)
async def delete_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_supervisor),
):
    """
    Delete a service request.

    Only supervisors can delete requests.
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

    - If request has 0 assignees: Use /take endpoint instead (self-assign only)
    - If request has 1+ assignees: Only supervisors can assign
    - Creates RequestAssignee record
    - Updates request status to 'in-progress' (8) if currently Open (1)
    """

    # Check if this is the first assignment (before creating the assignment)
    from repositories.service_request_repository import ServiceRequestRepository

    assignee_count_before = await ServiceRequestRepository.count_assignees(db, request_id)
    is_first_assignment = (assignee_count_before == 0)

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
        from services.event_trigger_service import EventTriggerService
        from repositories.user_repository import UserRepository

        technician = await UserRepository.find_by_id(db, assign_data.technician_id)
        if technician:
            await EventTriggerService.trigger_ticket_assigned(
                db=db, request_id=request_id, technician=technician
            )
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to trigger ticket_assigned event: {e}")

    # Broadcast the update via SignalR
    try:
        from services.signalr_client import signalr_client

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
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
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

    Returns list of all technicians assigned to this request.
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

    - Only supervisors can unassign when assignees exist
    - Cannot remove the last assignee (must keep at least one)
    - Removes RequestAssignee record
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
        from services.signalr_client import signalr_client

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
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to broadcast unassignment update: {e}")

    return {"success": True, "message": "Technician unassigned successfully"}


@router.post("/{request_id}/pickup", response_model=ServiceRequestRead)
async def pickup_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Technician picks up an unassigned request.
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

    This creates a RequestAssignee record and updates the request status to 'on-progress'.

    - Creates assignment record for the technician
    - Updates request status to 3 (on-progress)
    - Broadcasts update via WebSocket
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
        from services.event_trigger_service import EventTriggerService

        await EventTriggerService.trigger_ticket_assigned(
            db=db, request_id=request_id, technician=current_user
        )
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to trigger ticket_assigned event: {e}")

    # Broadcast the update via SignalR
    try:
        from services.signalr_client import signalr_client

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
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
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

    Requires: Technician role or higher (enforced).
    Only technicians can create subtasks - requesters cannot.
    """
    from services.request_service import RequestService
    from sqlmodel import select
    from sqlalchemy.orm import selectinload
    from models.database_models import ServiceRequest, Tag

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
    """Get all sub-tasks for a parent request with full nested data."""
    from sqlmodel import select
    from sqlalchemy.orm import selectinload
    from models.database_models import ServiceRequest, Tag

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
        .where(ServiceRequest.is_deleted == False)
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
    """Get statistics for sub-tasks of a parent request."""
    from services.request_service import RequestService

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

    Requires: Technician role or higher.
    """
    from services.request_service import RequestService

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

    Args:
        status: Comma-separated status IDs (e.g., "1,2,3")
        skip: Pagination offset
        limit: Pagination limit
    """
    from services.request_service import RequestService

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

    Requires: Technician role or higher.
    """
    from services.screenshot_service import ScreenshotService

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

    Requires: Technician role or higher.
    """
    from services.screenshot_service import ScreenshotService

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

    Returns both screenshots directly uploaded to this request
    and screenshots linked from the parent request.
    """
    from services.screenshot_service import ScreenshotService

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
