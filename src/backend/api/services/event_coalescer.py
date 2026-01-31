"""
Event coalescer for reducing high-frequency event traffic.

Implements trailing-edge throttle with 100ms window for typing indicators
to reduce network traffic while maintaining responsiveness.

Feature 001: Real-Time Messaging Latency Optimization
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from core.metrics import track_event_coalesced
from api.services.event_types import EventType

logger = logging.getLogger(__name__)


@dataclass
class PendingCoalesce:
    """Tracks a pending coalesced event.

    Attributes:
        room_id: Target room for the event
        event_type: Type of event (typing_start, typing_stop, read_receipt)
        latest_payload: Most recent payload (last write wins)
        created_at: When first event was submitted
        task: The flush task
        count: Number of events merged
    """

    room_id: str
    event_type: str
    latest_payload: Dict[str, Any]
    created_at: float
    task: asyncio.Task
    count: int = 1


class TypingCoalescer:
    """Coalesces high-frequency typing events using trailing-edge throttle.

    Strategy:
    - 100ms window for coalescing
    - Latest event wins (overwrites previous)
    - Always emit at window end (trailing edge)
    - Per-room isolation to prevent cross-talk

    Example:
        User types "hello":
        - t=0ms:   typing_start submitted -> start 100ms timer
        - t=20ms:  typing_start submitted -> update payload, restart timer
        - t=60ms:  typing_start submitted -> update payload, restart timer
        - t=160ms: timer fires -> emit typing_start (merged 3 events)

    This reduces 3 network messages to 1, ~67% traffic reduction.
    """

    def __init__(self, window_ms: int = 100):
        """Initialize coalescer.

        Args:
            window_ms: Coalescing window in milliseconds (default: 100ms)
        """
        self.window_ms = window_ms
        self._pending: Dict[str, PendingCoalesce] = {}
        self._lock = asyncio.Lock()
        self._publish_callback: Optional[Callable[[str, str, Dict[str, Any]], Any]] = None

    def set_publish_callback(self, callback: Callable[[str, str, Dict[str, Any]], Any]):
        """Set the callback for publishing coalesced events.

        Args:
            callback: Function(room_id, event_type, payload) -> coroutine
        """
        self._publish_callback = callback

    def is_coalesced_event(self, event_type: str) -> bool:
        """Check if an event type should be coalesced.

        Args:
            event_type: Event type to check

        Returns:
            True if event should be coalesced, False otherwise
        """
        return EventType.is_coalesced(event_type)

    async def submit(self, room_id: str, event_type: str, payload: Dict[str, Any]) -> str:
        """Submit an event for coalescing.

        If this is the first event for this room+type, starts a new window.
        If a window is already active, updates the payload and restarts the timer.

        Args:
            room_id: Target room ID
            event_type: Event type (e.g., typing_start, typing_stop)
            payload: Event payload

        Returns:
            Event ID for the submitted event (or merged event)
        """
        if not self.is_coalesced_event(event_type):
            # Not a coalesced event, publish immediately
            if self._publish_callback:
                await self._publish_callback(room_id, event_type, payload)
            return str(uuid.uuid4())

        # Create unique key for room+event_type
        key = f"{room_id}:{event_type}"

        async with self._lock:
            # Check if there's already a pending coalesce for this key
            if key in self._pending:
                # Update existing pending coalesce
                pending = self._pending[key]
                pending.latest_payload = payload
                pending.count += 1

                # Reset the task (cancel old, create new)
                if not pending.task.done():
                    pending.task.cancel()

                pending.task = asyncio.create_task(
                    self._flush_after_window(key)
                )

                logger.debug(
                    f"Coalescer: Updated pending event for {key} (count: {pending.count})"
                )
            else:
                # Create new pending coalesce
                task = asyncio.create_task(self._flush_after_window(key))

                self._pending[key] = PendingCoalesce(
                    room_id=room_id,
                    event_type=event_type,
                    latest_payload=payload,
                    created_at=time.time(),
                    task=task,
                    count=1,
                )

                logger.debug(f"Coalescer: Started new window for {key}")

        return str(uuid.uuid4())

    async def _flush_after_window(self, key: str):
        """Wait for coalescing window, then emit the event.

        Args:
            key: Room+event_type key
        """
        try:
            # Wait for the coalescing window
            await asyncio.sleep(self.window_ms / 1000)

            async with self._lock:
                # Get and remove pending event
                pending = self._pending.pop(key, None)

                if pending is None:
                    return

                # Track coalescing metrics
                if pending.count > 1:
                    track_event_coalesced(pending.event_type, pending.count)
                    logger.debug(
                        f"Coalescer: Emitted coalesced event for {key} "
                        f"(merged {pending.count} events)"
                    )

                # Publish the coalesced event
                if self._publish_callback:
                    await self._publish_callback(
                        pending.room_id,
                        pending.event_type,
                        pending.latest_payload
                    )

        except asyncio.CancelledError:
            # Task was cancelled (new event submitted), this is expected
            logger.debug(f"Coalescer: Window for {key} was cancelled (new event submitted)")
        except Exception as e:
            logger.error(f"Coalescer: Error flushing event for {key} - {e}", exc_info=True)

    async def flush_all(self):
        """Flush all pending events immediately.

        Useful for graceful shutdown.
        """
        async with self._lock:
            for key, pending in list(self._pending.items()):
                if not pending.task.done():
                    pending.task.cancel()

                # Publish immediately
                if self._publish_callback:
                    await self._publish_callback(
                        pending.room_id,
                        pending.event_type,
                        pending.latest_payload
                    )

                # Track metrics
                if pending.count > 1:
                    track_event_coalesced(pending.event_type, pending.count)

            self._pending.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get coalescer statistics.

        Returns:
            Dictionary with stats (pending_count, window_ms)
        """
        return {
            "pending_count": len(self._pending),
            "window_ms": self.window_ms,
        }


# Global coalescer instance
typing_coalescer = TypingCoalescer()
