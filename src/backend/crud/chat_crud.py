"""
Chat CRUD for database operations.

Handles all database queries related to chat messages, request statuses, and chat page data.
"""
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import ChatMessage, RequestStatus, ServiceRequest
from crud.base_repository import BaseCRUD


class ChatMessageCRUD(BaseCRUD[ChatMessage]):
    """CRUD for ChatMessage database operations."""

    model = ChatMessage

    @classmethod
    async def find_by_request_id_paginated(
        cls,
        db: AsyncSession,
        request_id: UUID,
        *,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[ChatMessage], int]:
        """
        Get messages for a request with pagination.

        Returns the LATEST messages first (page 1 = most recent messages).
        Messages are returned in chronological order (oldest first) for display.

        Args:
            db: Database session
            request_id: Request ID
            page: Page number (1 = latest messages, 2 = older, etc.)
            per_page: Messages per page

        Returns:
            Tuple of (list of messages in chronological order, total count)
        """
        # Build base query with eager loading of sender
        base_stmt = (
            select(ChatMessage)
            .options(selectinload(ChatMessage.sender))
            .where(ChatMessage.request_id == request_id)
        )

        count_stmt = select(func.count(ChatMessage.id)).where(
            ChatMessage.request_id == request_id
        )

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Apply pagination: Order by DESC to get newest first, then reverse
        # This ensures page 1 returns the LATEST messages
        stmt = (
            base_stmt.order_by(ChatMessage.sequence_number.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        messages = list(result.scalars().all())

        # Reverse to return messages in chronological order (oldest first for display)
        messages.reverse()

        return messages, total

    @classmethod
    async def find_by_request_id_with_relations(
        cls,
        db: AsyncSession,
        request_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[ChatMessage], int]:
        """
        Get messages for a request with FULL eager loading (optimized for N+1 elimination).

        This method uses selectinload() to load all relationships in a minimal number of queries:
        - 1 query for messages
        - 1 query for senders (via selectinload)

        Total: 2 queries instead of 1 + N queries

        Returns the LATEST messages (offset from the end).
        Messages are returned in chronological order (oldest first) for display.

        Args:
            db: Database session
            request_id: Request ID
            limit: Maximum messages to return
            offset: Offset from the latest messages (0 = most recent)

        Returns:
            Tuple of (list of messages with all relations loaded in chronological order, total count)
        """
        # Build query with FULL eager loading
        base_stmt = (
            select(ChatMessage)
            .options(
                selectinload(ChatMessage.sender),
            )
            .where(ChatMessage.request_id == request_id)
        )

        # Get total count
        count_stmt = select(func.count(ChatMessage.id)).where(
            ChatMessage.request_id == request_id
        )
        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Apply ordering and pagination: DESC to get newest first, then reverse
        stmt = (
            base_stmt.order_by(ChatMessage.sequence_number.desc())
            .offset(offset)
            .limit(limit)
        )

        # Execute query
        result = await db.execute(stmt)
        messages = list(result.scalars().all())

        # Reverse to return in chronological order (oldest first for display)
        messages.reverse()

        return messages, total

    @classmethod
    async def find_by_request_id_no_count(
        cls,
        db: AsyncSession,
        request_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0
    ) -> List[ChatMessage]:
        """
        Get messages for a request WITHOUT executing a count query.

        OPTIMIZED VERSION: Use this when you already know the total count
        (e.g., from a previous query or when count is not needed).

        This saves one database query compared to find_by_request_id_with_relations.

        Returns the LATEST messages (offset from the end).
        Messages are returned in chronological order (oldest first) for display.

        Args:
            db: Database session
            request_id: Request ID
            limit: Maximum messages to return
            offset: Offset from the latest messages (0 = most recent)

        Returns:
            List of messages with sender relations loaded in chronological order (no count)
        """
        # Build query with eager loading (no count query)
        # Order DESC to get newest first, then reverse
        stmt = (
            select(ChatMessage)
            .options(selectinload(ChatMessage.sender))
            .where(ChatMessage.request_id == request_id)
            .order_by(ChatMessage.sequence_number.desc())
            .offset(offset)
            .limit(limit)
        )

        # Execute single query
        result = await db.execute(stmt)
        messages = list(result.scalars().all())

        # Reverse to return in chronological order (oldest first for display)
        messages.reverse()

        return messages

    @classmethod
    async def find_by_request_id_cursor_paginated(
        cls,
        db: AsyncSession,
        request_id: UUID,
        *,
        limit: int = 100,
        before_sequence: Optional[int] = None
    ) -> Tuple[List[ChatMessage], int, Optional[int]]:
        """
        Get messages for a request with cursor-based pagination.

        DETERMINISTIC PAGINATION: Uses sequence_number as cursor for stable pagination.
        - Initial load: Returns the last `limit` messages (newest)
        - Load more: Returns `limit` messages older than `before_sequence`

        This approach is optimal for chat interfaces because:
        1. No duplicate/missing messages when new messages arrive
        2. Stable scroll position when loading older messages
        3. Efficient database queries (uses index on sequence_number)

        Args:
            db: Database session
            request_id: Request ID
            limit: Maximum messages to return (default: 100)
            before_sequence: Load messages with sequence_number < this value (cursor)

        Returns:
            Tuple of (list of messages in chronological order, total count, oldest_sequence in result)
        """
        # Get total count
        count_stmt = select(func.count(ChatMessage.id)).where(
            ChatMessage.request_id == request_id
        )
        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Build query with eager loading
        conditions = [ChatMessage.request_id == request_id]

        # Apply cursor filter if provided (load older messages)
        if before_sequence is not None:
            conditions.append(ChatMessage.sequence_number < before_sequence)

        # Order DESC to get newest messages first (within the constraint)
        # Then limit and reverse for chronological display
        stmt = (
            select(ChatMessage)
            .options(selectinload(ChatMessage.sender))
            .where(and_(*conditions))
            .order_by(ChatMessage.sequence_number.desc())
            .limit(limit)
        )

        # Execute query
        result = await db.execute(stmt)
        messages = list(result.scalars().all())

        # Reverse to return in chronological order (oldest first for display)
        messages.reverse()

        # Get oldest sequence number from result (for next cursor)
        oldest_sequence = messages[0].sequence_number if messages else None

        return messages, total, oldest_sequence

    @classmethod
    async def get_message_ids_by_request(
        cls,
        db: AsyncSession,
        request_id: UUID
    ) -> List[int]:
        """
        Get all message IDs for a request.

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            List of message IDs
        """
        stmt = select(ChatMessage.id).where(
            ChatMessage.request_id == request_id
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_request_by_message_id(
        cls,
        db: AsyncSession,
        message_id: int
    ) -> Optional[ServiceRequest]:
        """
        Get service request for a specific message.

        Args:
            db: Database session
            message_id: Message ID

        Returns:
            ServiceRequest or None
        """
        stmt = (
            select(ChatMessage)
            .options(selectinload(ChatMessage.request))
            .where(ChatMessage.id == message_id)
        )
        result = await db.execute(stmt)
        message = result.scalar_one_or_none()

        return message.request if message else None

    @classmethod
    async def get_total_count_by_request(
        cls,
        db: AsyncSession,
        request_id: UUID
    ) -> int:
        """
        Get total message count for a request.

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            Total message count
        """
        stmt = select(func.count(ChatMessage.id)).where(
            ChatMessage.request_id == request_id
        )
        result = await db.execute(stmt)
        return result.scalar_one() or 0

    @classmethod
    async def get_last_message_timestamp(
        cls,
        db: AsyncSession,
        request_id: UUID
    ) -> Optional[datetime]:
        """
        Get timestamp of last message in a request.

        Args:
            db: Database session
            request_id: Request ID

        Returns:
            Last message timestamp or None
        """
        stmt = (
            select(ChatMessage.created_at)
            .where(ChatMessage.request_id == request_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def get_read_unread_counts_for_requester(
        cls,
        db: AsyncSession,
        user_id: int
    ) -> Tuple[int, int]:
        """
        Get read and unread message counts for a requester.

        Args:
            db: Database session
            user_id: Requester user ID

        Returns:
            Tuple of (read_count, unread_count)
        """
        base_conditions = [
            ChatMessage.request_id == ServiceRequest.id,
            ServiceRequest.requester_id == user_id,
        ]

        # Count read messages
        read_count_query = (
            select(func.count(ChatMessage.id))
            .select_from(ChatMessage)
            .join(ServiceRequest, ChatMessage.request_id == ServiceRequest.id)
            .where(and_(ChatMessage.is_read, *base_conditions))
        )
        read_result = await db.execute(read_count_query)
        read_count = read_result.scalar() or 0

        # Count unread messages
        unread_count_query = (
            select(func.count(ChatMessage.id))
            .select_from(ChatMessage)
            .join(ServiceRequest, ChatMessage.request_id == ServiceRequest.id)
            .where(and_(not ChatMessage.is_read, *base_conditions))
        )
        unread_result = await db.execute(unread_count_query)
        unread_count = unread_result.scalar() or 0

        return read_count, unread_count

    @classmethod
    async def check_requester_unread_for_requests(
        cls,
        db: AsyncSession,
        request_ids: List[UUID]
    ) -> dict[UUID, bool]:
        """
        Check if requesters have unread messages (sent by technicians) for multiple requests.

        Args:
            db: Database session
            request_ids: List of request IDs to check

        Returns:
            Dictionary mapping request_id to boolean (True if requester has unread messages)
        """
        if not request_ids:
            return {}

        # Query to find requests where requester has unread messages from technicians
        # A message is for the requester if it was sent by someone other than the requester
        stmt = (
            select(
                ChatMessage.request_id,
                func.count(ChatMessage.id).label("unread_count")
            )
            .join(ServiceRequest, ChatMessage.request_id == ServiceRequest.id)
            .where(
                and_(
                    ChatMessage.request_id.in_(request_ids),
                    not ChatMessage.is_read,
                    ChatMessage.sender_id != ServiceRequest.requester_id  # Message NOT from requester
                )
            )
            .group_by(ChatMessage.request_id)
        )

        result = await db.execute(stmt)
        rows = result.all()

        # Build dictionary: request_id -> has_unread (True if count > 0)
        unread_dict = {row.request_id: row.unread_count > 0 for row in rows}

        # Fill in False for requests not in result (no unread messages)
        return {req_id: unread_dict.get(req_id, False) for req_id in request_ids}

    @classmethod
    async def check_technician_unread_for_requests(
        cls,
        db: AsyncSession,
        request_ids: List[UUID]
    ) -> dict[UUID, bool]:
        """
        Check if technicians have unread messages (sent by requesters) for multiple requests.

        This is used in the technician view to highlight requests where the requester
        has sent messages that the technician hasn't read yet.

        Args:
            db: Database session
            request_ids: List of request IDs to check

        Returns:
            Dictionary mapping request_id to boolean (True if technician has unread messages from requester)
        """
        import logging
        logger = logging.getLogger(__name__)

        logger.debug(f"[READ_RECEIPTS] check_technician_unread_for_requests called with {len(request_ids)} request_ids")

        if not request_ids:
            logger.debug("[READ_RECEIPTS] No request_ids provided, returning empty dict")
            return {}

        # Query to find requests where technician has unread messages from requesters
        # A message is from the requester if sender_id == requester_id
        stmt = (
            select(
                ChatMessage.request_id,
                func.count(ChatMessage.id).label("unread_count")
            )
            .join(ServiceRequest, ChatMessage.request_id == ServiceRequest.id)
            .where(
                and_(
                    ChatMessage.request_id.in_(request_ids),
                    not ChatMessage.is_read,
                    ChatMessage.sender_id == ServiceRequest.requester_id  # Message FROM requester
                )
            )
            .group_by(ChatMessage.request_id)
        )

        result = await db.execute(stmt)
        rows = result.all()

        # Build dictionary: request_id -> has_unread (True if count > 0)
        unread_dict = {row.request_id: row.unread_count > 0 for row in rows}

        # Fill in False for requests not in result (no unread messages)
        final_result = {req_id: unread_dict.get(req_id, False) for req_id in request_ids}

        # Log aggregated summary (DEBUG level for production safety)
        unread_count = sum(1 for v in final_result.values() if v)
        logger.debug(f"[READ_RECEIPTS] {unread_count}/{len(final_result)} requests have unread messages for technician")

        return final_result

    @classmethod
    async def get_requests_with_last_message(
        cls,
        db: AsyncSession,
        user_id: str,
        *,
        status_filter: Optional[int] = None
    ) -> List[ServiceRequest]:
        """
        Get requests for a user with their chat messages eagerly loaded.

        Args:
            db: Database session
            user_id: Requester user ID
            status_filter: Optional status ID to filter requests

        Returns:
            List of ServiceRequests with messages loaded
        """
        # Build subquery for last message per request
        last_message_subquery = (
            select(
                ChatMessage.request_id,
                func.max(ChatMessage.created_at).label("last_created_at"),
            )
            .group_by(ChatMessage.request_id)
            .subquery()
        )

        # Main query for requests with their details
        requests_query = (
            select(ServiceRequest)
            .options(
                selectinload(ServiceRequest.status),
                selectinload(ServiceRequest.chat_messages).selectinload(
                    ChatMessage.sender
                ),
            )
            .outerjoin(
                last_message_subquery,
                ServiceRequest.id == last_message_subquery.c.request_id,
            )
            .where(ServiceRequest.requester_id == user_id)
        )

        # Apply status filter
        if status_filter is not None:
            requests_query = requests_query.where(
                ServiceRequest.status_id == status_filter
            )

        # Order by request creation time (newest first)
        requests_query = requests_query.order_by(
            ServiceRequest.created_at.desc()
        )

        requests_result = await db.execute(requests_query)
        return list(requests_result.scalars().unique().all())


class RequestStatusCRUD(BaseCRUD[RequestStatus]):
    """CRUD for RequestStatus database operations."""

    model = RequestStatus

    @classmethod
    async def get_status_counts_for_requester(
        cls,
        db: AsyncSession,
        user_id: int
    ) -> List[dict]:
        """
        Get request status counts with bilingual names and colors for a requester.

        Only returns statuses where visible_on_requester_page is True.

        Args:
            db: Database session
            user_id: Requester user ID

        Returns:
            List of dicts with id, name, name_en, name_ar, color, and count
            (filtered by visible_on_requester_page = True)
        """
        # Use filter in the JOIN condition to preserve outer join behavior
        join_condition = and_(
            ServiceRequest.status_id == RequestStatus.id,
            ServiceRequest.requester_id == user_id,
        )

        status_query = (
            select(
                RequestStatus.id,
                RequestStatus.name,
                RequestStatus.name_en,
                RequestStatus.name_ar,
                RequestStatus.color,
                func.count(ServiceRequest.id).label("count"),
            )
            .outerjoin(ServiceRequest, join_condition)
            .where(
                RequestStatus.is_active,
                RequestStatus.visible_on_requester_page
            )
            .group_by(
                RequestStatus.id, RequestStatus.name, RequestStatus.name_en,
                RequestStatus.name_ar, RequestStatus.color
            )
            .order_by(RequestStatus.id)
        )

        status_result = await db.execute(status_query)
        status_rows = status_result.all()

        return [
            {
                "id": row.id,
                "name": row.name,
                "name_en": row.name_en,
                "name_ar": row.name_ar,
                "color": row.color,
                "count": row.count,
            }
            for row in status_rows
        ]

    @classmethod
    async def get_all_active_statuses(
        cls,
        db: AsyncSession,
        *,
        is_active: Optional[bool] = None,
        readonly: Optional[bool] = None
    ) -> List[RequestStatus]:
        """
        Get all active request statuses visible to requesters.

        Args:
            db: Database session
            is_active: Filter by active status (optional)
            readonly: Filter by readonly status (optional)

        Returns:
            List of RequestStatus objects that are visible on the requester page
        """
        # Build query with proper filtering
        # Filter by active and visible_on_requester_page for requester views
        stmt = select(RequestStatus).where(
            RequestStatus.is_active,
            RequestStatus.visible_on_requester_page
        )

        # Apply optional filters
        if is_active is not None:
            stmt = stmt.where(RequestStatus.is_active == is_active)

        if readonly is not None:
            stmt = stmt.where(RequestStatus.readonly == readonly)

        # Apply ordering
        stmt = stmt.order_by(RequestStatus.id)

        # Execute query
        result = await db.execute(stmt)
        return list(result.scalars().all())
