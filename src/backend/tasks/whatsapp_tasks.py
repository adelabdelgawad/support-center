"""
WhatsApp out-of-shift escalation tasks.

Queue: default celery queue
Purpose: Event-driven debounced WhatsApp batch sends
"""
import logging
import asyncio
from datetime import datetime
from uuid import UUID

from celery import Task

from celery_app import celery_app
from tasks.base import BaseTask
from tasks.database import get_celery_session
from services.whatsapp_sender import WhatsAppSender

logger = logging.getLogger(__name__)


def run_async(coro):
    """
    Run an async coroutine in a sync context (Celery worker).

    Uses a persistent event loop per worker process instead of asyncio.run()
    which creates/closes a new loop each time (causing "Event loop is closed" errors).
    """
    try:
        # Try to get the existing event loop
        loop = asyncio.get_event_loop()
    except RuntimeError:
        # No event loop in current thread, create one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # If loop is closed, create a new one
    if loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Run the coroutine and return the result
    return loop.run_until_complete(coro)


@celery_app.task(
    base=BaseTask,
    name="tasks.whatsapp_tasks.send_debounced_whatsapp_batch",
    queue="celery",
    priority=5,
    bind=True,
)
def send_debounced_whatsapp_batch(self: Task, request_id: str, batch_type: str = "first_debounced") -> dict:
    """
    Send WhatsApp batch for a request (event-driven).

    This task is scheduled by:
    - ChatService when first requester message arrives (batch_type="first_debounced", 30s delay)
    - ChatService when subsequent requester messages arrive (batch_type="subsequent_debounced", BU interval)
    - RequestService when out-of-shift request is created (batch_type="request_created", 5s delay)

    Args:
        request_id: Service request UUID (as string)
        batch_type: Type of batch ("first_debounced", "subsequent_debounced", or "request_created")

    Returns:
        Dict with status and details
    """

    async def _send_batch():
        async with get_celery_session() as session:
            request_uuid = UUID(request_id)

            if batch_type == "request_created":
                logger.info(
                    f"📢 Sending WhatsApp notification for out-of-shift request {request_id} "
                    f"(immediately after creation)"
                )
            else:
                logger.info(
                    f"⏰ Debounce timer expired for request {request_id}, "
                    f"sending WhatsApp batch (30s after first message)"
                )

            success = await WhatsAppSender.send_batch_for_request(
                db=session,
                request_id=request_uuid,
                batch_type=batch_type,
            )

            return {
                "request_id": request_id,
                "batch_type": batch_type,
                "success": success,
                "sent_at": datetime.now().isoformat(),
            }

    # Run async code using persistent event loop
    return run_async(_send_batch())
