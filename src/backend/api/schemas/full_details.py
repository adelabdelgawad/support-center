"""
Full Request Details schema - combines all data needed for ticket detail page.

This schema consolidates multiple API responses into a single response,
reducing the number of API calls from 6 to 1 for the ticket detail page.
"""

from datetime import datetime
from typing import List

from pydantic import Field

from core.schema_base import HTTPSchemaModel
from api.schemas.service_request import (
    ServiceRequestDetailRead,
    AssigneeInfo,
    SubTaskStats,
    ServiceRequestListItem,
)
from api.schemas.request_note import RequestNoteDetail
from api.schemas.chat_message import ChatMessageRead


class FullRequestDetailsResponse(HTTPSchemaModel):
    """
    Complete request details response for ticket detail page.

    Combines all data that was previously fetched via 6 separate API calls:
    - GET /requests/{id} -> ticket
    - GET /request-notes/{id}/notes -> notes
    - GET /requests/{id}/assignees -> assignees
    - GET /chat/messages/request/{id} -> initialMessages
    - GET /requests/{id}/sub-tasks -> subTasks
    - GET /requests/{id}/sub-tasks/stats -> subTaskStats
    """

    # Core ticket data with nested relationships
    ticket: ServiceRequestDetailRead = Field(
        ..., description="Full ticket details with requester, status, priority"
    )

    # Notes
    notes: List[RequestNoteDetail] = Field(
        default_factory=list, description="Internal notes on the ticket"
    )

    # Assignees (technicians)
    assignees: List[AssigneeInfo] = Field(
        default_factory=list, description="Assigned technicians"
    )

    # Initial chat messages (last 100)
    initial_messages: List[ChatMessageRead] = Field(
        default_factory=list, description="Initial chat messages (last 100)"
    )

    # Sub-tasks
    sub_tasks: List[ServiceRequestListItem] = Field(
        default_factory=list, description="Child sub-tasks"
    )

    # Sub-task statistics
    sub_task_stats: SubTaskStats = Field(
        default_factory=lambda: SubTaskStats(
            total=0, by_status={}, blocked_count=0, overdue_count=0, completed_count=0
        ),
        description="Sub-task statistics"
    )

    # Metadata for client
    fetched_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Server timestamp when data was fetched"
    )
