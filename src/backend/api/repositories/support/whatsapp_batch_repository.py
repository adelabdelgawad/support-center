from datetime import datetime
from typing import List, Optional
from uuid import UUID
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from db import ChatMessage, ServiceRequest, WhatsAppBatch
from api.repositories.base_repository import BaseRepository


class WhatsAppBatchRepository(BaseRepository[WhatsAppBatch]):
    model = WhatsAppBatch

    @classmethod
    async def check_batch_exists(
        cls,
        db: AsyncSession,
        request_id: int,
        first_message_id: Optional[UUID],
        last_message_id: Optional[UUID],
    ) -> Optional[WhatsAppBatch]:
        """
        Check if batch already sent for this message range.

        Args:
            db: Database session
            request_id: Request UUID
            first_message_id: First message ID in batch
            last_message_id: Last message ID in batch

        Returns:
            WhatsAppBatch if exists, None otherwise
        """
        stmt = select(WhatsAppBatch).where(
            WhatsAppBatch.request_id == request_id,
            WhatsAppBatch.first_message_id == first_message_id,
            WhatsAppBatch.last_message_id == last_message_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_unsent_requester_messages(
        cls,
        db: AsyncSession,
        request_id: int,
        request: ServiceRequest,
    ) -> List[ChatMessage]:
        """
        Get all unsent requester messages for a request.

        Unsent = created after last WhatsApp send (or all if never sent).
        Filters to requester messages only (excludes system messages and technician messages).

        Returns messages sorted by created_at ASC.

        Args:
            db: Database session
            request_id: Service request UUID
            request: Service request object with whatsapp_last_sent_at

        Returns:
            List of unsent requester ChatMessage records
        """
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.request_id == request_id)
            .where(ChatMessage.sender_id is not None)
            .order_by(ChatMessage.created_at.asc())
        )

        if request.whatsapp_last_sent_at:
            last_sent = request.whatsapp_last_sent_at
            if last_sent.tzinfo is not None:
                last_sent = last_sent.replace(tzinfo=None)
            stmt = stmt.where(ChatMessage.created_at > last_sent)

        result = await db.execute(stmt)
        messages = result.scalars().all()

        requester_messages = []
        for msg in messages:
            if msg.sender and not msg.sender.is_technician:
                requester_messages.append(msg)

        return requester_messages

    @classmethod
    async def create_batch(
        cls,
        db: AsyncSession,
        request_id: int,
        business_unit_id: int,
        first_message_id: Optional[UUID],
        last_message_id: Optional[UUID],
        message_count: int,
        batch_type: str,
        payload_snapshot: dict,
    ) -> WhatsAppBatch:
        """
        Create a new WhatsApp batch record.

        Args:
            db: Database session
            request_id: Service request UUID
            business_unit_id: Business unit ID
            first_message_id: First message UUID (nullable)
            last_message_id: Last message UUID (nullable)
            message_count: Number of messages in batch
            batch_type: Type of batch (e.g., "first_debounced", "periodic")
            payload_snapshot: Payload data snapshot

        Returns:
            Created WhatsAppBatch
        """
        batch = WhatsAppBatch(
            request_id=request_id,
            business_unit_id=business_unit_id,
            first_message_id=first_message_id,
            last_message_id=last_message_id,
            message_count=message_count,
            batch_type=batch_type,
            sent_at=datetime.utcnow(),
            delivery_status="sent",
            payload_snapshot=payload_snapshot,
            error_message=None,
        )

        db.add(batch)
        await db.flush()

        return batch
