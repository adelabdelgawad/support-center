"""
Base schema model for API responses.

Provides automatic camelCase conversion for Next.js frontend compatibility,
consistent datetime serialization with UTC timezone indicator,
and common configuration for all Pydantic schemas.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_serializer


def to_camel(string: str) -> str:
    """
    Convert snake_case to camelCase.

    Args:
        string: The snake_case string to convert

    Returns:
        The camelCase version of the string

    Example:
        >>> to_camel("user_name")
        'userName'
        >>> to_camel("created_at")
        'createdAt'
    """
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


def serialize_datetime(dt: datetime | None) -> str | None:
    """
    Serialize datetime to ISO 8601 format with UTC timezone indicator.

    All datetimes in the database are stored as UTC. If the datetime object
    has timezone info (timezone-aware), it's converted to UTC and made
    timezone-naive before serialization. This function ensures they are
    serialized with 'Z' suffix to indicate UTC, allowing the frontend to
    correctly convert to user's local timezone.

    Args:
        dt: The datetime to serialize (assumed to be UTC or UTC-aware)

    Returns:
        ISO 8601 string with 'Z' suffix (e.g., "2025-12-18T14:30:00Z")
        or None if input is None
    """
    if dt is None:
        return None

    # If timezone-aware, convert to UTC and make timezone-naive
    if dt.tzinfo is not None:
        from datetime import timezone
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)

    # Add 'Z' to indicate UTC timezone
    # Now isoformat() won't include timezone offset
    return dt.isoformat() + "Z"


class HTTPSchemaModel(BaseModel):
    """
    Base model for all HTTP API schemas.

    Provides:
    - Automatic camelCase conversion for field names (Next.js compatibility)
    - Support for both snake_case and camelCase input
    - Automatic conversion from ORM models (from_attributes=True)
    - Consistent datetime serialization with UTC timezone indicator ('Z' suffix)

    All schema models should inherit from this class instead of BaseModel.

    Datetime fields are serialized to ISO 8601 format with 'Z' suffix:
        "2025-12-18T14:30:00.123456Z"

    This allows the frontend to correctly parse as UTC and convert to
    the user's local timezone for display.
    """

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    @field_serializer("*", mode="wrap")
    @classmethod
    def serialize_any_datetime(cls, value: Any, handler: Any) -> Any:
        """
        Custom serializer that handles datetime fields with UTC indicator.

        This wrap-mode serializer checks if the value is a datetime and
        serializes it with the 'Z' suffix. For non-datetime values, it
        delegates to the default handler.
        """
        if isinstance(value, datetime):
            return serialize_datetime(value)
        return handler(value)
