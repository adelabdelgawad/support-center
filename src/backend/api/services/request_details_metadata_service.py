"""
Request Details Metadata service for consolidated metadata fetching.
Fetches all metadata needed for request details page in parallel.
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from api.services.priority_service import PriorityService
from api.services.request_status_service import RequestStatusService
from api.services.user_service import UserService
from api.services.category_service import CategoryService
from api.schemas.priority import PriorityListItem
from api.schemas.request_status import RequestStatusListItem
from api.schemas.category import CategoryWithSubcategories
from api.schemas.request_details_metadata import RequestDetailsMetadataResponse

logger = logging.getLogger(__name__)


class RequestDetailsMetadataService:
    """Service for fetching consolidated request details metadata."""

    def __init__(self, session: AsyncSession):
        """
        Initialize service with database session.

        Args:
            session: Database session
        """
        self.db = session

    async def get_request_details_metadata(self) -> RequestDetailsMetadataResponse:
        """
        Fetch all metadata needed for request details page.

        This consolidates the following API calls into one:
        - GET /api/v1/priorities
        - GET /api/v1/metadata/statuses
        - GET /api/v1/technicians
        - GET /api/v1/categories

        Returns:
            RequestDetailsMetadataResponse with all metadata
        """
        try:
            # Instantiate services with session
            priority_service = PriorityService(self.db)
            status_service = RequestStatusService(self.db)
            user_service = UserService(self.db)
            category_service = CategoryService(self.db)

            # Execute sequentially
            priorities = await priority_service.list_priorities(active_only=True)

            # list_request_statuses returns (statuses, total, active_count, inactive_count, readonly_count)
            statuses_list, *_ = await status_service.list_request_statuses(
                is_active=True, page=1, per_page=1000
            )

            # list_users returns (users, total)
            technicians_list, _ = await user_service.list_users(
                is_technician=True, is_active=True, page=1, per_page=1000
            )

            categories = await category_service.list_categories(
                active_only=True, include_subcategories=True
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
        except Exception as e:
            logger.error(f"Failed to fetch request details metadata: {e}")
            raise
