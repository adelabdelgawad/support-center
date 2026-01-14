"""
Service Request business logic with caching and performance optimizations.
Enhanced with centralized logging and error handling.

REFACTORED: Renamed all "agent" references to "technician" throughout.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.config import settings
from core.decorators import (
    critical_database_operation,
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from models import Priority, RequestAssignee, RequestNote, RequestStatus, ServiceRequest, User
from schemas.service_request.service_request import (
    ServiceRequestCreate,
    ServiceRequestCreateByRequester,
    ServiceRequestListItem,
    ServiceRequestStats,
    ServiceRequestUpdate,
    ServiceRequestUpdateByTechnician,
)
from services.business_unit_service import BusinessUnitService

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class RequestService:
    """Service for managing service requests with performance optimizations."""

    @staticmethod
    def validate_resolution_requirement(
        status_id: int, resolution: Optional[str]
    ) -> None:
        """
        Validate that resolution is provided when required.

        Business Rule: RequestResolution is MANDATORY for Solved (3) and Canceled (5).

        Args:
            status_id: The new status ID
            resolution: The resolution text (if any)

        Raises:
            ValueError: If resolution is required but not provided
        """
        if status_id == 3 and not resolution:
            raise ValueError(
                "Resolution is mandatory when changing status to Solved"
            )
        if status_id == 5 and not resolution:
            raise ValueError(
                "Cancellation reason is mandatory when changing status to Canceled"
            )

    @staticmethod
    def validate_subcategory_requirement(
        request_id: UUID, subcategory_id: Optional[int]
    ) -> None:
        """
        Validate that subcategory is provided when required.

        Business Rule: Subcategory is MANDATORY when category is "Software Issues" (id=1).

        Args:
            request_id: The request ID for logging
            subcategory_id: The subcategory ID (if any)

        Raises:
            ValueError: If subcategory is required but not provided
        """
        # Note: This would need to check the category ID = 1, but we don't have access to it here
        # This validation should be done at the model level or with full request context
        pass


    @staticmethod
    def validate_category_change_allowed(
        request_id: UUID, current_category_id: int, new_category_id: int
    ) -> None:
        """
        Validate that category change is allowed.

        Business Rule: Category can only be changed if:
        - Current status is "1" (New) OR "10" (Rejected)
        - OR the change is from Software (id=1) to Hardware (id=2)

        Args:
            request_id: The request ID for logging
            current_category_id: The current category ID
            new_category_id: The proposed new category ID

        Raises:
            ValueError: If category change is not allowed
        """
        # This would need access to the current request status
        # For now, we'll implement the basic rule
        if current_category_id == 1 and new_category_id == 2:
            return  # Software to Hardware is allowed

        # Other restrictions would require request status information
        pass

    @staticmethod
    def _set_status_timestamps(
        request: ServiceRequest, new_status_id: int, update_dict: dict
    ) -> None:
        """
        Set appropriate timestamps based on status changes.

        Args:
            request: The service request object
            new_status_id: The new status ID
            update_dict: The update dictionary being processed
        """
        # Check if we're setting timestamps based on status change
        if "status_id" in update_dict:
            # Status 1 (Open): Set assigned_at if first time
            if new_status_id == 1 and not request.assigned_at:
                request.assigned_at = datetime.utcnow()
            # Status 3 (Solved): Set resolved_at
            elif new_status_id == 3 and not request.resolved_at:
                request.resolved_at = datetime.utcnow()
            # Status 4 (Archived): Set closed_at
            elif new_status_id == 4 and not request.closed_at:
                request.closed_at = datetime.utcnow()

        request.updated_at = datetime.utcnow()

    @staticmethod
    def _validate_and_process_update(
        request: ServiceRequest, update_dict: dict
    ) -> dict:
        """
        Validate and process update dictionary with business rules.

        Args:
            request: The current service request
            update_dict: The update dictionary

        Returns:
            Processed update dictionary

        Raises:
            ValueError: If validation fails
        """
        new_status_id = update_dict.get("status_id")

        if new_status_id:
            # Validate mandatory requirements based on status
            RequestService.validate_resolution_requirement(
                new_status_id, update_dict.get("resolution")
            )

            # Set appropriate timestamps
            RequestService._set_status_timestamps(
                request, new_status_id, update_dict
            )

        # Validate category changes if provided
        if "category_id" in update_dict:
            RequestService.validate_category_change_allowed(
                request.id, request.category_id, update_dict["category_id"]
            )

        return update_dict

    @staticmethod
    @log_database_operation("update_service_request")
    @transactional_database_operation
    @critical_database_operation()
    async def update_service_request(
        db: AsyncSession, request_id: UUID, update_data: ServiceRequestUpdate
    ) -> ServiceRequest:
        """
        Update a service request with business rule validation and performance optimizations.

        Args:
            db: Database session
            request_id: ID of the service request to update
            update_data: Update data with validation

        Returns:
            Updated service request

        Raises:
            ValueError: If validation fails
            NotFoundError: If request not found
        """
        # Convert update data to dictionary
        update_dict = update_data.dict(exclude_unset=True)

        # Retrieve the request with optimized loading
        result = await db.execute(
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.subcategory),
                selectinload(ServiceRequest.status),  # Load status for count_as_solved check
            )
            .where(ServiceRequest.id == request_id)
        )
        request = result.scalar_one_or_none()

        if not request:
            raise NotFoundError(
                f"Service request with ID {request_id} not found"
            )

        # Apply business rule validations and processing
        processed_updates = RequestService._validate_and_process_update(
            request, update_dict
        )

        # Update the request
        for key, value in processed_updates.items():
            if hasattr(request, key):
                setattr(request, key, value)

        await db.flush()

        # Refresh the request to get all updated attributes including updated_at
        # This is critical to avoid MissingGreenlet error when serializing response
        # Refresh ALL attributes to ensure they're loaded before session closes
        await db.refresh(request)

        logger.info(f"Updated service request {request_id} with validations")
        return request

    @staticmethod
    @transactional_database_operation
    async def update_service_request_by_technician(
        db: AsyncSession,
        request_id: UUID,
        update_data: ServiceRequestUpdateByTechnician,
        technician_id: int,
    ) -> ServiceRequest:
        """
        Update a service request by technician - fills in missing details.

        Technicians can add:
        - description (detailed information)
        - subcategory_id
        - business_unit_id (override auto-assigned)
        - priority_id
        - status_id
        - resolution

        Args:
            db: Database session
            request_id: ID of the service request to update
            update_data: Technician update data
            technician_id: ID of the technician making the update

        Returns:
            Updated service request

        Raises:
            ValueError: If validation fails
            NotFoundError: If request not found
        """
        # Convert update data to dictionary
        update_dict = update_data.model_dump(exclude_unset=True)

        if not update_dict:
            raise ValueError("No fields to update")

        # Retrieve the request with status relationship for count_as_solved check
        result = await db.execute(
            select(ServiceRequest)
            .options(selectinload(ServiceRequest.status))
            .where(ServiceRequest.id == request_id)
        )
        request = result.scalar_one_or_none()

        if not request:
            raise ValueError(f"Service request with ID {request_id} not found")

        # Business rule: Cannot change to resolved/closed without description
        new_status_id = update_dict.get("status_id")
        if new_status_id in [6, 8]:
            final_description = (
                update_dict.get("description") or request.description
            )
            if not final_description:
                raise ValueError(
                    "Description is required before changing status to resolved/closed"
                )
            final_resolution = (
                update_dict.get("resolution") or request.resolution
            )
            if not final_resolution:
                raise ValueError(
                    "Resolution is required for resolved/closed status"
                )

        # Update the request
        for key, value in update_dict.items():
            if hasattr(request, key):
                setattr(request, key, value)

        request.updated_at = datetime.utcnow()

        await db.flush()
        # Refresh with status relationship to get count_as_solved for trigger check
        await db.refresh(request, ["status"])

        logger.info(
            f"Technician {technician_id} updated service request {request_id}: "
            f"fields={list(update_dict.keys())}"
        )
        return request

    @staticmethod
    @log_database_operation("bulk_update_service_requests")
    @transactional_database_operation
    async def bulk_update_service_requests(
        db: AsyncSession,
        request_ids: List[UUID],
        update_data: ServiceRequestUpdate,
    ) -> List[ServiceRequest]:
        """
        Update multiple service requests efficiently.

        Args:
            db: Database session
            request_ids: List of request IDs to update
            update_data: Update data to apply to all requests

        Returns:
            List of updated service requests

        Raises:
            ValueError: If validation fails
        """
        if not request_ids:
            return []

        # Convert update data to dictionary
        update_dict = update_data.dict(exclude_unset=True)
        new_status_id = update_dict.get("status_id")

        # Validate business rules for bulk update
        if new_status_id:
            RequestService.validate_resolution_requirement(
                new_status_id, update_dict.get("resolution")
            )

        # Get all requests to update
        result = await db.execute(
            select(ServiceRequest).where(ServiceRequest.id.in_(request_ids))
        )
        requests = result.scalars().all()

        updated_requests = []
        for request in requests:
            # Apply timestamp setting logic
            if "status_id" in update_dict:
                if new_status_id == "2" and not request.assigned_at:
                    request.assigned_at = datetime.utcnow()
                elif new_status_id in ["6", "7"] and not request.resolved_at:
                    request.resolved_at = datetime.utcnow()
                elif new_status_id == "8" and not request.closed_at:
                    request.closed_at = datetime.utcnow()

            request.updated_at = datetime.utcnow()

            # Apply other updates
            for key, value in update_dict.items():
                if hasattr(request, key) and key != "status_id":
                    setattr(request, key, value)

            updated_requests.append(request)

        await db.flush()

        logger.info(f"Bulk updated {len(updated_requests)} service requests")
        return updated_requests

    @staticmethod
    async def get_service_request_stats(
        db: AsyncSession,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        category_id: Optional[int] = None,
        priority_id: Optional[int] = None,
        status_id: Optional[int] = None,
    ) -> ServiceRequestStats:
        """
        Get service request statistics with caching and performance optimizations.

        Args:
            db: Database session
            date_from: Filter from date
            date_to: Filter to date
            category_id: Filter by category
            priority_id: Filter by priority
            status_id: Filter by status

        Returns:
            ServiceRequestStats with aggregated statistics
        """
        # Build base query with filters
        base_query = select(ServiceRequest)

        if date_from:
            base_query = base_query.where(
                ServiceRequest.created_at >= date_from
            )
        if date_to:
            base_query = base_query.where(ServiceRequest.created_at <= date_to)
        if category_id:
            base_query = base_query.where(
                ServiceRequest.category_id == category_id
            )
        if priority_id:
            base_query = base_query.where(
                ServiceRequest.priority_id == priority_id
            )
        if status_id:
            base_query = base_query.where(
                ServiceRequest.status_id == status_id
            )

        # Get total count
        count_query = select(func.count()).select_from(base_query.subquery())
        total_count_result = await db.execute(count_query)
        total_count = total_count_result.scalar()

        # Get status distribution
        status_query = (
            select(ServiceRequest.status_id, func.count(ServiceRequest.id))
            .select_from(base_query.subquery())
            .group_by(ServiceRequest.status_id)
        )
        status_result = await db.execute(status_query)
        status_distribution = dict(status_result.all())

        # Get priority distribution
        priority_query = (
            select(ServiceRequest.priority_id, func.count(ServiceRequest.id))
            .select_from(base_query.subquery())
            .group_by(ServiceRequest.priority_id)
        )
        priority_result = await db.execute(priority_query)
        priority_distribution = dict(priority_result.all())

        # Get average resolution time
        resolution_time_query = (
            select(
                func.avg(
                    func.extract(
                        "epoch",
                        ServiceRequest.resolved_at - ServiceRequest.created_at,
                    )
                )
            )
            .select_from(base_query.subquery())
            .where(ServiceRequest.resolved_at.isnot(None))
        )
        resolution_time_result = await db.execute(resolution_time_query)
        avg_resolution_time = resolution_time_result.scalar()

        return ServiceRequestStats(
            total_requests=total_count,
            status_distribution=status_distribution,
            priority_distribution=priority_distribution,
            avg_resolution_time_seconds=avg_resolution_time or 0,
            date_range={
                "from": date_from.isoformat() if date_from else None,
                "to": date_to.isoformat() if date_to else None,
            },
        )

    @staticmethod
    @log_database_operation("create_service_request")
    @transactional_database_operation
    async def create_service_request(
        db: AsyncSession, request_data: ServiceRequestCreate
    ) -> ServiceRequest:
        """
        Create a new service request with optimized database operations.

        Args:
            db: Database session
            request_data: Service request creation data

        Returns:
            Created service request

        Raises:
            ValueError: If validation fails
        """
        # Validate mandatory subcategory for Software Issues
        if request_data.category_id == 1 and not request_data.subcategory_id:
            raise ValueError(
                "Subcategory is mandatory for Software Issues category"
            )

        # Calculate due_date based on priority SLA
        due_date = None
        if request_data.priority_id:
            priority = await db.execute(
                select(Priority).where(Priority.id == request_data.priority_id)
            )
            priority_obj = priority.scalar_one_or_none()
            if priority_obj and priority_obj.resolution_time_hours:
                due_date = datetime.utcnow() + timedelta(hours=priority_obj.resolution_time_hours)

        # Create the request
        service_request = ServiceRequest(
            title=request_data.title,
            description=request_data.description,
            requester_id=request_data.requester_id,
            category_id=request_data.category_id,
            subcategory_id=request_data.subcategory_id,
            priority_id=request_data.priority_id,
            status_id=1,  # Default to "Open" status
            due_date=due_date,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        db.add(service_request)
        await db.flush()
        await db.refresh(service_request)

        logger.info(f"Created new service request {service_request.id} with due_date={due_date}")
        return service_request

    @staticmethod
    @transactional_database_operation
    async def create_service_request_by_requester(
        db: AsyncSession,
        request_data: ServiceRequestCreateByRequester,
        requester_id: int,
        client_ip: str,
    ) -> ServiceRequest:
        """
        Create a new service request by requester (simplified workflow).

        Requester provides only the title. System auto-captures:
        - ip_address from client request
        - business_unit_id from IP network matching
        - requester_id from authenticated user
        - priority_id defaults to 3 (Medium)
        - status_id defaults to 1 (Pending)

        Args:
            db: Database session
            request_data: Only contains title
            requester_id: ID of the authenticated requester
            client_ip: Client IP address from request

        Returns:
            Created service request with auto-assigned values

        Raises:
            ValueError: If validation fails
        """
        # Auto-match business unit from IP address
        business_unit = await BusinessUnitService.get_business_unit_by_ip(
            db=db, ip_address=client_ip
        )
        business_unit_id = business_unit.id if business_unit else None

        if business_unit:
            logger.info(
                f"Auto-assigned business unit {business_unit.id} ({business_unit.name}) "
                f"for IP {client_ip}"
            )
        else:
            logger.warning(
                f"No business unit matched for IP {client_ip}, will remain unassigned"
            )

        # Calculate due_date based on default Medium priority (ID 3) SLA
        due_date = None
        priority = await db.execute(
            select(Priority).where(Priority.id == 3)  # Default Medium priority
        )
        priority_obj = priority.scalar_one_or_none()
        if priority_obj and priority_obj.resolution_time_hours:
            due_date = datetime.utcnow() + timedelta(hours=priority_obj.resolution_time_hours)

        # Create the request with minimal data
        service_request = ServiceRequest(
            title=request_data.title,
            description=None,  # Technician will fill this later
            requester_id=requester_id,
            ip_address=client_ip,
            business_unit_id=business_unit_id,
            priority_id=3,  # Default to Medium priority
            status_id=1,  # Default to Open status
            tag_id=request_data.tag_id,  # Tag selected by requester
            request_type_id=request_data.request_type_id,  # Request type selected by requester
            due_date=due_date,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        db.add(service_request)
        await db.flush()
        await db.refresh(service_request)

        # Create initial chat message with the request title
        from models import ChatMessage
        initial_message = ChatMessage(
            request_id=service_request.id,
            sender_id=requester_id,
            content=request_data.title,
            is_screenshot=False,
            sequence_number=1,
            ip_address=client_ip,
        )
        db.add(initial_message)
        await db.flush()

        logger.info(
            f"Created initial chat message for request {service_request.id} with title"
        )

        # Check if we should trigger WhatsApp notification for out-of-shift request
        if business_unit and business_unit.whatsapp_group_name:
            from services.shift_evaluator import ShiftEvaluator
            import pytz

            # Use Cairo timezone for shift evaluation (working hours are in Cairo time)
            cairo_tz = pytz.timezone("Africa/Cairo")
            cairo_now = datetime.now(cairo_tz)

            is_out_of_shift = ShiftEvaluator.is_out_of_shift(
                working_hours=business_unit.working_hours,
                check_time=cairo_now,
            )

            if is_out_of_shift:
                try:
                    from tasks.whatsapp_tasks import send_debounced_whatsapp_batch

                    send_debounced_whatsapp_batch.apply_async(
                        args=[str(service_request.id), "request_created"],
                        countdown=5,  # Short delay to ensure transaction commits
                        task_id=f"whatsapp_request_created_{service_request.id}",
                    )
                    logger.info(
                        f"Scheduled WhatsApp notification for out-of-shift request {service_request.id} "
                        f"(business_unit={business_unit.name})"
                    )
                except Exception as e:
                    # Don't fail request creation if scheduling fails
                    logger.error(
                        f"Failed to schedule WhatsApp notification for request {service_request.id}: {e}",
                        exc_info=True
                    )

        logger.info(
            f"Created service request {service_request.id} by requester {requester_id} "
            f"from IP {client_ip} with due_date={due_date}"
        )
        return service_request

    @staticmethod
    @safe_database_query("get_service_request_by_id", default_return=None)
    async def get_service_request_by_id(
        db: AsyncSession, request_id: UUID
    ) -> Optional[ServiceRequest]:
        """
        Get a service request by ID with optimized loading.

        Args:
            db: Database session
            request_id: ID of the service request

        Returns:
            Service request if found, None otherwise
        """
        result = await db.execute(
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.subcategory),
                selectinload(ServiceRequest.notes).selectinload(
                    RequestNote.creator
                ),
            )
            .where(ServiceRequest.id == request_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("get_service_request_detail", default_return=None)
    async def get_service_request_detail(
        db: AsyncSession, request_id: UUID
    ):
        """
        Get a service request by ID with nested relationships for detail view.

        Args:
            db: Database session
            request_id: ID of the service request

        Returns:
            ServiceRequestDetailRead schema with nested requester, status, priority
        """
        from models import Tag, Subcategory
        from schemas.service_request.service_request import (
            ServiceRequestDetailRead,
            RequesterInfo,
            StatusInfo,
            PriorityInfo,
            TagInfo,
            SubcategoryInfo,
        )
        from schemas.tag.tag import CategoryReadMinimal

        result = await db.execute(
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.requester),
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.priority),
                selectinload(ServiceRequest.tag).selectinload(Tag.category),
                selectinload(ServiceRequest.subcategory).selectinload(Subcategory.category),
            )
            .where(ServiceRequest.id == request_id)
        )
        request = result.scalar_one_or_none()

        if not request:
            return None

        # Get manager name from eager-loaded relationship
        manager_name = (
            request.requester.manager.full_name
            if request.requester.manager
            else None
        )

        # Build tag info if available
        tag_info = None
        if request.tag:
            category_info = None
            if request.tag.category:
                category_info = CategoryReadMinimal(
                    id=request.tag.category.id,
                    name=request.tag.category.name,
                    name_en=request.tag.category.name_en,
                    name_ar=request.tag.category.name_ar,
                )
            tag_info = TagInfo(
                id=request.tag.id,
                name_en=request.tag.name_en,
                name_ar=request.tag.name_ar,
                category=category_info,
            )

        # Build subcategory info if available
        subcategory_info = None
        if request.subcategory:
            subcategory_category_info = None
            if request.subcategory.category:
                subcategory_category_info = CategoryReadMinimal(
                    id=request.subcategory.category.id,
                    name=request.subcategory.category.name,
                    name_en=request.subcategory.category.name_en,
                    name_ar=request.subcategory.category.name_ar,
                )
            subcategory_info = SubcategoryInfo(
                id=request.subcategory.id,
                name=request.subcategory.name,
                name_en=request.subcategory.name_en,
                name_ar=request.subcategory.name_ar,
                category=subcategory_category_info,
            )

        # Check if this request is a sub-task and fetch parent info
        parent_request_id = None
        parent_request_title = None
        # Sub-tasks are identified by having a parent_task_id
        if request.parent_task_id:
            # This request is a sub-task, fetch parent request info
            parent_result = await db.execute(
                select(ServiceRequest).where(ServiceRequest.id == request.parent_task_id)
            )
            parent_request = parent_result.scalar_one_or_none()
            if parent_request:
                parent_request_id = parent_request.id
                parent_request_title = parent_request.title

        # If this is a subtask, fetch the technician who created it
        created_by_technician_info = None
        if request.parent_task_id and request.created_by:
            from models.database_models import User
            technician_result = await db.execute(
                select(User).where(User.id == request.created_by)
            )
            technician = technician_result.scalar_one_or_none()
            if technician:
                from schemas.service_request.service_request import TechnicianInfo
                created_by_technician_info = TechnicianInfo(
                    id=technician.id,
                    username=technician.username,
                    full_name=technician.full_name,
                    email=technician.email,
                    office=technician.office,
                )

        # Build the detailed response with nested objects
        return ServiceRequestDetailRead(
            id=request.id,
            title=request.title,
            description=request.description,
            status_id=request.status_id,
            priority_id=request.priority_id,
            requester_id=request.requester_id,
            tag_id=request.tag_id,
            subcategory_id=request.subcategory_id,
            created_at=request.created_at,
            updated_at=request.updated_at,
            assigned_at=request.assigned_at,
            first_response_at=request.first_response_at,
            resolved_at=request.resolved_at,
            closed_at=request.closed_at,
            status=StatusInfo(
                id=request.status.id,
                name=request.status.name,
                color=request.status.color,
                count_as_solved=request.status.count_as_solved,
            ),
            priority=PriorityInfo(
                id=request.priority.id,
                name=request.priority.name,
                response_time_minutes=request.priority.response_time_minutes,
                resolution_time_hours=request.priority.resolution_time_hours,
            ),
            requester=RequesterInfo(
                id=request.requester.id,
                username=request.requester.username,
                full_name=request.requester.full_name,
                email=request.requester.email,
                phone_number=request.requester.phone_number,
                title=request.requester.title,
                office=request.requester.office,
                manager_id=request.requester.manager_id,
                manager_name=manager_name,
            ),
            tag=tag_info,
            subcategory=subcategory_info,
            parent_request_id=parent_request_id,
            parent_request_title=parent_request_title,
            created_by_technician=created_by_technician_info,
        )

    @staticmethod
    async def get_service_requests(
        db: AsyncSession,
        page: int = 1,
        per_page: int = 50,
        category_id: Optional[int] = None,
        priority_id: Optional[int] = None,
        status_id: Optional[int] = None,
        search: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        requester_view: bool = False,
    ) -> Tuple[List[ServiceRequest], int]:
        """
        Get service requests with filtering, pagination, and caching.

        Args:
            db: Database session
            page: Page number (1-based)
            per_page: Items per page
            category_id: Filter by category
            priority_id: Filter by priority
            status_id: Filter by status
            search: Search in title and description
            sort_by: Field to sort by
            sort_order: Sort order (asc/desc)
            requester_view: If True, only show requests with visible_on_requester_page=True

        Returns:
            Tuple of (service_requests, total_count)
        """
        # Build base query with status join for requester filtering
        base_query = select(ServiceRequest).options(
            selectinload(ServiceRequest.subcategory),
        )

        # Join with status table if requester_view is enabled
        if requester_view:
            base_query = base_query.join(
                RequestStatus, ServiceRequest.status_id == RequestStatus.id
            )

        # Apply filters
        if category_id:
            # Note: category_id parameter filters by subcategory_id
            # (naming kept for API backward compatibility)
            base_query = base_query.where(
                ServiceRequest.subcategory_id == category_id
            )
        if priority_id:
            base_query = base_query.where(
                ServiceRequest.priority_id == priority_id
            )
        if status_id:
            base_query = base_query.where(
                ServiceRequest.status_id == status_id
            )
        if search:
            search_filter = or_(
                ServiceRequest.title.ilike(f"%{search}%"),
                ServiceRequest.description.ilike(f"%{search}%"),
            )
            base_query = base_query.where(search_filter)

        # Filter by visible_on_requester_page if requester_view is enabled
        if requester_view:
            base_query = base_query.where(
                RequestStatus.visible_on_requester_page == True
            )

        # Get total count
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await db.execute(count_query)
        total_count = count_result.scalar()

        # Apply sorting
        sort_field = getattr(
            ServiceRequest, sort_by, ServiceRequest.created_at
        )
        if sort_order.lower() == "desc":
            sort_field = sort_field.desc()
        else:
            sort_field = sort_field.asc()

        # Apply pagination and get results
        offset = (page - 1) * per_page
        query = base_query.order_by(sort_field).offset(offset).limit(per_page)

        result = await db.execute(query)
        service_requests = result.scalars().all()

        return service_requests, total_count

    @staticmethod
    @log_database_operation("delete_service_request")
    @transactional_database_operation
    async def delete_service_request(
        db: AsyncSession, request_id: UUID
    ) -> bool:
        """
        Delete a service request (soft delete recommended for audit trail).

        Args:
            db: Database session
            request_id: ID of the service request to delete

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If request not found
        """
        # Get the request first
        request = await RequestService.get_service_request_by_id(
            db, request_id
        )
        if not request:
            raise NotFoundError(
                f"Service request with ID {request_id} not found"
            )

        # Soft delete by setting a deleted flag or timestamp
        # For now, we'll implement a soft delete
        request.deleted_at = datetime.utcnow()
        request.updated_at = datetime.utcnow()

        logger.info(f"Soft deleted service request {request_id}")
        return True

    @staticmethod
    @safe_database_query("get_technician_view_requests", default_return=([], 0))
    @log_database_operation("technician view requests retrieval", level="debug")
    async def get_technician_view_requests(
        db: AsyncSession,
        user: User,
        view_type: str,
        *,
        business_unit_id: int | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[ServiceRequest], int]:
        """
        Get requests for a specific technician view.

        Args:
            db: Database session
            user: Current user (for region filtering)
            view_type: View type (unassigned, all_unsolved, my_unsolved, recently_updated, recently_solved)
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (requests list, total count)
        """
        from repositories.service_request_repository import ServiceRequestRepository

        # Existing views
        if view_type == "unassigned":
            return await ServiceRequestRepository.find_unassigned_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "all_unsolved":
            return await ServiceRequestRepository.find_unsolved_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "my_unsolved":
            return await ServiceRequestRepository.find_my_unsolved_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "recently_updated":
            return await ServiceRequestRepository.find_recently_updated_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "recently_solved":
            return await ServiceRequestRepository.find_recently_solved_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        # New views
        elif view_type == "all_your_requests":
            return await ServiceRequestRepository.find_all_your_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "urgent_high_priority":
            return await ServiceRequestRepository.find_urgent_high_priority_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "pending_requester_response":
            return await ServiceRequestRepository.find_pending_requester_response_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "pending_subtask":
            return await ServiceRequestRepository.find_pending_subtask_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "new_today":
            return await ServiceRequestRepository.find_new_today_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        elif view_type == "in_progress":
            return await ServiceRequestRepository.find_in_progress_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )
        else:
            # Default to unassigned
            return await ServiceRequestRepository.find_unassigned_requests(
                db, user, business_unit_id=business_unit_id, page=page, per_page=per_page
            )

    @staticmethod
    @safe_database_query("get_technician_view_counts", default_return={})
    @log_database_operation("technician view counts retrieval", level="debug")
    async def get_technician_view_counts(
        db: AsyncSession, user: User, business_unit_id: int | None = None
    ) -> dict[str, int]:
        """
        Get counts for all technician views.

        **NOTE**: Counts include both parent tasks AND subtasks.

        Args:
            db: Database session
            user: Current user (for region filtering)
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.

        Returns:
            Dict with view counts
        """
        from repositories.service_request_repository import ServiceRequestRepository

        return await ServiceRequestRepository.get_view_counts(db, user, business_unit_id)

    @staticmethod
    @safe_database_query("get_view_filter_counts", default_return={"all": 0, "parents": 0, "subtasks": 0})
    @log_database_operation("view filter counts retrieval", level="debug")
    async def get_view_filter_counts(
        db: AsyncSession,
        user: User,
        view_type: str,
        business_unit_id: int | None = None,
    ) -> dict[str, int]:
        """
        Get ticket type counts (all/parents/subtasks) for a specific view.

        Args:
            db: Database session
            user: Current user (for region filtering)
            view_type: View type to count (unassigned, all_unsolved, etc.)
            business_unit_id: Optional filter. If -1, shows unassigned (null BU). If positive int, filters by specific BU.

        Returns:
            Dict with keys: all, parents, subtasks
        """
        from repositories.service_request_repository import ServiceRequestRepository

        # Get all requests for this view (without pagination) to count them
        # We use a large per_page to get all results for counting
        requests, total = await RequestService.get_technician_view_requests(
            db=db,
            user=user,
            view_type=view_type,
            business_unit_id=business_unit_id,
            page=1,
            per_page=10000,  # Large number to get all results
        )

        # Count parents (no parent_task_id) and subtasks (has parent_task_id)
        parents_count = sum(1 for req in requests if req.parent_task_id is None)
        subtasks_count = sum(1 for req in requests if req.parent_task_id is not None)

        return {
            "all": total,
            "parents": parents_count,
            "subtasks": subtasks_count,
        }

    @staticmethod
    @transactional_database_operation
    async def assign_user_to_request(
        db: AsyncSession,
        request_id: UUID,
        user_id: int,
        assigned_by: int,
        assigner_user: "User",
    ) -> ServiceRequest:
        """
        Assign a user to a service request as a technician.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User ID to assign
            assigned_by: User ID who made the assignment
            assigner_user: Full User object for permission checking

        Returns:
            Updated service request

        Raises:
            ValueError: If user is already assigned or request is solved
            NotFoundError: If request not found

        Note:
            Permission model (NF-3): Any technician can modify any request that is NOT solved.
            The assignee concept is informational only, not a permission gate.
        """
        from repositories.service_request_repository import ServiceRequestRepository

        # Check if request exists and load status for count_as_solved check
        request = await RequestService.get_service_request_by_id(db, request_id)
        if not request:
            raise NotFoundError(f"Service request with ID {request_id} not found")

        # NEW PERMISSION MODEL: Block modifications to solved requests only
        # Any technician can modify any request that is NOT solved (count_as_solved=False)
        if request.status and request.status.count_as_solved:
            raise ValueError("Cannot add assignees to a solved request")

        # Check if user is already assigned
        existing_assignment = await ServiceRequestRepository.check_existing_assignment(
            db, request_id, user_id
        )
        if existing_assignment:
            raise ValueError(f"This user is already assigned to this request")

        # Create the assignment
        await ServiceRequestRepository.create_assignment(
            db, request_id, user_id, assigned_by
        )

        # Update request status to "in-progress" (status_id=8) if currently Open (status_id=1)
        if request.status_id == 1:
            update_data = ServiceRequestUpdate(status_id=8)  # 8 = in-progress
            updated_request = await RequestService.update_service_request(
                db, request_id, update_data
            )
        else:
            # Re-fetch to get updated data
            updated_request = await RequestService.get_service_request_by_id(
                db, request_id
            )

        if not updated_request:
            raise NotFoundError(f"Service request with ID {request_id} not found")

        logger.info(
            f"Assigned user {user_id} as technician to request {request_id} by {assigned_by}"
        )
        return updated_request

    @staticmethod
    @transactional_database_operation
    async def assign_technician_to_request(
        db: AsyncSession,
        request_id: UUID,
        technician_id: int,
        assigned_by: int,
    ) -> ServiceRequest:
        """
        Assign a technician to a service request (backward compatibility).

        Args:
            db: Database session
            request_id: Service request ID
            technician_id: Technician user ID to assign
            assigned_by: User ID who made the assignment

        Returns:
            Updated service request
        """
        from models import User, UserRole
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        # Fetch assigner user with roles
        result = await db.execute(
            select(User)
            .where(User.id == assigned_by)
            .options(selectinload(User.user_roles).selectinload(UserRole.role))
        )
        assigner_user = result.scalar_one_or_none()
        if not assigner_user:
            raise NotFoundError(f"User with ID {assigned_by} not found")

        return await RequestService.assign_user_to_request(
            db, request_id, technician_id, assigned_by, assigner_user
        )

    @staticmethod
    @transactional_database_operation
    async def unassign_user_from_request(
        db: AsyncSession,
        request_id: UUID,
        user_id: int,
        unassigner_user: "User",
    ) -> bool:
        """
        Unassign a user from a service request.

        Args:
            db: Database session
            request_id: Service request ID
            user_id: User ID to unassign
            unassigner_user: Full User object (kept for API compatibility, not used for permission checks)

        Returns:
            True if unassigned successfully

        Raises:
            ValueError: If user is not assigned, trying to remove last assignee, or request is solved
            NotFoundError: If request not found

        Note:
            Permission model (NF-3): Any technician can modify any request that is NOT solved.
            The assignee concept is informational only, not a permission gate.
        """
        from repositories.service_request_repository import ServiceRequestRepository

        # Check if request exists
        request = await RequestService.get_service_request_by_id(db, request_id)
        if not request:
            raise NotFoundError(f"Service request with ID {request_id} not found")

        # NEW PERMISSION MODEL: Block modifications to solved requests only
        # Any technician can modify any request that is NOT solved (count_as_solved=False)
        if request.status and request.status.count_as_solved:
            raise ValueError("Cannot remove assignees from a solved request")

        # Check assignee count
        assignee_count = await ServiceRequestRepository.count_assignees(db, request_id)

        # Cannot remove the last assignee (still enforced)
        if assignee_count == 1:
            raise ValueError("must_have_assignee")

        # Check if user is assigned and remove the assignment
        success = await ServiceRequestRepository.delete_assignment(
            db, request_id, user_id
        )

        if not success:
            raise ValueError(f"This user is not assigned to this request")

        logger.info(f"Unassigned user {user_id} from request {request_id}")
        return True

    @staticmethod
    @transactional_database_operation
    async def unassign_technician_from_request(
        db: AsyncSession,
        request_id: UUID,
        technician_id: int,
        unassigner_id: int,
    ) -> bool:
        """
        Unassign a technician from a service request (backward compatibility).

        Args:
            db: Database session
            request_id: Service request ID
            technician_id: Technician user ID to unassign
            unassigner_id: User ID who is removing the assignment

        Returns:
            True if unassigned successfully
        """
        from models import User, UserRole
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        # Fetch unassigner user with roles
        result = await db.execute(
            select(User)
            .where(User.id == unassigner_id)
            .options(selectinload(User.user_roles).selectinload(UserRole.role))
        )
        unassigner_user = result.scalar_one_or_none()
        if not unassigner_user:
            raise NotFoundError(f"User with ID {unassigner_id} not found")

        return await RequestService.unassign_user_from_request(
            db, request_id, technician_id, unassigner_user
        )

    @staticmethod
    @transactional_database_operation
    async def take_request(
        db: AsyncSession,
        request_id: UUID,
        technician_id: int,
    ) -> ServiceRequest:
        """
        Technician takes (self-assigns) an unassigned request.

        This creates a RequestAssignee record and updates the request status to 'on-progress'.

        IMPORTANT: This endpoint is ONLY for self-assignment when request has 0 assignees.

        Args:
            db: Database session
            request_id: Service request ID
            technician_id: Technician user ID taking the request

        Returns:
            Updated service request

        Raises:
            ValueError: If request already has assignees or user already assigned
            NotFoundError: If request or technician not found
        """
        from models import User, UserRole
        from repositories.service_request_repository import ServiceRequestRepository
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        # Check assignee count FIRST - must be 0 for take to work
        assignee_count = await ServiceRequestRepository.count_assignees(db, request_id)

        if assignee_count > 0:
            raise ValueError(
                "Cannot take request that already has assignees. Request is already assigned."
            )

        # Get technician user with roles for permission check
        result = await db.execute(
            select(User)
            .where(User.id == technician_id)
            .options(selectinload(User.user_roles).selectinload(UserRole.role))
        )
        technician_user = result.scalar_one_or_none()

        if not technician_user:
            raise NotFoundError(f"Technician with ID {technician_id} not found")

        # Use the generic assignment method
        # This will NOT trigger supervisor check because assignee_count == 0
        return await RequestService.assign_user_to_request(
            db, request_id, technician_id, technician_id, technician_user
        )

    @staticmethod
    async def get_request_assignees(
        db: AsyncSession, request_id: UUID
    ) -> List[RequestAssignee]:
        """
        Get all assignees for a service request.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            List of RequestAssignee records

        Raises:
            NotFoundError: If request not found
        """
        from repositories.service_request_repository import ServiceRequestRepository

        # Check if request exists
        request = await RequestService.get_service_request_by_id(db, request_id)
        if not request:
            raise NotFoundError(f"Service request with ID {request_id} not found")

        # Get all assignments for this request
        return await ServiceRequestRepository.get_request_assignees(
            db, request_id
        )


    # ==================================================================================
    # SUB-TASK METHODS
    # ==================================================================================

    @staticmethod
    @transactional_database_operation
    async def create_sub_task(
        db: AsyncSession,
        parent_id: UUID,
        sub_task_data: dict,
        current_user_id: UUID
    ) -> ServiceRequest:
        """
        Create a sub-task under a parent request.

        Args:
            db: Database session
            parent_id: Parent request ID
            sub_task_data: Sub-task data (title, description, etc.)
            current_user_id: ID of user creating the sub-task

        Returns:
            Created sub-task (ServiceRequest)

        Raises:
            ValueError: If parent doesn't exist, is closed, or is itself a sub-task
        """
        # Validate parent exists and load with status
        from sqlmodel import select
        from models.database_models import ServiceRequest, RequestStatus
        from sqlalchemy.orm import selectinload

        result = await db.execute(
            select(ServiceRequest)
            .options(selectinload(ServiceRequest.status))
            .where(ServiceRequest.id == parent_id)
        )
        parent = result.scalar_one_or_none()

        if not parent:
            raise NotFoundError(f"Parent request {parent_id} not found")

        # Validate parent is not a sub-task (max 1 level nesting)
        if parent.parent_task_id is not None:
            raise ValueError("Cannot create sub-task of a sub-task (max 1 level nesting)")

        # Validate parent is not closed/solved (using count_as_solved flag)
        if parent.status and parent.status.count_as_solved:
            raise ValueError("Cannot create sub-task for a closed/resolved request")

        # Set parent_task_id
        sub_task_data["parent_task_id"] = parent_id

        # Set created_by
        sub_task_data["created_by"] = current_user_id

        # Inherit business_unit_id from parent if not provided
        if "business_unit_id" not in sub_task_data or sub_task_data["business_unit_id"] is None:
            sub_task_data["business_unit_id"] = parent.business_unit_id

        # Inherit requester_id from parent
        sub_task_data["requester_id"] = parent.requester_id

        # Set defaults
        sub_task_data.setdefault("is_active", True)
        sub_task_data.setdefault("is_deleted", False)
        sub_task_data.setdefault("status_id", 1)  # Open

        # Extract description to create as a note (don't store in main description field)
        description_text = sub_task_data.pop("description", None)

        # Create the sub-task
        sub_task = ServiceRequest(**sub_task_data)
        db.add(sub_task)
        await db.flush()  # Flush to get the sub_task.id

        # If description was provided, create it as a note
        if description_text:
            from models.database_models import RequestNote
            note = RequestNote(
                request_id=sub_task.id,
                created_by=current_user_id,
                note=description_text,
                is_system_generated=False
            )
            db.add(note)
            await db.flush()  # Flush to persist the note

        # Refresh to get the latest state (commit is handled by @transactional_database_operation)
        await db.refresh(sub_task)

        return sub_task

    @staticmethod
    @safe_database_query
    async def get_sub_tasks(
        db: AsyncSession,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 20
    ) -> List[ServiceRequest]:
        """
        Get all sub-tasks for a parent request.

        Args:
            db: Database session
            parent_id: Parent request ID
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return

        Returns:
            List of sub-tasks ordered by 'order' field
        """
        from sqlmodel import select

        query = (
            select(ServiceRequest)
            .where(ServiceRequest.parent_task_id == parent_id)
            .where(ServiceRequest.is_deleted == False)
            .order_by(ServiceRequest.order.asc(), ServiceRequest.created_at.asc())
            .offset(skip)
            .limit(limit)
        )

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    @safe_database_query
    async def get_sub_task_stats(
        db: AsyncSession,
        parent_id: UUID
    ) -> dict:
        """
        Get statistics for sub-tasks of a parent request.

        Args:
            db: Database session
            parent_id: Parent request ID

        Returns:
            Dictionary with stats: {total, by_status, blocked_count, overdue_count, completed_count}
        """
        from sqlmodel import select, func
        from datetime import datetime, timezone

        # Get all sub-tasks for parent
        query = select(ServiceRequest).where(
            ServiceRequest.parent_task_id == parent_id,
            ServiceRequest.is_deleted == False
        )
        result = await db.execute(query)
        sub_tasks = list(result.scalars().all())

        # Calculate stats
        stats = {
            "total": len(sub_tasks),
            "by_status": {},
            "blocked_count": 0,
            "overdue_count": 0,
            "completed_count": 0
        }

        now = datetime.now(timezone.utc)

        for task in sub_tasks:
            # Count by status
            status_id = task.status_id
            stats["by_status"][status_id] = stats["by_status"].get(status_id, 0) + 1

            # Count blocked
            if task.is_blocked:
                stats["blocked_count"] += 1

            # Count overdue (due_date passed and not completed)
            if task.due_date and task.due_date < now and not task.completed_at:
                stats["overdue_count"] += 1

            # Count completed
            if task.completed_at:
                stats["completed_count"] += 1

        return stats

    @staticmethod
    @safe_database_query
    async def update_sub_task_order(
        db: AsyncSession,
        parent_id: UUID,
        task_ids_in_order: List[UUID]
    ) -> None:
        """
        Reorder sub-tasks by updating their 'order' field.

        Args:
            db: Database session
            parent_id: Parent request ID
            task_ids_in_order: List of task IDs in desired order
        """
        from sqlmodel import select

        for index, task_id in enumerate(task_ids_in_order):
            query = select(ServiceRequest).where(
                ServiceRequest.id == task_id,
                ServiceRequest.parent_task_id == parent_id
            )
            result = await db.execute(query)
            task = result.scalar_one_or_none()

            if task:
                task.order = index
                db.add(task)

        await db.commit()

    @staticmethod
    @safe_database_query
    async def get_technician_tasks(
        db: AsyncSession,
        technician_id: UUID,
        status_filter: Optional[List[int]] = None,
        skip: int = 0,
        limit: int = 20
    ) -> List[ServiceRequest]:
        """
        Get all tasks (including sub-tasks) assigned to a technician.

        Args:
            db: Database session
            technician_id: Technician user ID
            status_filter: Optional list of status IDs to filter by
            skip: Pagination offset
            limit: Pagination limit

        Returns:
            List of ServiceRequest (both top-level and sub-tasks)
        """
        from sqlmodel import select

        query = (
            select(ServiceRequest)
            .where(ServiceRequest.assigned_to_technician_id == technician_id)
            .where(ServiceRequest.is_deleted == False)
        )

        if status_filter:
            query = query.where(ServiceRequest.status_id.in_(status_filter))

        query = query.order_by(ServiceRequest.created_at.desc()).offset(skip).limit(limit)

        result = await db.execute(query)
        return list(result.scalars().all())


    @staticmethod
    @safe_database_query("get_full_request_details", default_return=None)
    async def get_full_request_details(
        db: AsyncSession,
        request_id: UUID,
        messages_limit: int = 100,
        sub_tasks_limit: int = 20
    ):
        """
        Get complete request details in a single optimized call.

        Fetches comprehensive request details using 6 sequential queries:
        1. Ticket details with nested relationships
        2. Notes for the request
        3. Assignees for the request
        4. Initial chat messages (last N)
        5. Sub-tasks
        6. Sub-task statistics

        Note: Queries run sequentially to avoid AsyncSession concurrent access issues.

        Args:
            db: Database session
            request_id: Request UUID
            messages_limit: Maximum number of messages to return (default 100)
            sub_tasks_limit: Maximum number of sub-tasks to return (default 20)

        Returns:
            FullRequestDetailsResponse or None if request not found
        """
        from datetime import datetime

        from repositories.chat_repository import ChatMessageRepository
        from services.request_note_service import RequestNoteService
        from repositories.service_request_repository import ServiceRequestRepository
        from schemas.service_request.full_details import FullRequestDetailsResponse
        from schemas.service_request.service_request import (
            AssigneeInfo,
            ServiceRequestDetailRead,
            ServiceRequestListItem,
            SubTaskStats,
        )
        from schemas.request_note.request_note import RequestNoteDetail
        from schemas.chat_message.chat_message import ChatMessageRead, MessageSenderInfo

        # Execute queries sequentially (AsyncSession doesn't support concurrent operations)
        # Note: asyncio.gather() with the same session causes "provisioning connection" errors
        try:
            ticket = await RequestService.get_service_request_detail(db, request_id)
            notes_result = await RequestNoteService.get_request_notes(db, request_id, page=1, per_page=100)
            assignees = await ServiceRequestRepository.get_request_assignees(db, request_id)
            messages_result = await ChatMessageRepository.find_by_request_id_with_relations(
                db, request_id, limit=messages_limit, offset=0
            )
            sub_tasks = await RequestService.get_sub_tasks(db, request_id, skip=0, limit=sub_tasks_limit)
            sub_task_stats_raw = await RequestService.get_sub_task_stats(db, request_id)
        except Exception as e:
            # If any query fails, return None
            logger.error(f"Error fetching request details for {request_id}: {e}")
            return None

        # If ticket not found, return None
        if ticket is None:
            return None

        # Process notes
        notes_list = []
        if notes_result:
            notes_data, _ = notes_result
            for note in notes_data:
                notes_list.append(RequestNoteDetail(
                    id=note.id,
                    request_id=note.request_id,
                    note=note.note,
                    created_by=note.created_by,
                    is_system_generated=note.is_system_generated,
                    created_at=note.created_at,
                    creator_username=note.creator.username if note.creator else None,
                    creator_full_name=note.creator.full_name if note.creator else None,
                ))

        # Process assignees
        assignees_list = []
        if assignees:
            for assignment in assignees:
                assignees_list.append(AssigneeInfo(
                    id=assignment.id,
                    user_id=assignment.assignee_id,  # Model uses assignee_id, not user_id
                    username=assignment.assignee.username if assignment.assignee else "",
                    full_name=assignment.assignee.full_name if assignment.assignee else None,
                    title=assignment.assignee.title if assignment.assignee else None,
                    assigned_by=assignment.assigned_by,
                    assigned_by_name=assignment.assigner.full_name if assignment.assigner else None,
                    created_at=assignment.created_at,
                ))

        # Process messages
        messages_list = []
        if messages_result:
            messages_data, _ = messages_result
            for msg in messages_data:
                sender_info = None
                if msg.sender:
                    sender_info = MessageSenderInfo(
                        id=msg.sender.id,
                        username=msg.sender.username,
                        full_name=msg.sender.full_name,
                        email=msg.sender.email,
                    )
                messages_list.append(ChatMessageRead(
                    id=msg.id,
                    request_id=msg.request_id,
                    sender_id=msg.sender_id,
                    sender=sender_info,
                    content=msg.content,
                    is_screenshot=msg.is_screenshot,
                    screenshot_file_name=msg.screenshot_file_name,
                    is_read=msg.is_read,
                    is_read_by_current_user=False,  # Will be determined client-side
                    created_at=msg.created_at,
                    updated_at=msg.updated_at,
                    read_at=msg.read_at,
                    ip_address=msg.ip_address,
                    client_temp_id=None,
                ))

        # Process sub-tasks
        sub_tasks_list = []
        if sub_tasks:
            for task in sub_tasks:
                sub_tasks_list.append(ServiceRequestListItem(
                    id=task.id,
                    title=task.title,
                    subcategory_id=task.subcategory_id,
                    tag_id=task.tag_id,
                    business_unit_id=task.business_unit_id,
                    status_id=task.status_id,
                    priority_id=task.priority_id,
                    requester_id=task.requester_id,
                    created_at=task.created_at,
                    updated_at=task.updated_at,
                    due_date=task.due_date,
                    parent_task_id=task.parent_task_id,
                    is_blocked=task.is_blocked,
                    assigned_to_section_id=task.assigned_to_section_id,
                    assigned_to_technician_id=task.assigned_to_technician_id,
                    completed_at=task.completed_at,
                ))

        # Process sub-task stats
        sub_task_stats = SubTaskStats(
            total=0, by_status={}, blocked_count=0, overdue_count=0, completed_count=0
        )
        if sub_task_stats_raw:
            sub_task_stats = SubTaskStats(
                total=sub_task_stats_raw.get("total", 0),
                by_status=sub_task_stats_raw.get("by_status", {}),
                blocked_count=sub_task_stats_raw.get("blocked_count", 0),
                overdue_count=sub_task_stats_raw.get("overdue_count", 0),
                completed_count=sub_task_stats_raw.get("completed_count", 0),
            )

        # Build and return the combined response
        return FullRequestDetailsResponse(
            ticket=ticket,
            notes=notes_list,
            assignees=assignees_list,
            initial_messages=messages_list,
            sub_tasks=sub_tasks_list,
            sub_task_stats=sub_task_stats,
            fetched_at=datetime.utcnow(),
        )


# Helper exception classes
class NotFoundError(Exception):
    """Exception raised when a resource is not found."""

    pass
