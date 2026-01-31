"""
Service Request schemas for API validation and serialization.

REFACTORED:
- Renamed all "agent" references to "technician"
- Removed deprecated fields (is_escalated, escalation_reason, estimated_hours, actual_hours)
- Removed deprecated schemas (ServiceRequestEscalation, ServiceRequestTimeTracking)
- Replaced service_section_id with tag_id for tag-based classification
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel
from api.schemas.tag import CategoryReadMinimal


class ServiceRequestBase(HTTPSchemaModel):
    """Base service request schema with common fields."""
    subcategory_id: Optional[int] = None
    tag_id: Optional[int] = None  # Tag for request classification (replaces service_section_id)
    title: str = Field(..., min_length=5, max_length=200)
    description: Optional[str] = Field(None, min_length=10)
    priority_id: int = 3  # Default to Medium priority
    resolution: Optional[str] = None
    ip_address: Optional[str] = Field(None, max_length=45)
    computer_name: Optional[str] = Field(None, max_length=100)
    business_unit_id: Optional[int] = None  # Auto-assigned or manually set

    # Sub-task hierarchy
    parent_task_id: Optional[UUID] = None

    # Assignment tracking
    assigned_to_section_id: Optional[int] = None
    assigned_to_technician_id: Optional[UUID] = None

    # Task management
    order: Optional[int] = None
    is_blocked: bool = False
    blocked_reason: Optional[str] = None

    # Time tracking
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None


class ServiceRequestCreateByRequester(HTTPSchemaModel):
    """Schema for requester creating a new service request - only title required."""
    title: str = Field(..., min_length=5, max_length=200, description="Brief summary of the request")
    tag_id: Optional[int] = Field(None, description="Request classification tag")
    request_type_id: Optional[int] = Field(None, description="Request type (Incident, Service Request, etc.)")


class ServiceRequestCreate(ServiceRequestBase):
    """Schema for creating a new service request (legacy/internal use)."""
    requester_id: UUID
    category_id: int


class ServiceRequestUpdate(HTTPSchemaModel):
    """Schema for updating a service request (legacy/internal use)."""
    subcategory_id: Optional[int] = None
    tag_id: Optional[int] = None
    title: Optional[str] = Field(None, min_length=5, max_length=200)
    description: Optional[str] = Field(None, min_length=10)
    priority_id: Optional[int] = None
    status_id: Optional[int] = None
    resolution: Optional[str] = None
    business_unit_id: Optional[int] = None  # Allow manual update


class ServiceRequestUpdateByTechnician(HTTPSchemaModel):
    """Schema for technician updating a service request - fills in missing details."""
    description: Optional[str] = Field(None, min_length=10, description="Detailed description of the request")
    subcategory_id: Optional[int] = Field(None, description="Request subcategory")
    tag_id: Optional[int] = Field(None, description="Request classification tag")
    business_unit_id: Optional[int] = Field(None, description="Business unit (can override auto-assigned)")
    priority_id: Optional[int] = Field(None, description="Priority level")
    status_id: Optional[int] = Field(None, description="Request status")
    resolution: Optional[str] = Field(None, description="Resolution details")


class SubTaskCreate(HTTPSchemaModel):
    """Schema for creating a sub-task - minimal required fields."""
    title: str = Field(..., min_length=5, max_length=200, description="Sub-task title")
    description: Optional[str] = Field(None, min_length=10, description="Sub-task description")
    priority_id: Optional[int] = Field(3, description="Priority level (defaults to Medium)")
    assigned_to_section_id: int = Field(..., description="Assigned service section (required)")
    assigned_to_technician_id: Optional[UUID] = Field(None, description="Assigned technician")
    estimated_hours: Optional[float] = Field(None, description="Estimated hours to complete")
    due_date: Optional[datetime] = Field(None, description="Due date for the sub-task")


class ServiceRequestRead(ServiceRequestBase):
    """Schema for reading service request data."""
    id: UUID  # UUID that will be serialized as string in JSON
    requester_id: UUID
    status_id: int
    created_at: datetime
    updated_at: datetime
    assigned_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Soft delete and status
    is_active: bool = True
    is_deleted: bool = False

    # Audit fields
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class ServiceRequestListItem(HTTPSchemaModel):
    """Lightweight schema for service request lists."""
    id: UUID  # UUID that will be serialized as string in JSON
    title: str
    subcategory_id: Optional[int] = None
    tag_id: Optional[int] = None
    business_unit_id: Optional[int] = None
    status_id: int
    priority_id: int
    requester_id: UUID
    created_at: datetime
    updated_at: datetime
    due_date: Optional[datetime] = None

    # Sub-task fields
    parent_task_id: Optional[UUID] = None
    is_blocked: bool = False
    assigned_to_section_id: Optional[int] = None
    assigned_to_technician_id: Optional[UUID] = None
    completed_at: Optional[datetime] = None


class ServiceRequestDetail(ServiceRequestRead):
    """Detailed service request schema with relationship counts."""
    requester_username: Optional[str] = None
    chat_messages_count: int = 0
    attachments_count: int = 0
    response_time_hours: Optional[float] = None
    resolution_time_hours: Optional[float] = None


class ServiceRequestStatusUpdate(HTTPSchemaModel):
    """Schema for updating service request status."""
    status_id: int
    resolution: Optional[str] = Field(None, max_length=2000)
    note: Optional[str] = Field(None, max_length=2000)


class AssignTechnicianRequest(HTTPSchemaModel):
    """Schema for assigning a technician to a request."""
    technician_id: UUID = Field(..., description="ID of the technician to assign")


class ServiceRequestPriorityUpdate(HTTPSchemaModel):
    """Schema for updating service request priority."""
    priority_id: int
    reason: Optional[str] = Field(None, max_length=500)


class ServiceRequestStats(HTTPSchemaModel):
    """Schema for service request statistics."""
    total_requests: int
    status_distribution: dict = {}
    priority_distribution: dict = {}
    avg_resolution_time_seconds: float = 0.0
    date_range: dict = {}


class ServiceRequestQueue(HTTPSchemaModel):
    """Schema for technician queue views."""
    requests: List[ServiceRequestListItem]
    total: int
    high_priority_count: int
    urgent_count: int
    critical_count: int


class ServiceRequestSearch(HTTPSchemaModel):
    """Schema for service request search."""
    query: str = Field(..., min_length=2, max_length=200)
    subcategory_id: Optional[int] = None
    business_unit_id: Optional[int] = None
    status_id: Optional[int] = None
    priority_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


class ServiceRequestList(HTTPSchemaModel):
    """Schema for paginated service request list."""
    items: List[ServiceRequestListItem]
    total: int
    page: int
    per_page: int
    pages: int


class RequesterInfo(HTTPSchemaModel):
    """Requester information for detailed view."""
    id: UUID
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    title: Optional[str] = None
    office: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager_name: Optional[str] = None


class TechnicianInfo(HTTPSchemaModel):
    """Technician/Creator information for subtask detail view."""
    id: UUID
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    office: Optional[str] = None


class StatusInfo(HTTPSchemaModel):
    """Status information for detailed view."""
    id: int
    name: str
    color: Optional[str] = None
    count_as_solved: bool = False


class PriorityInfo(HTTPSchemaModel):
    """Priority information for detailed view."""
    id: int
    name: str
    response_time_minutes: int
    resolution_time_hours: int


class TagInfo(HTTPSchemaModel):
    """Tag information with category for detail view."""
    id: int
    name_en: str
    name_ar: str
    category: Optional[CategoryReadMinimal] = None


class SubcategoryInfo(HTTPSchemaModel):
    """Subcategory information with category for detail view."""
    id: int
    name: str
    name_en: str
    name_ar: str
    category: Optional[CategoryReadMinimal] = None


class ServiceRequestDetailRead(HTTPSchemaModel):
    """Detailed service request schema with nested relationships."""
    id: UUID
    title: str
    description: Optional[str] = None
    status_id: int
    priority_id: int
    requester_id: UUID
    tag_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    assigned_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    status: StatusInfo
    priority: PriorityInfo
    requester: RequesterInfo
    tag: Optional[TagInfo] = None
    subcategory: Optional[SubcategoryInfo] = None
    # Sub-task information
    parent_request_id: Optional[UUID] = None  # If this is a sub-task
    parent_request_title: Optional[str] = None
    created_by_technician: Optional[TechnicianInfo] = None  # Technician who created this (for subtasks)


class AssigneeInfo(HTTPSchemaModel):
    """Assignee information for request assignments."""
    id: int  # This is the assignment ID, not user ID
    user_id: UUID  # This is the actual user ID
    username: str
    full_name: Optional[str] = None
    title: Optional[str] = None
    assigned_by: Optional[UUID] = None
    assigned_by_name: Optional[str] = None
    created_at: datetime


class RequestAssigneesResponse(HTTPSchemaModel):
    """Response schema for request assignees list."""
    request_id: UUID
    assignees: List[AssigneeInfo]
    total: int


class RequestAssigneesDetailedResponse(HTTPSchemaModel):
    """Response schema for detailed assignees (technicians only after CC removal)."""
    request_id: UUID
    technicians: List[AssigneeInfo]  # All assignees (CC removed)
    cc_members: List[AssigneeInfo] = []  # Kept for backward compatibility, always empty
    total_technicians: int
    total_cc: int = 0  # Always 0 since CC is removed


class SubTaskStats(HTTPSchemaModel):
    """Statistics for sub-tasks of a request."""
    total: int = 0
    by_status: dict = {}  # {status_id: count}
    blocked_count: int = 0
    overdue_count: int = 0
    completed_count: int = 0


class ServiceRequestWithChildren(ServiceRequestRead):
    """Service request with child tasks (sub-tasks)."""
    child_tasks: List[ServiceRequestListItem] = []
    child_tasks_count: int = 0
    child_tasks_stats: Optional[SubTaskStats] = None
