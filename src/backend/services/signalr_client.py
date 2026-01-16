"""
SignalR Client Service - Event broadcasting to SignalR microservice via Redis Streams.

This service sends events to SignalR via Redis Streams for low-latency delivery.

Key principles:
- Non-blocking: Never fails the main operation if broadcast fails
- Idempotent: Uses event IDs for duplicate detection
- Fire-and-forget: Logs errors but doesn't propagate them

============================================================================
SECURITY NOTICE (Finding #19 - Remote Input Session Binding)
============================================================================

FUTURE WORK: Reconnect Handling for Remote Input Sessions

When a SignalR connection is re-established (e.g., network interruption),
the client automatically reconnects. However, the remote access session
state may have changed:

RECONNECT SCENARIOS TO HANDLE:
1. **Desktop Session Changed**: User logged out and back in during
   disconnect - new DesktopSession ID. Remote input commands should
   NOT automatically resume to the new session.

2. **Remote Session Expired**: The RemoteAccessSession may have been
   ended by timeout or the other party during the disconnect.

3. **Control State Changed**: Agent may have toggled control mode
   while the requester was disconnected.

CURRENT BEHAVIOR:
- notify_remote_session_reconnect() sends reconnect notification
- Client receives this and can call GET /remote-access/{id}/state
- Client must manually verify session is still valid

TODO FOR FUTURE:
- Add desktop_session_id to reconnect payload
- SignalR service should verify desktop session is still active
- Reject reconnect if desktop session has changed
- Add explicit "session binding verification" step before resuming input
============================================================================
"""

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings
from core.metrics import track_event_publish
from services.event_coalescer import typing_coalescer
from services.event_models import StreamEvent
from services.event_publisher import publish_event, _get_stream_name
from services.event_types import EventType

logger = logging.getLogger(__name__)


