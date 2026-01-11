"""
WhatsApp Sender Service - Hardened for production.

Responsibilities:
- Build batch payloads from message ranges
- Send to Zapier webhook for WhatsApp delivery
- Persist WhatsAppBatch records for idempotency
- Enforce stop-on-assignment
- Handle errors gracefully
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from models import ChatMessage, ServiceRequest, BusinessUnit, WhatsAppBatch
from services.shift_evaluator import ShiftEvaluator
from core.config import settings

logger = logging.getLogger(__name__)


class WhatsAppSender:
    """Service for sending WhatsApp notifications via Zapier webhook."""

    @staticmethod
    async def send_batch_for_request(
        db: AsyncSession,
        request_id: UUID,
        batch_type: str,  # "first_debounced" or "periodic"
    ) -> bool:
        """
        Send WhatsApp batch for a request (idempotent).

        This is the MAIN entry point for all WhatsApp sends.

        Responsibilities:
        1. Check if request is out-of-shift
        2. Check if request has assignee (STOP if yes)
        3. Collect unsent requester messages
        4. Check for duplicate batch (idempotency)
        5. Build payload
        6. Send to Zapier webhook
        7. Persist WhatsAppBatch record
        8. Update request.whatsapp_last_sent_at

        Args:
            db: Database session
            request_id: Service request UUID
            batch_type: "first_debounced" or "periodic"

        Returns:
            True if sent, False if skipped or failed
        """
        try:
            # STEP 1: Load request with relationships
            from repositories.service_request_repository import ServiceRequestRepository

            request = await ServiceRequestRepository.find_by_id(db, request_id)

            if not request:
                logger.warning(f"Request {request_id} not found, skipping WhatsApp send")
                return False

            # STEP 2: CHECK ABSOLUTE STOP-ON-ASSIGNMENT
            if request.assigned_to_technician_id is not None:
                logger.info(
                    f"Request {request_id} has assignee {request.assigned_to_technician_id}, "
                    f"STOPPING WhatsApp send (absolute rule)"
                )
                return False

            # STEP 3: Check if request has business unit
            if not request.business_unit_id:
                logger.debug(f"Request {request_id} has no business unit, skipping")
                return False

            business_unit = request.business_unit  # Eager loaded

            if not business_unit:
                logger.warning(f"Business unit {request.business_unit_id} not found, skipping")
                return False

            # STEP 4: Check if WhatsApp group configured
            if not business_unit.whatsapp_group_name:
                logger.debug(f"Business unit {business_unit.id} has no WhatsApp group, skipping")
                return False

            # STEP 5: Check if out-of-shift
            # Use Cairo time since working hours are defined in local time
            cairo_tz = ZoneInfo("Africa/Cairo")
            cairo_now = datetime.now(cairo_tz)
            is_out_of_shift = ShiftEvaluator.is_out_of_shift(
                working_hours=business_unit.working_hours,
                check_time=cairo_now,
            )

            if not is_out_of_shift:
                logger.debug(f"Request {request_id} is in-shift, skipping WhatsApp send")
                return False

            # STEP 6: Collect unsent requester messages
            messages = await WhatsAppSender._get_unsent_requester_messages(db, request_id, request)

            # Allow empty messages for "request_created" batch type
            if not messages and batch_type != "request_created":
                logger.info(f"No unsent requester messages for request {request_id}, skipping")
                return False

            if messages:
                logger.info(
                    f"Found {len(messages)} unsent requester messages for request {request_id} "
                    f"(batch_type={batch_type})"
                )
            else:
                logger.info(
                    f"No messages for request {request_id}, creating notification for new request "
                    f"(batch_type={batch_type})"
                )

            # STEP 7: Check for duplicate batch (idempotency)
            if messages:
                first_msg_id = messages[0].id
                last_msg_id = messages[-1].id
            else:
                # For request_created batch type with no messages
                # Use None for message IDs (nullable foreign keys)
                first_msg_id = None
                last_msg_id = None

            existing_batch = await WhatsAppSender._check_batch_exists(
                db, request_id, first_msg_id, last_msg_id
            )

            if existing_batch:
                logger.warning(
                    f"Batch already sent for request {request_id}, "
                    f"messages {first_msg_id} to {last_msg_id} (duplicate prevented)"
                )
                return False

            # STEP 8: Build payload
            payload = WhatsAppSender._build_batch_payload(
                messages, request, business_unit, batch_type
            )

            # STEP 9: Send to Zapier webhook
            success = await WhatsAppSender._send_to_zapier(
                payload=payload,
                business_unit=business_unit,
            )

            # Log to console for debugging (after Zapier send)
            WhatsAppSender._log_batch_to_console(payload, batch_type)

            if not success:
                logger.error(f"Failed to send WhatsApp to Zapier for request {request_id}")
                return False

            # STEP 10: Persist WhatsAppBatch record (with unique constraint guard)
            try:
                batch_record = WhatsAppBatch(
                    request_id=request_id,
                    business_unit_id=business_unit.id,
                    first_message_id=first_msg_id,
                    last_message_id=last_msg_id,
                    message_count=len(messages),
                    batch_type=batch_type,
                    sent_at=datetime.utcnow(),
                    delivery_status="sent",
                    payload_snapshot=payload,
                    error_message=None,
                )

                db.add(batch_record)
                await db.commit()

            except IntegrityError as e:
                # Duplicate batch detected by unique constraint
                logger.warning(
                    f"Duplicate batch prevented by DB constraint for request {request_id}: {e}"
                )
                await db.rollback()
                return False

            # STEP 11: Update request.whatsapp_last_sent_at
            request.whatsapp_last_sent_at = datetime.utcnow()
            await db.commit()

            logger.info(
                f"✅ WhatsApp batch sent successfully for request {request_id} "
                f"({len(messages)} messages, batch_type={batch_type})"
            )
            return True

        except Exception as e:
            logger.error(
                f"Failed to send WhatsApp batch for request {request_id}: {e}",
                exc_info=True
            )
            await db.rollback()
            return False

    @staticmethod
    async def _get_unsent_requester_messages(
        db: AsyncSession,
        request_id: UUID,
        request: ServiceRequest,
    ) -> List[ChatMessage]:
        """
        Get all unsent requester messages for a request.

        Unsent = created after last WhatsApp send (or all if never sent).
        Filters to requester messages only (excludes system messages and technician messages).

        Returns messages sorted by created_at ASC.
        """
        # Get messages created after last send (or all if never sent)
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.request_id == request_id)
            .where(ChatMessage.sender_id != None)  # Exclude system messages
            .order_by(ChatMessage.created_at.asc())
        )

        if request.whatsapp_last_sent_at:
            # Handle both timezone-aware and timezone-naive datetimes
            last_sent = request.whatsapp_last_sent_at
            if last_sent.tzinfo is not None:
                # Strip timezone if present (convert to naive UTC)
                last_sent = last_sent.replace(tzinfo=None)
            stmt = stmt.where(ChatMessage.created_at > last_sent)

        result = await db.execute(stmt)
        messages = result.scalars().all()

        # Filter to requester messages only (exclude technicians)
        requester_messages = []
        for msg in messages:
            if msg.sender and not msg.sender.is_technician:
                requester_messages.append(msg)

        return requester_messages

    @staticmethod
    async def _check_batch_exists(
        db: AsyncSession,
        request_id: UUID,
        first_message_id: UUID,
        last_message_id: UUID,
    ) -> Optional[WhatsAppBatch]:
        """Check if batch already sent for this message range."""
        stmt = select(WhatsAppBatch).where(
            WhatsAppBatch.request_id == request_id,
            WhatsAppBatch.first_message_id == first_message_id,
            WhatsAppBatch.last_message_id == last_message_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    def _build_batch_payload(
        messages: List[ChatMessage],
        request: ServiceRequest,
        business_unit: BusinessUnit,
        batch_type: str,
    ) -> Dict[str, Any]:
        """Build WhatsApp batch payload."""
        # Get requester info
        requester = request.requester
        requester_full_name = requester.full_name if requester else "Unknown"
        requester_username = requester.username if requester else "Unknown"

        # Build message list (replace images with [IMAGE])
        formatted_messages = []
        if messages:
            for msg in messages:
                sender_name = "Unknown"
                if msg.sender:
                    sender_name = msg.sender.full_name if msg.sender.full_name else msg.sender.username

                timestamp = msg.created_at.strftime("%Y-%m-%d %H:%M:%S")

                if msg.is_screenshot or msg.screenshot_file_name:
                    content = "[IMAGE]"
                else:
                    content = msg.content

                formatted_messages.append({
                    "timestamp": timestamp,
                    "sender": sender_name,
                    "content": content[:500],  # Limit to 500 chars per message
                })
        else:
            # Empty messages for request_created batch type
            # Build detailed notification for agents to follow up
            notification_lines = [
                f"🆕 New Out-of-Shift Request",
                f"",
                f"👤 Requester: {requester_full_name} ({requester_username})",
                f"📋 Title: {request.title}",
                f"🌐 IP Address: {request.ip_address or 'Unknown'}",
                f"",
                f"🔗 View Details: {settings.zapier.frontend_base_url}/support-center/requests/{request.id}",
            ]
            content = "\n".join(notification_lines)

            formatted_messages.append({
                "timestamp": request.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                "sender": "System",
                "content": content
            })

        # Build IT-App URL
        request_details_url = f"{settings.zapier.frontend_base_url}/support-center/requests/{request.id}"

        payload = {
            "batch_type": batch_type,
            "requester_full_name": requester_full_name,
            "requester_username": requester_username,
            "ticket_id": str(request.id),
            "ticket_title": request.title,
            "message_count": len(messages),
            "messages": formatted_messages,
            "request_details_url": request_details_url,
            "business_unit_name": business_unit.name,
            "whatsapp_group": business_unit.whatsapp_group_name or "N/A",
            "sent_at": datetime.utcnow().isoformat(),
        }

        return payload

    @staticmethod
    def _log_batch_to_console(payload: Dict[str, Any], batch_type: str) -> None:
        """Log WhatsApp batch to console."""
        logger.info("=" * 80)
        logger.info(f"OUT-OF-SHIFT WHATSAPP BATCH ({batch_type.upper()})")
        logger.info("=" * 80)
        logger.info(f"Business Unit: {payload['business_unit_name']}")
        logger.info(f"WhatsApp Group: {payload['whatsapp_group']}")
        logger.info(f"Request ID: {payload['ticket_id']}")
        logger.info(f"Request Title: {payload['ticket_title']}")
        logger.info(f"Requester: {payload['requester_full_name']} ({payload['requester_username']})")
        logger.info(f"Message Count: {payload['message_count']}")
        logger.info("-" * 80)
        for i, msg in enumerate(payload['messages'], 1):
            logger.info(f"  [{i}] {msg['timestamp']} - {msg['sender']}")
            logger.info(f"      {msg['content'][:100]}...")
        logger.info("-" * 80)
        logger.info(f"IT-App URL: {payload['request_details_url']}")
        logger.info("=" * 80)

    @staticmethod
    async def _send_to_zapier(
        payload: Dict[str, Any],
        business_unit: BusinessUnit,
    ) -> bool:
        """Send WhatsApp batch to Zapier webhook."""
        try:
            # Build message body from payload messages
            message_lines = []
            for msg in payload.get("messages", []):
                timestamp = msg.get("timestamp", "")
                sender = msg.get("sender", "Unknown")
                content = msg.get("content", "")
                message_lines.append(f"[{timestamp}] {sender}: {content}")

            message_body = "\n".join(message_lines)

            # Build Zapier webhook payload
            zapier_payload = {
                "Body": message_body,
                "Send_Type": settings.zapier.send_type,
                "Group_Name": business_unit.whatsapp_group_name or "",
                "Group_ID": business_unit.whatsapp_group_id or ""
            }

            # Send POST request to Zapier
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    settings.zapier.base_url,
                    json=zapier_payload
                )
                response.raise_for_status()

            logger.info(
                f"WhatsApp sent to Zapier successfully "
                f"(status={response.status_code}, group={business_unit.whatsapp_group_name})"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to send WhatsApp to Zapier: {e}", exc_info=True)
            return False
