"""
Event Trigger Service - Centralized orchestrator for event-driven system messages.

This service:
1. Looks up event configuration by event_key
2. Builds placeholder context from request/user data
3. Interpolates bilingual message templates
4. Creates chat message via ChatService
5. Broadcasts via WebSocket (optional)
"""

import logging
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import safe_database_query, log_database_operation
from db import ChatMessage, ServiceRequest, User
from api.services.system_message_service import SystemMessageService

# Import get_event_by_key from the endpoint module (exported for cross-module usage)
# pylint: disable=import-outside-toplevel
def _import_get_event_by_key():
    from api.v1.endpoints.system_events import get_event_by_key
    return get_event_by_key

_get_event_by_key = _import_get_event_by_key()

logger = logging.getLogger(__name__)


class EventTriggerService:
    """Centralized service for triggering event-driven system messages."""

    # Supported event keys (matches seed data)
    EVENT_NEW_REQUEST = "new_request"
    EVENT_TICKET_ASSIGNED = "ticket_assigned"
    EVENT_STATUS_CHANGED = "status_changed"
    EVENT_TECHNICIAN_JOINED = "technician_joined"
    EVENT_TICKET_RESOLVED = "ticket_resolved"
    EVENT_TICKET_CLOSED = "ticket_closed"
    EVENT_TICKET_REOPENED = "ticket_reopened"
    EVENT_ESCALATION = "escalation"
    EVENT_REQUEST_SOLVED = "request_solved"

    # Sub-task event keys
    EVENT_SUBTASK_CREATED = "subtask_created"
    EVENT_SUBTASK_ASSIGNED = "subtask_assigned"
    EVENT_SUBTASK_STATUS_CHANGED = "subtask_status_changed"
    EVENT_SUBTASK_COMPLETED = "subtask_completed"
    EVENT_SUBTASK_COMMENT_ADDED = "subtask_comment_added"

    @staticmethod
    @safe_database_query("trigger_event", default_return=None)
    @log_database_operation("trigger system event", level="info")
    async def trigger_event(
        db: AsyncSession,
        event_key: str,
        request_id: UUID,
        context: Dict[str, str],
        *,
        suppress_websocket: bool = False
    ) -> Optional[ChatMessage]:
        """
        Trigger a system event and create bilingual chat message.

        Args:
            db: Database session
            event_key: Event identifier (e.g., 'status_changed')
            request_id: Service request UUID
            context: Placeholder values for message interpolation
                     Example: {"old_status": "Open", "new_status": "In Progress"}
            suppress_websocket: If True, don't broadcast via WebSocket

        Returns:
            Created ChatMessage or None if event not found/inactive

        Example:
            await EventTriggerService.trigger_event(
                db,
                "status_changed",
                request_id,
                {
                    "old_status": "Open",
                    "new_status": "In Progress",
                    "changed_by": "John Doe"
                }
            )
        """
        try:
            # 1. Lookup event configuration
            event = await _get_event_by_key(db, event_key)

            if not event or not event.is_active:
                logger.debug(f"Event '{event_key}' not found or inactive, skipping")
                return None

            if not event.system_message or not event.system_message.is_active:
                logger.warning(
                    f"Event '{event_key}' has no active system message, skipping"
                )
                return None

            # 2. Get bilingual messages from system message service
            try:
                msg_en, msg_ar = await SystemMessageService.get_bilingual_message(
                    db, event.system_message.message_type, context
                )
            except Exception as e:
                logger.error(
                    f"Failed to format message for event '{event_key}': {e}"
                )
                return None

            # 3. Combine into "EN|AR" format
            bilingual_content = f"{msg_en}|{msg_ar}"

            # 4. Get next sequence number
            max_seq_result = await db.execute(
                select(func.max(ChatMessage.sequence_number)).where(
                    ChatMessage.request_id == request_id
                )
            )
            max_seq = max_seq_result.scalar() or 0
            next_sequence = max_seq + 1

            # 5. Create chat message (system message - no sender_id)
            message = ChatMessage(
                request_id=request_id,
                sender_id=None,  # System message has no sender
                content=bilingual_content,
                is_screenshot=False,
                screenshot_file_name=None,
                sequence_number=next_sequence,
                is_read=False,
            )

            db.add(message)
            await db.commit()
            await db.refresh(message)

            # 6. Broadcast via SignalR (unless suppressed)
            if not suppress_websocket:
                try:
                    from api.services.signalr_client import signalr_client

                    # Format message as dict for broadcast (camelCase)
                    # System messages have sender_id=None, so no sender info
                    message_dict = {
                        "id": str(message.id),
                        "requestId": str(message.request_id),
                        "senderId": None,  # System message has no sender
                        "sender": None,  # System message has no sender info
                        "content": message.content,
                        "sequenceNumber": message.sequence_number,
                        "isScreenshot": False,
                        "screenshotFileName": None,
                        "isRead": message.is_read,
                        "isReadByCurrentUser": False,
                        "createdAt": message.created_at.isoformat() + "Z",
                        "updatedAt": (
                            message.updated_at.isoformat() + "Z" if message.updated_at else None
                        ),
                        "readAt": None,
                        "readReceipt": None,
                    }

                    # Use broadcast_chat_message instead of broadcast_system_message
                    # This ensures Requester App receives system messages via the same
                    # ReceiveMessage handler it uses for regular chat messages
                    await signalr_client.broadcast_chat_message(
                        request_id=str(request_id),
                        message=message_dict,
                    )

                    # Also send notification for desktop alerts in Requester App
                    await signalr_client.broadcast_new_message_notification(
                        request_id=str(request_id),
                        message=message_dict,
                    )
                except Exception as e:
                    logger.warning(
                        f"Failed to broadcast event message via SignalR: {e}"
                    )
                    # Don't fail the event trigger if SignalR fails

            logger.info(
                f"✅ Triggered event '{event_key}' for request {request_id} - Message: {bilingual_content[:50]}..."
            )
            return message

        except Exception as e:
            logger.error(
                f"Failed to trigger event '{event_key}' for request {request_id}: {e}",
                exc_info=True,
            )
            return None

    @staticmethod
    async def trigger_new_request(db: AsyncSession, request: ServiceRequest):
        """Convenience method: Trigger 'new_request' event."""
        try:
            requester_name = "Unknown"
            if request.requester:
                requester_name = (
                    request.requester.full_name or request.requester.username
                )

            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_NEW_REQUEST,
                request.id,
                {
                    "request_title": request.title or "Untitled",
                    "requester_name": requester_name,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger new_request event: {e}")

    @staticmethod
    async def trigger_status_changed(
        db: AsyncSession,
        request_id: UUID,
        old_status_en: str,
        old_status_ar: str,
        new_status_en: str,
        new_status_ar: str,
        changed_by: User,
    ):
        """Convenience method: Trigger 'status_changed' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_STATUS_CHANGED,
                request_id,
                {
                    "old_status": old_status_en,  # Use EN for template
                    "new_status": new_status_en,
                    "changed_by": changed_by.full_name or changed_by.username,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger status_changed event: {e}")

    @staticmethod
    async def trigger_ticket_assigned(
        db: AsyncSession, request_id: UUID, technician: User
    ):
        """Convenience method: Trigger 'ticket_assigned' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_TICKET_ASSIGNED,
                request_id,
                {
                    "technician_name": technician.full_name or technician.username,
                    "technician_title": technician.title or "Technician",
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger ticket_assigned event: {e}")

    @staticmethod
    async def trigger_technician_joined(
        db: AsyncSession, request_id: UUID, technician: User
    ):
        """Convenience method: Trigger 'technician_joined' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_TECHNICIAN_JOINED,
                request_id,
                {"technician_name": technician.full_name or technician.username},
            )
        except Exception as e:
            logger.warning(f"Failed to trigger technician_joined event: {e}")

    @staticmethod
    async def trigger_ticket_resolved(
        db: AsyncSession, request_id: UUID, resolver: User
    ):
        """Convenience method: Trigger 'ticket_resolved' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_TICKET_RESOLVED,
                request_id,
                {"resolver_name": resolver.full_name or resolver.username},
            )
        except Exception as e:
            logger.warning(f"Failed to trigger ticket_resolved event: {e}")

    @staticmethod
    async def trigger_ticket_closed(db: AsyncSession, request_id: UUID, closer: User):
        """Convenience method: Trigger 'ticket_closed' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_TICKET_CLOSED,
                request_id,
                {"closer_name": closer.full_name or closer.username},
            )
        except Exception as e:
            logger.warning(f"Failed to trigger ticket_closed event: {e}")

    @staticmethod
    async def trigger_ticket_reopened(
        db: AsyncSession, request_id: UUID, reopener: User
    ):
        """Convenience method: Trigger 'ticket_reopened' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_TICKET_REOPENED,
                request_id,
                {"reopener_name": reopener.full_name or reopener.username},
            )
        except Exception as e:
            logger.warning(f"Failed to trigger ticket_reopened event: {e}")

    @staticmethod
    async def trigger_escalation(
        db: AsyncSession,
        request_id: UUID,
        escalation_level: str,
        escalator: User,
    ):
        """Convenience method: Trigger 'escalation' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_ESCALATION,
                request_id,
                {
                    "escalation_level": escalation_level,
                    "escalator_name": escalator.full_name or escalator.username,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger escalation event: {e}")

    @staticmethod
    async def trigger_request_solved(
        db: AsyncSession,
        request_id: UUID,
        solver: User
    ):
        """Convenience method: Trigger 'request_solved' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_REQUEST_SOLVED,
                request_id,
                {}  # No placeholders needed for simple message
            )
        except Exception as e:
            logger.warning(f"Failed to trigger request_solved event: {e}")

    # --- Sub-task Events ---

    @staticmethod
    async def trigger_sub_task_created(
        db: AsyncSession,
        request_id: UUID,
        sub_task_title: str,
        created_by: User
    ):
        """Convenience method: Trigger 'subtask_created' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_SUBTASK_CREATED,
                request_id,
                {
                    "subtask_title": sub_task_title,
                    "created_by": created_by.full_name or created_by.username,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger subtask_created event: {e}")

    @staticmethod
    async def trigger_sub_task_assigned(
        db: AsyncSession,
        request_id: UUID,
        sub_task_title: str,
        assignee: Optional[User]
    ):
        """Convenience method: Trigger 'subtask_assigned' event."""
        if not assignee:
            return

        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_SUBTASK_ASSIGNED,
                request_id,
                {
                    "subtask_title": sub_task_title,
                    "assignee_name": assignee.full_name or assignee.username,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger subtask_assigned event: {e}")

    @staticmethod
    async def trigger_sub_task_status_changed(
        db: AsyncSession,
        request_id: UUID,
        sub_task_title: str,
        old_status_en: str,
        old_status_ar: str,
        new_status_en: str,
        new_status_ar: str,
    ):
        """Convenience method: Trigger 'subtask_status_changed' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_SUBTASK_STATUS_CHANGED,
                request_id,
                {
                    "subtask_title": sub_task_title,
                    "old_status": old_status_en,
                    "new_status": new_status_en,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger subtask_status_changed event: {e}")

    @staticmethod
    async def trigger_sub_task_completed(
        db: AsyncSession,
        request_id: UUID,
        sub_task_title: str,
        completed_by: User
    ):
        """Convenience method: Trigger 'subtask_completed' event."""
        try:
            await EventTriggerService.trigger_event(
                db,
                EventTriggerService.EVENT_SUBTASK_COMPLETED,
                request_id,
                {
                    "subtask_title": sub_task_title,
                    "completed_by": completed_by.full_name or completed_by.username,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger subtask_completed event: {e}")
