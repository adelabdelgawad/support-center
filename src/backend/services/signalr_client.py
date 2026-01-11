"""
SignalR Client Service - HTTP client for broadcasting events to SignalR microservice.

This service sends events to the SignalR microservice's internal API,
which then broadcasts them to connected clients.

Key principles:
- Non-blocking: Never fails the main operation if SignalR broadcast fails
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
import uuid
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


class SignalRClient:
    """HTTP client for SignalR internal API broadcasts."""

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
        """Close the HTTP client (call during shutdown)."""
        if cls._client is not None and not cls._client.is_closed:
            await cls._client.aclose()
            cls._client = None

    @classmethod
    def _generate_event_id(cls) -> str:
        """Generate unique event ID for idempotency."""
        return str(uuid.uuid4())

    @classmethod
    async def _post(cls, endpoint: str, payload: Dict[str, Any]) -> bool:
        """
        Send POST request to SignalR internal API.

        This is non-fatal - errors are logged but not propagated.

        Args:
            endpoint: API endpoint path (e.g., "/internal/chat/message")
            payload: JSON payload to send

        Returns:
            True if successful, False otherwise
        """
        if not settings.signalr.enabled:
            logger.debug("SignalR broadcasting is disabled, skipping")
            return False

        # SECURITY: Ensure API key is configured before making requests
        if not settings.signalr.internal_api_key:
            logger.error(
                "SECURITY: SignalR is enabled but SIGNALR_INTERNAL_API_KEY is not set. "
                "Refusing to broadcast without authentication."
            )
            return False

        try:
            client = await cls.get_client()
            response = await client.post(endpoint, json=payload)

            if response.status_code == 200:
                result = response.json()
                if result.get("duplicate"):
                    logger.debug(f"SignalR duplicate event: {payload.get('eventId')}")
                else:
                    logger.info(f"SignalR broadcast successful: {endpoint}")
                return True
            else:
                logger.warning(
                    f"SignalR broadcast failed: {endpoint} - "
                    f"Status: {response.status_code}, Body: {response.text[:200]}"
                )
                return False

        except httpx.TimeoutException as e:
            logger.error(f"SignalR timeout: {endpoint} - {e}")
            return False
        except httpx.RequestError as e:
            logger.error(f"SignalR request error: {endpoint} - {e}")
            return False
        except Exception as e:
            logger.error(f"SignalR unexpected error: {endpoint} - {e}", exc_info=True)
            return False

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
        await cls._post(
            "/internal/chat/message",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
                "message": message,
            },
        )

    @classmethod
    async def broadcast_typing_indicator(
        cls,
        request_id: str,
        user_id: str,
        is_typing: bool,
    ):
        """Broadcast typing indicator to request room."""
        await cls._post(
            "/internal/chat/typing",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
                "user_id": user_id,
                "is_typing": is_typing,
            },
        )

    @classmethod
    async def broadcast_read_status(
        cls,
        request_id: str,
        user_id: str,
        message_ids: List[str],
    ):
        """Broadcast read status update to request room."""
        await cls._post(
            "/internal/chat/read-status",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
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
        await cls._post(
            "/internal/ticket/update",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
                "update": {
                    "type": update_type,
                    "data": update_data,
                    "requestId": request_id,
                },
            },
        )

    @classmethod
    async def broadcast_task_status_changed(
        cls,
        request_id: str,
        status: str,
        changed_by: str,
    ):
        """Broadcast task status change."""
        await cls._post(
            "/internal/ticket/task-status",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
                "status": status,
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
        await cls._post(
            "/internal/ticket/new",
            {
                "event_id": cls._generate_event_id(),
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
        await cls._post(
            "/internal/ticket/system-message",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
                "type": message_type,
                "message": message,
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
        await cls._post(
            "/internal/notification/new-message",
            {
                "event_id": cls._generate_event_id(),
                "request_id": request_id,
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
        await cls._post(
            "/internal/notification/send",
            {
                "event_id": cls._generate_event_id(),
                "user_id": user_id,
                "notification": notification,
            },
        )

    @classmethod
    async def notify_subscription_added(
        cls,
        user_id: str,
        request_id: str,
    ):
        """Notify user that they were subscribed to a request."""
        await cls._post(
            "/internal/notification/subscription-added",
            {
                "event_id": cls._generate_event_id(),
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
        await cls._post(
            "/internal/notification/subscription-removed",
            {
                "event_id": cls._generate_event_id(),
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
        await cls._post(
            "/internal/remote-access/auto-start",
            {
                "event_id": cls._generate_event_id(),
                "requester_id": requester_id,
                "session": session,
            },
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
        await cls._post(
            "/internal/remote-access/ended",
            {
                "event_id": cls._generate_event_id(),
                "session_id": session_id,
                "reason": reason,
                "ended_by": agent_id,
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
        await cls._post(
            "/internal/remote-access/control-changed",
            {
                "event_id": cls._generate_event_id(),
                "session_id": session_id,
                "enabled": enabled,
            },
        )

    @classmethod
    async def notify_remote_session_reconnect(
        cls,
        requester_id: str,
        session: Dict[str, Any],
    ):
        """Notify requester to reconnect to session."""
        await cls._post(
            "/internal/remote-access/reconnect",
            {
                "event_id": cls._generate_event_id(),
                "requester_id": requester_id,
                "session": session,
            },
        )

    @classmethod
    async def notify_uac_detected(cls, session_id: str, agent_id: str = ""):
        """Notify agent that UAC prompt is active."""
        await cls._post(
            "/internal/remote-access/uac-detected",
            {
                "event_id": cls._generate_event_id(),
                "session_id": session_id,
                "agent_id": agent_id,
            },
        )

    @classmethod
    async def notify_uac_dismissed(cls, session_id: str, agent_id: str = ""):
        """Notify agent that UAC prompt was dismissed."""
        await cls._post(
            "/internal/remote-access/uac-dismissed",
            {
                "event_id": cls._generate_event_id(),
                "session_id": session_id,
                "agent_id": agent_id,
            },
        )

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
