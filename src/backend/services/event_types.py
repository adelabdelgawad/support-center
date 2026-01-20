"""
Event type definitions for Redis Streams event transport.

Defines the EventType enum which classifies all real-time events
that can be published to Redis Streams for SignalR consumption.
"""

from enum import Enum


class EventType(str, Enum):
    """Event type discriminator for Redis Streams events.

    Each event type maps to a specific payload schema and
    determines how the SignalR consumer handles the event.

    Coalesced events are subject to 100ms window coalescing
    to reduce network traffic.
    """

    # Chat events (events:chat stream)
    CHAT_MESSAGE = "chat_message"  # New chat message - NOT coalesced
    TYPING_START = "typing_start"  # User started typing - coalesced
    TYPING_STOP = "typing_stop"  # User stopped typing - coalesced
    READ_RECEIPT = "read_receipt"  # Messages marked as read - coalesced

    # Ticket events (events:ticket stream)
    STATUS_CHANGE = "status_change"  # Ticket status updated - NOT coalesced
    ASSIGNMENT_CHANGE = "assignment_change"  # Ticket assigned/reassigned - NOT coalesced
    NOTIFICATION = "notification"  # Generic notification - NOT coalesced
    TICKET_LIST_UPDATE = "ticket_list_update"  # User ticket list update - NOT coalesced

    # Remote access events (events:remote stream)
    REMOTE_SESSION_START = "remote_session_start"  # Remote access initiated - NOT coalesced
    REMOTE_SESSION_END = "remote_session_end"  # Remote access ended - NOT coalesced

    @classmethod
    def is_coalesced(cls, event_type: str) -> bool:
        """Check if an event type should be coalesced.

        Coalesced events are subject to 100ms window merging
        to reduce high-frequency event traffic.

        Args:
            event_type: Event type string to check

        Returns:
            True if event should be coalesced, False otherwise
        """
        return event_type in (
            cls.TYPING_START,
            cls.TYPING_STOP,
            cls.READ_RECEIPT,
        )

    @classmethod
    def get_stream_name(cls, event_type: str) -> str:
        """Get the Redis Stream name for an event type.

        Args:
            event_type: Event type string

        Returns:
            Redis Stream key (e.g., "events:chat")
        """
        if event_type in (cls.CHAT_MESSAGE, cls.TYPING_START, cls.TYPING_STOP, cls.READ_RECEIPT):
            return "events:chat"
        elif event_type in (cls.STATUS_CHANGE, cls.ASSIGNMENT_CHANGE, cls.NOTIFICATION, cls.TICKET_LIST_UPDATE):
            return "events:ticket"
        elif event_type in (cls.REMOTE_SESSION_START, cls.REMOTE_SESSION_END):
            return "events:remote"
        else:
            # Default to chat stream for unknown types
            return "events:chat"

    @classmethod
    def all_values(cls) -> list[str]:
        """Get all event type values as a list."""
        return [e.value for e in cls]
