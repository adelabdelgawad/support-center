"""
Event data models for Redis Streams event transport.

Defines the StreamEvent dataclass and related models for
publishing events to Redis Streams.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class EventMetadata:
    """Optional metadata for event tracing and debugging.

    Attributes:
        trace_id: Distributed tracing ID for request correlation
        source_instance: FastAPI instance identifier
        coalesced_count: Number of events merged (for coalesced events)
    """

    trace_id: Optional[str] = None
    source_instance: Optional[str] = None
    coalesced_count: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            k: v for k, v in {
                "trace_id": self.trace_id,
                "source_instance": self.source_instance,
                "coalesced_count": self.coalesced_count,
            }.items() if v is not None
        }


@dataclass
class StreamEvent:
    """Base event structure for all real-time events published to Redis Streams.

    This is the canonical event format that gets serialized to JSON
    and published via XADD to Redis Streams.

    Attributes:
        event_id: Unique identifier (UUID v4) for idempotency
        event_type: Type discriminator for event handling (see EventType enum)
        timestamp: Event creation time (ISO8601 format)
        room_id: Target room/group for broadcast (typically request UUID)
        payload: Event-specific data (structure depends on event_type)
        metadata: Optional tracing/debugging info
    """

    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    room_id: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    metadata: Optional[EventMetadata] = None

    def to_stream_dict(self) -> Dict[str, str]:
        """Convert to Redis Streams XADD format.

        Redis Streams requires all field values to be strings.
        The payload is serialized as JSON string.

        Returns:
            Dictionary with string values for XADD
        """
        import json

        result = {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "room_id": self.room_id,
            "payload": json.dumps(self.payload),
        }

        if self.metadata:
            metadata_dict = self.metadata.to_dict()
            if metadata_dict:
                result["metadata"] = json.dumps(metadata_dict)

        return result

    @classmethod
    def from_stream_dict(cls, data: Dict[str, bytes]) -> "StreamEvent":
        """Create StreamEvent from Redis Streams XREAD result.

        Args:
            data: Dictionary from XREAD with bytes values

        Returns:
            StreamEvent instance
        """
        import json

        payload_str = data.get(b"payload", b"{}")
        if isinstance(payload_str, bytes):
            payload_str = payload_str.decode("utf-8")

        payload = json.loads(payload_str) if payload_str else {}

        metadata = None
        metadata_str = data.get(b"metadata")
        if metadata_str:
            if isinstance(metadata_str, bytes):
                metadata_str = metadata_str.decode("utf-8")
            if metadata_str:
                metadata_dict = json.loads(metadata_str)
                metadata = EventMetadata(
                    trace_id=metadata_dict.get("trace_id"),
                    source_instance=metadata_dict.get("source_instance"),
                    coalesced_count=metadata_dict.get("coalesced_count"),
                )

        return cls(
            event_id=data.get(b"event_id", b"").decode("utf-8"),
            event_type=data.get(b"event_type", b"").decode("utf-8"),
            timestamp=data.get(b"timestamp", b"").decode("utf-8"),
            room_id=data.get(b"room_id", b"").decode("utf-8"),
            payload=payload,
            metadata=metadata,
        )

    def with_coalesced_count(self, count: int) -> "StreamEvent":
        """Return a new event with coalesced count set.

        Args:
            count: Number of events that were merged

        Returns:
            New StreamEvent with updated metadata
        """
        metadata = EventMetadata(
            trace_id=self.metadata.trace_id if self.metadata else None,
            source_instance=self.metadata.source_instance if self.metadata else None,
            coalesced_count=count,
        )
        return StreamEvent(
            event_id=self.event_id,
            event_type=self.event_type,
            timestamp=self.timestamp,
            room_id=self.room_id,
            payload=self.payload,
            metadata=metadata,
        )
