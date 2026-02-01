"""
Business Unit schemas for API validation and serialization.
"""
from datetime import datetime
from typing import Dict, List, Optional, Any

from pydantic import Field, field_validator

from core.schema_base import HTTPSchemaModel
from uuid import UUID


class BusinessUnitBase(HTTPSchemaModel):
    """Base business unit schema with common fields."""
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    network: Optional[str] = Field(None, max_length=50)
    business_unit_region_id: Optional[int] = None

    # Out-of-shift escalation fields
    working_hours: Optional[Dict[str, Any]] = Field(None, description="Working hours schedule")
    whatsapp_group_name: Optional[str] = Field(None, max_length=255)
    whatsapp_group_id: Optional[str] = Field(None, max_length=500)
    whatsapp_outshift_interval_minutes: int = Field(
        default=30,
        ge=5,
        description="Interval in minutes for periodic WhatsApp sends (minimum 5)",
    )


class BusinessUnitCreate(BusinessUnitBase):
    """Schema for creating a new business unit."""

    @field_validator('working_hours')
    @classmethod
    def validate_working_hours(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Validate working hours format.

        Supports two formats:
        1. Legacy: { monday: { from: "09:00", to: "17:00" }, ... }
        2. New (split shifts): { monday: [{ from: "09:00", to: "17:00" }, { from: "19:00", to: "23:00" }], ... }
        """
        if v is None:
            return None

        valid_days = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

        for day, hours in v.items():
            if day not in valid_days:
                raise ValueError(f"Invalid day: {day}")

            if hours is None or hours == []:
                continue  # Day is off

            # Handle both list (new) and dict (legacy) formats
            ranges_to_validate = []
            if isinstance(hours, list):
                # New format: array of ranges
                ranges_to_validate = hours
            elif isinstance(hours, dict) and "from" in hours and "to" in hours:
                # Legacy format: single dict
                ranges_to_validate = [hours]
            else:
                raise ValueError(f"Hours for {day} must be an array of time ranges or a single time range object")

            # Validate each range
            for i, range_obj in enumerate(ranges_to_validate):
                if not isinstance(range_obj, dict):
                    raise ValueError(f"Range {i+1} for {day} must be a dict with 'from' and 'to'")

                if "from" not in range_obj or "to" not in range_obj:
                    raise ValueError(f"Range {i+1} for {day} must have 'from' and 'to' fields")

                # Validate time format (HH:MM)
                for key in ["from", "to"]:
                    time_str = range_obj[key]
                    try:
                        hour, minute = map(int, time_str.split(":"))
                        if not (0 <= hour <= 23 and 0 <= minute <= 59):
                            raise ValueError
                    except (ValueError, AttributeError):
                        raise ValueError(f"Invalid time format for {day} range {i+1}.{key}: {time_str} (expected HH:MM)")

                # Validate time range logic
                from_parts = list(map(int, range_obj["from"].split(":")))
                to_parts = list(map(int, range_obj["to"].split(":")))
                from_minutes = from_parts[0] * 60 + from_parts[1]
                to_minutes = to_parts[0] * 60 + to_parts[1]

                if from_minutes >= to_minutes:
                    raise ValueError(f"Range {i+1} for {day}: 'to' time must be after 'from' time")

            # Check for overlapping ranges (only for new array format)
            if isinstance(hours, list) and len(ranges_to_validate) > 1:
                # Sort ranges by start time
                sorted_ranges = sorted(ranges_to_validate, key=lambda r: tuple(map(int, r["from"].split(":"))))

                for i in range(len(sorted_ranges) - 1):
                    current_to = list(map(int, sorted_ranges[i]["to"].split(":")))
                    next_from = list(map(int, sorted_ranges[i+1]["from"].split(":")))

                    current_to_mins = current_to[0] * 60 + current_to[1]
                    next_from_mins = next_from[0] * 60 + next_from[1]

                    if current_to_mins > next_from_mins:
                        raise ValueError(f"Overlapping ranges detected for {day}")

        return v


class BusinessUnitUpdate(HTTPSchemaModel):
    """Schema for updating a business unit."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    network: Optional[str] = Field(None, max_length=50)
    business_unit_region_id: Optional[int] = None

    # Out-of-shift escalation fields
    working_hours: Optional[Dict[str, Any]] = None
    whatsapp_group_name: Optional[str] = Field(None, max_length=255)
    whatsapp_group_id: Optional[str] = Field(None, max_length=500)
    whatsapp_outshift_interval_minutes: Optional[int] = Field(None, ge=5)

    @field_validator('working_hours')
    @classmethod
    def validate_working_hours(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Validate working hours format.

        Supports two formats:
        1. Legacy: { monday: { from: "09:00", to: "17:00" }, ... }
        2. New (split shifts): { monday: [{ from: "09:00", to: "17:00" }, { from: "19:00", to: "23:00" }], ... }
        """
        if v is None:
            return None

        valid_days = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

        for day, hours in v.items():
            if day not in valid_days:
                raise ValueError(f"Invalid day: {day}")

            if hours is None or hours == []:
                continue  # Day is off

            # Handle both list (new) and dict (legacy) formats
            ranges_to_validate = []
            if isinstance(hours, list):
                # New format: array of ranges
                ranges_to_validate = hours
            elif isinstance(hours, dict) and "from" in hours and "to" in hours:
                # Legacy format: single dict
                ranges_to_validate = [hours]
            else:
                raise ValueError(f"Hours for {day} must be an array of time ranges or a single time range object")

            # Validate each range
            for i, range_obj in enumerate(ranges_to_validate):
                if not isinstance(range_obj, dict):
                    raise ValueError(f"Range {i+1} for {day} must be a dict with 'from' and 'to'")

                if "from" not in range_obj or "to" not in range_obj:
                    raise ValueError(f"Range {i+1} for {day} must have 'from' and 'to' fields")

                # Validate time format (HH:MM)
                for key in ["from", "to"]:
                    time_str = range_obj[key]
                    try:
                        hour, minute = map(int, time_str.split(":"))
                        if not (0 <= hour <= 23 and 0 <= minute <= 59):
                            raise ValueError
                    except (ValueError, AttributeError):
                        raise ValueError(f"Invalid time format for {day} range {i+1}.{key}: {time_str} (expected HH:MM)")

                # Validate time range logic
                from_parts = list(map(int, range_obj["from"].split(":")))
                to_parts = list(map(int, range_obj["to"].split(":")))
                from_minutes = from_parts[0] * 60 + from_parts[1]
                to_minutes = to_parts[0] * 60 + to_parts[1]

                if from_minutes >= to_minutes:
                    raise ValueError(f"Range {i+1} for {day}: 'to' time must be after 'from' time")

            # Check for overlapping ranges (only for new array format)
            if isinstance(hours, list) and len(ranges_to_validate) > 1:
                # Sort ranges by start time
                sorted_ranges = sorted(ranges_to_validate, key=lambda r: tuple(map(int, r["from"].split(":"))))

                for i in range(len(sorted_ranges) - 1):
                    current_to = list(map(int, sorted_ranges[i]["to"].split(":")))
                    next_from = list(map(int, sorted_ranges[i+1]["from"].split(":")))

                    current_to_mins = current_to[0] * 60 + current_to[1]
                    next_from_mins = next_from[0] * 60 + next_from[1]

                    if current_to_mins > next_from_mins:
                        raise ValueError(f"Overlapping ranges detected for {day}")

        return v


class BusinessUnitRead(BusinessUnitBase):
    """Schema for reading business unit data."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class BusinessUnitListResponse(HTTPSchemaModel):
    """Paginated list response with statistics."""
    business_units: List[BusinessUnitRead]
    total: int
    active_count: int
    inactive_count: int


class BusinessUnitCountsResponse(HTTPSchemaModel):
    """Business unit count statistics."""
    total: int
    active_count: int
    inactive_count: int


class BulkBusinessUnitStatusUpdate(HTTPSchemaModel):
    """Bulk status update request."""
    business_unit_ids: List[int]
    is_active: bool
