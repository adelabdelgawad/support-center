"""
Response schemas for technician request views endpoint.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from core.schema_base import HTTPSchemaModel


class RequesterInfo(HTTPSchemaModel):
    """Requester information for request list."""

    id: UUID
    full_name: Optional[str] = None


class StatusInfo(HTTPSchemaModel):
    """Status information for request list."""

    id: int
    name: str
    color: Optional[str] = None
    count_as_solved: bool = False


class PriorityInfo(HTTPSchemaModel):
    """Priority information for request list."""

    id: int
    name: str
    response_time_minutes: int
    resolution_time_hours: int


class LastMessageInfo(HTTPSchemaModel):
    """Last message information for request list."""

    content: str
    sender_name: Optional[str] = None
    created_at: datetime
    sequence_number: int  # For deterministic chat sync validation


class BusinessUnitInfo(HTTPSchemaModel):
    """Business unit information for request list."""

    id: int
    name: str


class TagInfo(HTTPSchemaModel):
    """Tag information for request list."""

    id: int
    name_en: str
    name_ar: str


class CategoryInfo(HTTPSchemaModel):
    """Category information for request list."""

    id: int
    name: str
    name_en: str
    name_ar: str


class SubcategoryInfo(HTTPSchemaModel):
    """Subcategory information for request list."""

    id: int
    name: str
    name_en: str
    name_ar: str


class TechnicianRequestListItem(HTTPSchemaModel):
    """Single request item in technician views."""

    id: UUID
    status: StatusInfo
    subject: str
    requester: RequesterInfo
    requested: datetime  # created_at
    due_date: Optional[datetime] = None  # SLA-based due date
    priority: PriorityInfo
    last_message: Optional[LastMessageInfo] = None
    business_unit: Optional[BusinessUnitInfo] = None
    tag: Optional[TagInfo] = None
    category: Optional[CategoryInfo] = None
    subcategory: Optional[SubcategoryInfo] = None
    requester_has_unread: bool = False  # Whether requester has unread messages from technician (requester hasn't read)
    technician_has_unread: bool = False  # Whether technician has unread messages from requester (agent needs to read)

    # Sub-task fields
    parent_task_id: Optional[UUID] = None  # If this is a subtask
    is_blocked: bool = False
    assigned_to_section_id: Optional[int] = None
    assigned_to_technician_id: Optional[UUID] = None
    completed_at: Optional[datetime] = None
    estimated_hours: Optional[float] = None


class ViewCounts(HTTPSchemaModel):
    """Counts for all views in sidebar."""

    # Existing views
    unassigned: int
    all_unsolved: int
    my_unsolved: int
    recently_updated: int
    recently_solved: int
    # New views
    all_your_requests: int = 0
    urgent_high_priority: int = 0
    pending_requester_response: int = 0
    pending_subtask: int = 0
    new_today: int = 0
    in_progress: int = 0


class TechnicianViewsResponse(HTTPSchemaModel):
    """Response for technician views endpoint."""

    data: list[TechnicianRequestListItem]
    counts: ViewCounts
    filter_counts: "TicketTypeCounts"  # Counts for current view (All/Parents/Subtasks)
    total: int
    page: int
    per_page: int


class BusinessUnitCount(HTTPSchemaModel):
    """Business unit with ticket count."""

    id: int
    name: str
    count: int


class BusinessUnitCountsResponse(HTTPSchemaModel):
    """Response for business unit counts endpoint."""

    business_units: list[BusinessUnitCount]
    total: int
    unassigned_count: int = 0


class TicketTypeCounts(HTTPSchemaModel):
    """Global ticket type counts (not filtered by view)."""

    all: int
    parents: int  # Tasks without parent_task_id
    subtasks: int  # Tasks with parent_task_id