class SignalRClient:
    """Redis Streams client for SignalR event broadcasting."""

    _client: Optional[httpx.AsyncClient] = None

    @classmethod
    async def get_client(cls) -> httpx.AsyncClient:
        """
        Get or create the async HTTP client.

        Uses connection pooling for efficiency.
        """
        if cls._client is None or cls._client.is_closed:
            cls._client = httpx.AsyncClient(
                base_url=settings.signalr.internal_url,
                timeout=httpx.Timeout(settings.signalr.timeout_seconds),
                headers={
                    "X-Internal-Api-Key": settings.signalr.internal_api_key,
                    "Content-Type": "application/json",
                },
                # Connection pooling
                limits=httpx.Limits(
                    max_connections=100,
                    max_keepalive_connections=20,
                ),
            )
        return cls._client

    @classmethod
    async def close(cls):
        """Close all connections (call during shutdown)."""
        if cls._client is not None and not cls._client.is_closed:
            await cls._client.aclose()
            cls._client = None
        # Also close publisher connections
        from services.event_publisher import redis_streams_publisher
        await redis_streams_publisher.close()

    @classmethod
    def _generate_event_id(cls) -> str:
        """Generate unique event ID for idempotency."""
        return str(uuid.uuid4())

    # ==================== Event Transport ====================

    @classmethod
    async def _publish_event(
        cls,
        event_type: str,
        room_id: str,
        payload: Dict[str, Any],
    ) -> bool:
        """
        Publish event via Redis Streams transport.

        Args:
            event_type: Event type from EventType enum
            room_id: Target room ID (typically request UUID)
            payload: Event payload

        Returns:
            True if successful, False otherwise
        """
        if not settings.signalr.enabled:
            logger.debug("SignalR broadcasting is disabled, skipping event publish")
            return False

        # Create StreamEvent
        event = StreamEvent(
            event_type=event_type,
            room_id=room_id,
            payload=payload,
        )

        # Get stream name for this event type
        stream = _get_stream_name(event_type)

        # Publish via Redis Streams
        start_time = time.time()
        success = await publish_event(event_type, room_id, payload)
        duration = time.time() - start_time

        # Track metrics
        track_event_publish(
            transport="redis_streams",
            event_type=event_type,
            duration_seconds=duration,
            success=success
        )

        return success

    # ==================== Chat Events ====================

    @classmethod
    async def broadcast_chat_message(
        cls,
        request_id: str,
        message: Dict[str, Any],
    ):
        """
        Broadcast a chat message to request room.

        Args:
            request_id: Service request UUID
            message: Message data dict (camelCase)
        """
        await cls._publish_event(
            EventType.CHAT_MESSAGE,
            request_id,
            message,
        )

    @classmethod
    async def broadcast_typing_indicator(
        cls,
        request_id: str,
        user_id: str,
        is_typing: bool,
    ):
        """Broadcast typing indicator to request room.

        Uses 100ms coalescing to reduce traffic - only latest state is sent.
        """
        # Determine event type based on typing state
        event_type = EventType.TYPING_START if is_typing else EventType.TYPING_STOP

        payload = {
            "user_id": user_id,
            "username": "",  # Will be filled by consumer if needed
            "is_typing": is_typing,
        }

        # Use coalescer for typing events (enabled by default)
        # Coalescer automatically publishes via event transport
        await typing_coalescer.submit(request_id, event_type, payload)

    @classmethod
    async def broadcast_read_status(
        cls,
        request_id: str,
        user_id: str,
        message_ids: List[str],
    ):
        """Broadcast read status update to request room."""
        await cls._publish_event(
            EventType.READ_RECEIPT,
            request_id,
            {
                "user_id": user_id,
                "message_ids": message_ids,
            },
        )

    # ==================== Ticket Events ====================

    @classmethod
    async def broadcast_ticket_update(
        cls,
        request_id: str,
        update_type: str,
        update_data: Dict[str, Any],
    ):
        """
        Broadcast ticket update (status change, assignment, etc.).

        Args:
            request_id: Service request UUID
            update_type: Type of update (e.g., "status_changed", "assigned")
            update_data: Update data dict
        """
        # Map update_type to EventType
        event_type_map = {
            "status_changed": EventType.STATUS_CHANGE,
            "assigned": EventType.ASSIGNMENT_CHANGE,
        }
        event_type = event_type_map.get(update_type, EventType.STATUS_CHANGE)

        # Build payload
        payload = {
            "request_id": request_id,
            **update_data,
        }

        await cls._publish_event(event_type, request_id, payload)

    @classmethod
    async def broadcast_task_status_changed(
        cls,
        request_id: str,
        status: str,
        changed_by: str,
    ):
        """Broadcast task status change."""
        await cls._publish_event(
            EventType.STATUS_CHANGE,
            request_id,
            {
                "request_id": request_id,
                "old_status": "",
                "new_status": status,
                "changed_by": changed_by,
            },
        )

    @classmethod
    async def broadcast_new_ticket(
        cls,
        requester_id: str,
        assigned_to_id: Optional[str],
        ticket: Dict[str, Any],
    ):
        """Broadcast new ticket notification."""
        await cls._publish_event(
            EventType.NOTIFICATION,
            requester_id,  # Room ID = requester_id for user notifications
            {
                "requester_id": requester_id,
                "assigned_to_id": assigned_to_id,
                "ticket": ticket,
            },
        )

    @classmethod
    async def broadcast_system_message(
        cls,
        request_id: str,
        message_type: str,
        message: Dict[str, Any],
    ):
        """
        Broadcast system message (status change, assignment, etc.).

        Args:
            request_id: Service request UUID
            message_type: Type of system message
            message: Message data dict (camelCase)
        """
        await cls._publish_event(
            EventType.NOTIFICATION,
            request_id,
            {
                "type": message_type,
                "title": "",  # Will be populated from message
                "body": "",  # Will be populated from message
                "action_url": "",  # Will be populated from message
                **message,
            },
        )

    # ==================== Notification Events ====================

    @classmethod
    async def broadcast_new_message_notification(
        cls,
        request_id: str,
        message: Dict[str, Any],
    ):
        """
        Broadcast new message notification to all subscribers.

        This is for desktop notifications (Tauri app).
        """
        await cls._publish_event(
            EventType.NOTIFICATION,
            request_id,  # Room ID = request_id for message notifications
            {
                "type": "new_message_notification",  # CRITICAL: type field required by clients
                "requestId": request_id,  # camelCase for client compatibility
                "request_id": request_id,  # snake_case for backwards compatibility
                "message": message,
            },
        )

    @classmethod
    async def send_user_notification(
        cls,
        user_id: str,
        notification: Dict[str, Any],
    ):
        """Send notification to specific user."""
        await cls._publish_event(
            EventType.NOTIFICATION,
            user_id,  # Room ID = user_id for user notifications
            notification,
        )

    @classmethod
    async def notify_subscription_added(
        cls,
        user_id: str,
        request_id: str,
    ):
        """Notify user that they were subscribed to a request."""
        await cls._publish_event(
            EventType.NOTIFICATION,
            user_id,  # Room ID = user_id for subscription notifications
            {
                "type": "subscription_added",
                "user_id": user_id,
                "request_id": request_id,
            },
        )

    @classmethod
    async def notify_subscription_removed(
        cls,
        user_id: str,
        request_id: str,
    ):
        """Notify user that they were unsubscribed from a request."""
        await cls._publish_event(
            EventType.NOTIFICATION,
            user_id,  # Room ID = user_id for subscription notifications
            {
                "type": "subscription_removed",
                "user_id": user_id,
                "request_id": request_id,
            },
        )

    # ==================== Remote Access Events ====================

    @classmethod
    async def notify_remote_session_auto_start(
        cls,
        requester_id: str,
        session: Dict[str, Any],
    ):
        """
        Notify requester to auto-start remote access session.

        Args:
            requester_id: Requester user ID
            session: Session data dict with sessionId, agentId, etc.
        """
        payload = {
            "requester_id": requester_id,
            **session,
        }

        await cls._publish_event(
            EventType.REMOTE_SESSION_START,
            requester_id,  # Room ID = requester_id for user notifications
            payload,
        )

    @classmethod
    async def notify_remote_session_ended(
        cls,
        session_id: str,
        agent_id: str,
        requester_id: str,
        reason: str,
    ):
        """
        Notify both participants that session has ended.

        DURABLE: Called after DB persistence of session end.
        Broadcasts to both agent and requester.
        """
        await cls._publish_event(
            EventType.REMOTE_SESSION_END,
            requester_id,  # Room ID = requester_id for user notifications
            {
                "session_id": session_id,
                "agent_id": agent_id,
                "requester_id": requester_id,
                "reason": reason,
            },
        )

    @classmethod
    async def notify_control_mode_changed(
        cls,
        session_id: str,
        requester_id: str,
        enabled: bool,
    ):
        """
        Notify requester that control mode has changed.

        DURABLE: Called after DB persistence of control toggle.
        """
        await cls._publish_event(
            EventType.REMOTE_SESSION_END,  # Use REMOTE_SESSION_END for all remote events
            requester_id,
            {
                "session_id": session_id,
                "requester_id": requester_id,
                "mode": "control" if enabled else "view",
            },
        )

    @classmethod
    async def notify_remote_session_reconnect(
        cls,
        requester_id: str,
        session: Dict[str, Any],
    ):
        """Notify requester to reconnect to session."""
        await cls._publish_event(
            EventType.REMOTE_SESSION_END,  # Reuse event type for simplicity
            requester_id,
            {
                "session_id": session.get("session_id", ""),
                "requester_id": requester_id,
                "reconnect": True,
            },
        )

    @classmethod
    async def notify_uac_detected(cls, session_id: str, agent_id: str = ""):
        """Notify agent that UAC prompt is active."""
        # UAC notifications don't go through Redis Streams - they're time-sensitive
        # Call SignalR internal API directly (not Redis Streams)
        try:
            client = await cls.get_client()
            response = await client.post(
                "/internal/remote-access/uac-detected",
                json={
                    "event_id": cls._generate_event_id(),
                    "session_id": session_id,
                    "agent_id": agent_id,
                },
            )
            response.raise_for_status()
            logger.info(f"UAC detection notification sent for session {session_id}")
        except Exception as e:
            logger.error(f"Failed to send UAC notification for session {session_id}: {e}")

    @classmethod
    async def notify_uac_dismissed(cls, session_id: str, agent_id: str = ""):
        """Notify agent that UAC prompt was dismissed."""
        # UAC notifications don't go through Redis Streams - they're time-sensitive
        # Call SignalR internal API directly (not Redis Streams)
        try:
            client = await cls.get_client()
            response = await client.post(
                "/internal/remote-access/uac-dismissed",
                json={
                    "event_id": cls._generate_event_id(),
                    "session_id": session_id,
                    "agent_id": agent_id,
                },
            )
            response.raise_for_status()
            logger.info(f"UAC dismissed notification sent for session {session_id}")
        except Exception as e:
            logger.error(f"Failed to send UAC dismissed notification for session {session_id}: {e}")

    # ==================== Stats & Status ====================

    @classmethod
    async def get_stats(cls) -> Optional[Dict[str, Any]]:
        """Get SignalR connection statistics."""
        try:
            client = await cls.get_client()
            response = await client.get("/internal/stats")
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Failed to get SignalR stats: {e}")
            return None

    @classmethod
    async def is_user_online(cls, user_id: str) -> bool:
        """
        Check if a user is currently connected to SignalR.

        Args:
            user_id: User ID to check

        Returns:
            True if user has at least one active connection, False otherwise
        """
        if not settings.signalr.enabled:
            logger.debug("SignalR disabled, returning False for online check")
            return False

        try:
            client = await cls.get_client()
            response = await client.get(f"/internal/users/{user_id}/online")
            if response.status_code == 200:
                result = response.json()
                is_online = result.get("isOnline", False)
                connection_count = result.get("connectionCount", 0)
                logger.debug(
                    f"User {user_id} online check: {is_online} ({connection_count} connections)"
                )
                return is_online
            return False
        except Exception as e:
            logger.error(f"Failed to check user online status: {e}")
            return False


# Convenience instance for imports
signalr_client = SignalRClient
