"""User custom view schema definitions - ONE view per user controlling visible tabs."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from core.schema_base import HTTPSchemaModel


# Available tab IDs (predefined views)
AVAILABLE_TABS = [
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


class UserCustomViewBase(HTTPSchemaModel):
    """Base custom view schema - controls which tabs are visible."""

    visible_tabs: list[str] = Field(
        default=[
            "unassigned",
            "all_unsolved",
            "my_unsolved",
            "recently_updated",
            "recently_solved",
        ],
        description="List of visible tab IDs",
    )
    default_tab: str = Field(
        default="unassigned",
        max_length=50,
        description="Default tab to display when user opens tickets page",
    )


class UserCustomViewCreate(UserCustomViewBase):
    """Schema for creating/updating the user's custom view."""

    pass


class UserCustomViewUpdate(HTTPSchemaModel):
    """Schema for updating the user's custom view."""

    visible_tabs: Optional[list[str]] = Field(None, description="List of visible tab IDs")
    default_tab: Optional[str] = Field(None, max_length=50, description="Default tab")
    is_active: Optional[bool] = None


class UserCustomViewRead(UserCustomViewBase):
    """Schema for reading custom view data."""

    id: int
    user_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AvailableTabsResponse(HTTPSchemaModel):
    """Response with available tab IDs."""

    available_tabs: list[str] = Field(
        default=AVAILABLE_TABS,
        description="List of all available tab IDs that can be shown/hidden",
    )
