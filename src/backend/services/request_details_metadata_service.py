"""
Request Details Metadata service for consolidated metadata fetching.
Fetches all metadata needed for request details page in parallel.
"""
import asyncio
import logging
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import log_database_operation, safe_database_query
from services.priority_service import PriorityService
from services.request_status_service import RequestStatusService
from services.user_service import UserService
from services.category_service import CategoryService
from schemas.priority.priority import PriorityListItem
from schemas.request_status.request_status import RequestStatusListItem
from schemas.user.user import UserListItem
from schemas.category.category import CategoryWithSubcategories
from schemas.request_details_metadata import RequestDetailsMetadataResponse

# Module-level logger
logger = logging.getLogger(__name__)


class RequestDetailsMetadataService:
    """Service for fetching consolidated request details metadata."""

    @staticmethod
    @safe_database_query("get_request_details_metadata")
    @log_database_operation("request details metadata retrieval", level="debug")
    async def get_request_details_metadata(
        db: AsyncSession
    ) -> RequestDetailsMetadataResponse:
        """
        Fetch all metadata needed for request details page in parallel.

        This consolidates the following API calls into one:
        - GET /api/v1/priorities
        - GET /api/v1/metadata/statuses
        - GET /api/v1/technicians
        - GET /api/v1/categories

        Args:
            db: Database session

        Returns:
            RequestDetailsMetadataResponse with all metadata
        """
        # Fetch all metadata in parallel using asyncio.gather
        priorities_task = PriorityService.list_priorities(db, active_only=True)
        statuses_task = RequestStatusService.list_request_statuses(
            db, is_active=True, page=1, per_page=1000
        )
        technicians_task = UserService.list_users(
            db, is_technician=True, is_active=True, page=1, per_page=1000
        )
        categories_task = CategoryService.list_categories(
            db, active_only=True, include_subcategories=True
        )

        # Wait for all tasks to complete
        # Note: list_request_statuses returns (statuses, total, active_count, inactive_count, readonly_count)
        # list_users returns (users, total)
        priorities, (statuses_list, *_), (technicians_list, _), categories = await asyncio.gather(
            priorities_task, statuses_task, technicians_task, categories_task
        )

        # Convert to list item schemas
        priority_items = [PriorityListItem.model_validate(p) for p in priorities]
        status_items = [RequestStatusListItem.model_validate(s) for s in statuses_list]
        technician_items = technicians_list  # Already UserListItem from service
        category_items = [
            CategoryWithSubcategories.model_validate(c) for c in categories
        ]

        return RequestDetailsMetadataResponse(
            priorities=priority_items,
            statuses=status_items,
            technicians=technician_items,
            categories=category_items,
        )
