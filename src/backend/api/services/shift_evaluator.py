"""
Shift Evaluator - Pure function for out-of-shift detection.

This module provides timezone-aware working hours evaluation for business units.
"""
from datetime import datetime, time
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class ShiftEvaluator:
    """Pure functions for shift evaluation (no database access)."""

    @staticmethod
    def is_out_of_shift(
        working_hours: Optional[Dict[str, Any]],
        check_time: datetime,
    ) -> bool:
        """
        Determine if a given time is outside working hours.

        Args:
            working_hours: Working hours dict (can be None)
                Supported formats:
                1. Legacy: {"monday": {"from": "09:00", "to": "17:00"}, ...}
                2. New (split shifts): {"monday": [{"from": "09:00", "to": "13:00"}, {"from": "17:00", "to": "21:00"}], ...}
            check_time: Timezone-aware datetime to check

        Returns:
            True if out-of-shift, False if in-shift

        Edge Cases:
            - No working_hours defined → Always in-shift (False)
            - Day missing from working_hours → Out-of-shift (True)
            - Day is null/empty array → Out-of-shift (True)
            - Multiple shift ranges → In-shift if in ANY range
            - Invalid time format → Log error, assume in-shift (False)
        """
        # Safety: No working hours defined = always in-shift
        if not working_hours:
            logger.debug("No working hours defined, assuming in-shift")
            return False

        # Get day of week (lowercase)
        day_name = check_time.strftime("%A").lower()  # "monday", "tuesday", ...

        # Check if day exists in working hours
        if day_name not in working_hours:
            logger.debug(f"Day {day_name} not in working hours, out-of-shift")
            return True

        day_hours = working_hours[day_name]

        # Day is explicitly null or empty array = day off
        if day_hours is None or day_hours == [] or day_hours == {}:
            logger.debug(f"Day {day_name} is null/empty (day off), out-of-shift")
            return True

        # Handle both legacy dict format and new list format
        shift_ranges = []
        if isinstance(day_hours, dict) and "from" in day_hours and "to" in day_hours:
            # Legacy format: single shift range as dict
            shift_ranges = [day_hours]
        elif isinstance(day_hours, list):
            # New format: array of shift ranges (supports split shifts)
            shift_ranges = day_hours
        else:
            logger.error(f"Invalid working hours format for {day_name}: {day_hours}")
            # Treat invalid format as day off (out-of-shift) for safety
            return True

        # If no valid ranges, it's a day off
        if not shift_ranges:
            logger.debug(f"Day {day_name} has no shift ranges (day off), out-of-shift")
            return True

        try:
            # Get current time (time component only)
            current_time = check_time.time()

            # Check if current time falls within ANY of the shift ranges
            # (person is in-shift if they're in any range)
            for i, shift_range in enumerate(shift_ranges):
                if not isinstance(shift_range, dict):
                    logger.warning(f"Shift range {i} for {day_name} is not a dict, skipping")
                    continue

                if "from" not in shift_range or "to" not in shift_range:
                    logger.warning(f"Shift range {i} for {day_name} missing 'from' or 'to', skipping")
                    continue

                # Parse time strings
                from_str = shift_range["from"]
                to_str = shift_range["to"]

                from_hour, from_min = map(int, from_str.split(":"))
                to_hour, to_min = map(int, to_str.split(":"))

                # Create time objects for comparison
                shift_start = time(from_hour, from_min)
                shift_end = time(to_hour, to_min)

                # Simple case: shift doesn't cross midnight
                if shift_start <= shift_end:
                    in_this_shift = shift_start <= current_time <= shift_end
                else:
                    # Shift crosses midnight (e.g., 20:00 to 02:00)
                    in_this_shift = current_time >= shift_start or current_time <= shift_end

                if in_this_shift:
                    logger.debug(
                        f"Shift check: day={day_name}, time={current_time}, "
                        f"shift={shift_start}-{shift_end} (range {i}), in_shift=True"
                    )
                    return False  # In-shift, so NOT out-of-shift

            # Not in any shift range
            logger.debug(
                f"Shift check: day={day_name}, time={current_time}, "
                f"checked {len(shift_ranges)} ranges, in_shift=False"
            )
            return True  # Out of shift

        except (ValueError, AttributeError, KeyError) as e:
            logger.error(f"Error parsing working hours for {day_name}: {e}")
            return False  # Assume in-shift on error

    @staticmethod
    def get_next_shift_start(
        working_hours: Optional[Dict[str, Any]],
        from_time: datetime,
    ) -> Optional[datetime]:
        """
        Get the next shift start time (useful for user feedback).

        Args:
            working_hours: Working hours dict
            from_time: Starting time to calculate from

        Returns:
            Datetime of next shift start, or None if no shifts defined

        Note: This is a placeholder for future enhancement.
        Implementation can be added when needed for user feedback features.
        """
        # TODO: Implement if needed for user feedback
        # ("Next shift starts at...")
        return None
