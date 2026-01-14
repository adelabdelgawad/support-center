"""
Request Details Metadata schema for consolidated API response.
Combines priorities, statuses, technicians, and categories into a single response.
"""
from typing import List

from core.schema_base import HTTPSchemaModel
from schemas.priority.priority import PriorityListItem
from schemas.request_status.request_status import RequestStatusListItem
from schemas.user.user import UserListItem
from schemas.category.category import CategoryWithSubcategories


class RequestDetailsMetadataResponse(HTTPSchemaModel):
    """
    Consolidated response schema for request details metadata.

    This combines all the metadata needed for the request details page:
    - Priorities: for priority dropdown/display
    - Statuses: for status dropdown/display
    - Technicians: for assignee selection
    - Categories: for category/subcategory selection
    """
    priorities: List[PriorityListItem]
    statuses: List[RequestStatusListItem]
    technicians: List[UserListItem]
    categories: List[CategoryWithSubcategories]
