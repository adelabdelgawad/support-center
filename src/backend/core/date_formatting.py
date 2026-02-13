"""Date formatting utilities for duration calculations."""

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo


def format_requested_duration(
    created_at: datetime, timezone: str = "Africa/Cairo"
) -> str:
    """
    Format requested timestamp as relative duration or full date.
    Returns "Just now", "X minutes ago", "X hours ago", or "Jan 15 11:23 PM".

    Args:
        created_at: The creation timestamp (assumed UTC if no timezone info)
        timezone: Target timezone for formatting (default: Africa/Cairo)

    Returns:
        Formatted duration string
    """
    now = datetime.now(ZoneInfo(timezone))

    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=ZoneInfo("UTC"))

    diff = now - created_at
    diff_seconds = diff.total_seconds()
    diff_minutes = int(diff_seconds / 60)
    diff_hours = int(diff_seconds / 3600)

    if diff_minutes < 1:
        return "Just now"
    elif diff_minutes < 60:
        return f"{diff_minutes} minute{'s' if diff_minutes > 1 else ''} ago"
    elif diff_hours < 24:
        return f"{diff_hours} hour{'s' if diff_hours > 1 else ''} ago"

    return created_at.strftime("%b %d %I:%M %p")


def format_due_date_duration(
    due_date: Optional[datetime], timezone: str = "Africa/Cairo"
) -> tuple[str, bool]:
    """
    Format due date as relative duration with overdue status.
    Returns (text, is_overdue) where text is like "in 5h", "2d 3h", "5h overdue", or "-".

    Args:
        due_date: The due date timestamp (assumed UTC if no timezone info)
        timezone: Target timezone for formatting (default: Africa/Cairo)

    Returns:
        Tuple of (formatted_text, is_overdue)
    """
    if due_date is None:
        return "-", False

    now = datetime.now(ZoneInfo(timezone))

    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=ZoneInfo("UTC"))

    is_overdue = due_date < now
    diff = abs(now - due_date)
    diff_hours = int(diff.total_seconds() / 3600)
    diff_days = diff_hours // 24
    remaining_hours = diff_hours % 24

    if diff_days > 0:
        text = f"{diff_days}d {remaining_hours}h"
    else:
        text = f"{diff_hours}h"

    if is_overdue:
        text = f"{text} overdue"
    else:
        text = f"in {text}"

    return text, is_overdue
