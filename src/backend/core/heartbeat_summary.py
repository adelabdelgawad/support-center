"""
Periodic heartbeat summary logger.

Aggregates per-heartbeat counts and emits a single INFO log line
every `interval_seconds`, replacing noisy per-event INFO logs with
a compact summary while keeping per-event detail at DEBUG level.
"""

import logging
import time
from collections import defaultdict

logger = logging.getLogger(__name__)


class HeartbeatSummary:
    """Aggregates heartbeat counts and emits periodic INFO summary logs."""

    def __init__(self, interval_seconds: int = 60) -> None:
        self._interval = interval_seconds
        self._counts: dict[str, dict[str, int]] = defaultdict(lambda: {"success": 0, "failure": 0})
        self._last_flush = time.monotonic()

    def record(self, session_type: str, success: bool) -> None:
        key = "success" if success else "failure"
        self._counts[session_type][key] += 1

        now = time.monotonic()
        if now - self._last_flush >= self._interval:
            self._flush()

    def _flush(self) -> None:
        if not any(v["success"] + v["failure"] > 0 for v in self._counts.values()):
            self._last_flush = time.monotonic()
            return

        parts: list[str] = []
        for stype, counts in sorted(self._counts.items()):
            total = counts["success"] + counts["failure"]
            if total > 0:
                parts.append(f"{stype}: {counts['success']} ok / {counts['failure']} failed")

        logger.info(
            "Heartbeat summary (%ds window) | %s",
            self._interval,
            " | ".join(parts),
        )

        self._counts.clear()
        self._last_flush = time.monotonic()


# Global singleton — 60-second summary window
heartbeat_summary = HeartbeatSummary(interval_seconds=60)
