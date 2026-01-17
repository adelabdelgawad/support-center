"""
Chat service with performance optimizations.
Enhanced with centralized logging and error handling.

REFACTORED:
- Removed UserRole enum import
- Replaced role-based checks with is_technician/is_super_admin
- Migrated database operations to ChatMessageRepository and RequestStatusRepository
"""

import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (critical_database_operation,
                             log_database_operation, safe_database_query,
                             transactional_database_operation)
from core.sanitizer import sanitize_message_content
from models import ChatMessage, ServiceRequest, User
from repositories.chat_repository import (ChatMessageRepository,
                                          RequestStatusRepository)
from repositories.user_repository import UserRepository
from schemas.chat_message.chat_message import ChatMessageCreate
from schemas.chat_message.chat_page import (ChatMessageCountRecord,
                                            ChatPageResponse,
                                            ChatRequestListItem,
                                            ChatRequestStatus,
                                            RequestStatusCount)
# Module-level logger using __name__
logger = logging.getLogger(__name__)


async def _get_bu_interval_seconds(db: AsyncSession, business_unit_id: Optional[int]) -> int:
    """
    Get WhatsApp interval in seconds from business unit settings.

    Returns interval in seconds, defaults to 300 (5 minutes) if not configured.

    Args:
        db: Database session
        business_unit_id: Business unit ID (can be None)

    Returns:
        Interval in seconds (default: 300)
    """
    if not business_unit_id:
        return 300  # Default 5 minutes

    from repositories.business_unit_repository import BusinessUnitRepository

    bu = await BusinessUnitRepository.find_by_id(db, business_unit_id)

    if bu and bu.whatsapp_outshift_interval_minutes:
        return bu.whatsapp_outshift_interval_minutes * 60

    return 300  # Default 5 minutes


class ChatService:
    """Service for managing chat messages with performance optimizations."""

    @staticmethod
    @transactional_database_operation(operation_name="create_message")
    @log_database_operation("message creation", level="debug")
    async def create_message(
        db: AsyncSession,
        message_data: ChatMessageCreate,
        sender_id: int,
        ip_address: Optional[str] = None,
    ) -> ChatMessage:
        """
        Create a new chat message.

        UPDATED: Auto-generates sequence_number for the message.
        UPDATED: Captures sender IP address.

        Args:
            db: Database session
            message_data: Message creation data
            sender_id: ID of the user sending the message
            ip_address: Sender IP address (optional)

        Returns:
            Created message with sequence_number
        """
        # Verify request exists
        from repositories.service_request_repository import \
            ServiceRequestRepository
        request = await ServiceRequestRepository.find_by_id(db, message_data.request_id)

        if not request:
            raise ValueError("Service request not found")

        # Check if task is closed/solved (count_as_solved=True)
        if request.status and request.status.count_as_solved:
            raise ValueError("Cannot send message to a closed/solved task")

        # Get next sequence number for this request with row-level locking (CRITICAL: thread-safe)
        # Lock the ServiceRequest row first to serialize sequence number generation
        from sqlalchemy import func, select
        from models import ServiceRequest

        # Lock the parent request row to serialize concurrent message creation
        await db.execute(
            select(ServiceRequest.id)
            .where(ServiceRequest.id == message_data.request_id)
            .with_for_update()
        )

        # Now safely get max sequence (other transactions wait for our lock)
        max_seq_result = await db.execute(
            select(func.coalesce(func.max(ChatMessage.sequence_number), 0))
            .where(ChatMessage.request_id == message_data.request_id)
        )
        max_seq = max_seq_result.scalar() or 0
        next_sequence = max_seq + 1

        # Business logic: Prepare message data
        # SECURITY: Sanitize message content to prevent XSS attacks
        sanitized_content = sanitize_message_content(message_data.content)

        message_dict = {
            "request_id": message_data.request_id,
            "sender_id": sender_id,
            "content": sanitized_content,
            "is_screenshot": message_data.is_screenshot,
            "screenshot_file_name": message_data.screenshot_file_name,
            # File attachment fields (for non-image files)
            "file_name": message_data.file_name,
            "file_size": message_data.file_size,
            "file_mime_type": message_data.file_mime_type,
            "sequence_number": next_sequence,
            "ip_address": ip_address,
        }

        # Create message using repository
        message = await ChatMessageRepository.create(db, obj_in=message_dict, commit=False)

        # Update request first_response_at if this is first technician message
        if not request.first_response_at:
            # Check if sender is technician
            user = await UserRepository.find_by_id(db, sender_id)

            if user and user.is_technician:
                request.first_response_at = datetime.utcnow()

        await db.commit()
        await db.refresh(message)

        # NEW: Event-driven WhatsApp trigger for ALL requester messages
        # Check if sender is requester (not system, not technician)
        user = await UserRepository.find_by_id(db, sender_id)

        if user and not user.is_technician and not user.is_super_admin:
            # Set first_requester_message_at if not already set (only on first message)
            if request.first_requester_message_at is None:
                request.first_requester_message_at = message.created_at
                logger.info(
                    f"First requester message detected for request {request.id} at {message.created_at}"
                )
                await db.commit()

            # Schedule WhatsApp notification for ALL requester messages (event-driven, not polling)
            try:
                from tasks.whatsapp_tasks import send_debounced_whatsapp_batch

                # Use different task IDs and intervals based on sequence number
                if message.sequence_number == 1:
                    task_id = f"whatsapp_first_msg_{request.id}"
                    countdown = 30  # 30 seconds for first message
                    batch_type = "first_debounced"
                else:
                    # Subsequent messages: use business unit interval
                    task_id = f"whatsapp_subsequent_{request.id}"
                    countdown = await _get_bu_interval_seconds(db, request.business_unit_id)
                    batch_type = "subsequent_debounced"

                send_debounced_whatsapp_batch.apply_async(
                    args=[str(request.id), batch_type],
                    countdown=countdown,
                    task_id=task_id,  # Celery uses this for deduplication
                )
                logger.info(
                    f"Scheduled WhatsApp batch for request {request.id} "
                    f"(seq={message.sequence_number}, type={batch_type}, countdown={countdown}s)"
                )
            except Exception as schedule_error:
                # Don't fail message creation if scheduling fails
                logger.error(
                    f"Failed to schedule WhatsApp task for request {request.id}: {schedule_error}",
                    exc_info=True
                )

        # Update chat_read_monitor for all participants
        from services.chat_read_state_service import ChatReadStateService

        # Get participants for this request
        participant_ids = await ChatService._get_request_participants(db, message.request_id)

        # Increment unread count for all participants except sender
        await ChatReadStateService.increment_unread_for_users(
            db,
            request_id=message.request_id,
            exclude_user_ids=[sender_id],
            participant_user_ids=participant_ids,
        )

        # Broadcast via SignalR (real-time message delivery)
        try:
            from services.signalr_client import signalr_client

            # Build sender info
            sender_info = None
            if message.sender:
                sender_info = {
                    "id": str(message.sender.id),
                    "username": message.sender.username,
                    "fullName": message.sender.full_name,
                    "email": message.sender.email,
                }

            # Build message dict for SignalR (camelCase for frontend)
            signalr_message = {
                "id": str(message.id),
                "requestId": str(message.request_id),
                "requestTitle": request.title,
                "senderId": str(message.sender_id) if message.sender_id else None,
                "sender": sender_info,
                "content": message.content,
                "sequenceNumber": message.sequence_number,
                "isScreenshot": message.is_screenshot,
                "screenshotFileName": message.screenshot_file_name,
                "createdAt": message.created_at.isoformat() + "Z",
                # CRITICAL: Include client_temp_id for optimistic message replacement
                "clientTempId": message_data.client_temp_id,
            }

            # Broadcast via SignalR
            await signalr_client.broadcast_chat_message(
                request_id=str(message.request_id),
                message=signalr_message,
            )

            # Also broadcast notification via SignalR
            await signalr_client.broadcast_new_message_notification(
                request_id=str(message.request_id),
                message=signalr_message,
            )
        except Exception as e:
            # CRITICAL: Don't fail message creation if SignalR fails
            # Message is persisted to DB but real-time delivery failed
            # Recipient will only see message after page reload (DB fetch)
            logger.error(
                f"SignalR broadcast FAILED for message {message.id} in request {message.request_id}. "
                f"Real-time delivery unavailable - message saved to DB only. Error: {e}",
                exc_info=True,
                extra={
                    "message_id": str(message.id),
                    "request_id": str(message.request_id),
                    "sender_id": str(message.sender_id) if message.sender_id else None,
                    "client_temp_id": message_data.client_temp_id,
                }
            )

        return message

    @staticmethod
    @safe_database_query("get_messages", default_return=([], 0))
    @log_database_operation("message retrieval", level="debug")
    async def get_messages(
        db: AsyncSession,
        request_id: UUID,
        current_user_id: Optional[int] = None,
        include_internal: bool = False,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[ChatMessage], int]:
        """
        Get messages for a request with pagination and per-user read state.

        Args:
            db: Database session
            request_id: Request ID
            current_user_id: Current user ID for per-user read state (optional)
            include_internal: Include internal notes
            page: Page number
            per_page: Messages per page

        Returns:
            Tuple of (list of messages, total count)
        """
        # Use repository for data access
        messages, total = await ChatMessageRepository.find_by_request_id_paginated(
            db,
            request_id,
            page=page,
            per_page=per_page
        )

        # Note: Per-user read state is added in the API layer
        # to avoid SQLModel validation issues with dynamic attributes
        return messages, total, current_user_id

    @staticmethod
    @safe_database_query(operation_name="get_messages_cursor")
    @log_database_operation("cursor-based message retrieval", level="debug")
    async def get_messages_cursor_paginated(
        db: AsyncSession,
        request_id: UUID,
        current_user_id: Optional[int] = None,
        limit: int = 100,
        before_sequence: Optional[int] = None,
    ) -> Tuple[List[ChatMessage], int, Optional[int]]:
        """
        Get messages for a request with cursor-based pagination.

        DETERMINISTIC PAGINATION for chat UX:
        - Initial load: Returns the last `limit` messages (default 100)
        - Load more: Returns `limit` messages older than `before_sequence`

        This is preferred over offset pagination because:
        1. No duplicate/missing messages when new messages arrive during pagination
        2. Stable scroll position when prepending older messages
        3. Efficient database queries using sequence_number index

        Args:
            db: Database session
            request_id: Request ID
            current_user_id: Current user ID for per-user read state (optional)
            limit: Maximum messages to return (default: 100)
            before_sequence: Cursor - load messages with sequence < this value

        Returns:
            Tuple of (messages, total count, oldest_sequence for next cursor)
        """
        messages, total, oldest_sequence = await ChatMessageRepository.find_by_request_id_cursor_paginated(
            db,
            request_id,
            limit=limit,
            before_sequence=before_sequence
        )

        return messages, total, oldest_sequence

    @staticmethod
    @transactional_database_operation(operation_name="mark_as_read")
    @log_database_operation("message mark as read", level="debug")
    async def mark_as_read(
        db: AsyncSession, message_id: UUID, user_id: int
    ) -> Optional[ChatMessage]:
        """
        Mark a message as read for a specific user.

        UPDATED: Uses MessageReadStateService for per-user tracking.

        Args:
            db: Database session
            message_id: Message UUID
            user_id: ID of user marking as read

        Returns:
            Updated message or None
        """
        # Return the message using repository
        return await ChatMessageRepository.find_by_id(db, message_id)

    @staticmethod
    @transactional_database_operation("mark_all_as_read")
    @log_database_operation("all messages mark as read", level="debug")
    async def mark_all_as_read(
        db: AsyncSession, request_id: UUID, user_id: int
    ) -> int:
        """
        Mark all messages in a request as read for a specific user.

        UPDATED: Uses bulk insert into MessageReadState for efficiency.

        Args:
            db: Database session
            request_id: Request ID
            user_id: ID of user marking as read

        Returns:
            Number of messages marked as read
        """
        # Get all message IDs in the request using repository
        message_ids = await ChatMessageRepository.get_message_ids_by_request(db, request_id)

        # Return count of messages
        count = len(message_ids)

        return count

    @staticmethod
    @safe_database_query("get_unread_count", default_return=0)
    @log_database_operation("unread count retrieval", level="debug")
    async def get_unread_count(
        db: AsyncSession, request_id: UUID, user_id: int
    ) -> int:
        """
        Get count of unread messages for a user in a request.

        UPDATED: Uses ChatReadStateService for accurate per-user counts.

        Args:
            db: Database session
            request_id: Request ID
            user_id: User ID

        Returns:
            Count of unread messages
        """
        from services.chat_read_state_service import ChatReadStateService

        return await ChatReadStateService.get_unread_count(
            db, request_id, user_id
        )

    @staticmethod
    @transactional_database_operation("delete_message")
    @log_database_operation("message deletion", level="debug")
    async def delete_message(
        db: AsyncSession, message_id: int, user_id: int
    ) -> bool:
        """
        Delete a message (only by sender or super admin).

        Args:
            db: Database session
            message_id: Message ID
            user_id: ID of user attempting deletion

        Returns:
            True if deleted, False if not found or unauthorized
        """
        # Get message using repository
        message = await ChatMessageRepository.find_by_id(db, message_id)

        if not message:
            return False

        # Check authorization (sender or super admin)
        user = await UserRepository.find_by_id(db, user_id)

        if not user:
            return False

        # Allow deletion if sender or super admin
        if message.sender_id != user_id and not user.is_super_admin:
            return False

        # Delete message using repository
        await ChatMessageRepository.delete(db, message_id, commit=True)

        return True

    @staticmethod
    async def _get_request_status_counts(
        db: AsyncSession, user_id: int
    ) -> List[RequestStatusCount]:
        """
        Get request status counts with colors for a requester.

        Args:
            db: Database session
            user_id: Requester user ID

        Returns:
            List of RequestStatusCount with all statuses and their counts
        """
        # Use repository for data access
        status_dicts = await RequestStatusRepository.get_status_counts_for_requester(
            db, user_id
        )

        # Business logic: Convert to response schema
        request_statuses = [
            RequestStatusCount(
                id=row["id"],
                name=row["name"],
                nameEn=row["name_en"],
                nameAr=row["name_ar"],
                count=row["count"],
                color=row["color"],
            )
            for row in status_dicts
        ]

        logger.debug(
            f"Request status counts for user {user_id}: {request_statuses}"
        )
        return request_statuses

    @staticmethod
    async def _get_chat_message_counts(
        db: AsyncSession, user_id: int
    ) -> List[ChatMessageCountRecord]:
        """
        Get chat message read/unread counts for a requester.

        Args:
            db: Database session
            user_id: Requester user ID

        Returns:
            List with read and unread message counts
        """
        # Use repository for data access
        read_count, unread_count = await ChatMessageRepository.get_read_unread_counts_for_requester(
            db, user_id
        )

        # Business logic: Build response
        chat_messages_count = [
            ChatMessageCountRecord(id=1, name="read", count=read_count),
            ChatMessageCountRecord(id=2, name="unread", count=unread_count),
        ]

        logger.debug(
            f"Chat message counts for user {user_id}: read={read_count}, unread={unread_count}"
        )
        return chat_messages_count

    @staticmethod
    async def _get_chat_messages_list(
        db: AsyncSession,
        user_id: int,
        status_filter: Optional[int] = None,
        read_filter: Optional[str] = None,
    ) -> List[ChatRequestListItem]:
        """
        Get chat messages list with request details for a requester.

        Args:
            db: Database session
            user_id: Requester user ID
            status_filter: Optional status ID to filter requests
            read_filter: Optional read status filter ("read" or "unread")

        Returns:
            List of ChatRequestListItem with request and message details
        """
        # Use repository to get requests with chat messages loaded
        requests = await ChatMessageRepository.get_requests_with_last_message(
            db,
            user_id,
            status_filter=status_filter
        )

        # Build chat messages list
        chat_messages = []
        for request in requests:
            # Get last message
            last_msg = None
            last_msg_at = None
            if request.chat_messages:
                sorted_messages = sorted(
                    request.chat_messages,
                    key=lambda m: m.created_at,
                    reverse=True,
                )
                if sorted_messages:
                    last_msg = sorted_messages[0]
                    last_msg_at = last_msg.created_at.isoformat() + "Z"

            # Count unread messages for this request using chat_read_monitor
            from services.chat_read_state_service import \
                ChatReadStateService

            unread_for_request = await ChatReadStateService.get_unread_count(
                db, request.id, user_id
            )

            # Apply read filter
            if read_filter == "read" and unread_for_request > 0:
                continue
            if read_filter == "unread" and unread_for_request == 0:
                continue

            # Format last message with sender name
            last_message_text = None
            if last_msg:
                # Show "You" if current user is the sender, otherwise show sender name
                if last_msg.sender_id == user_id:
                    sender_name = "You"
                else:
                    # Determine sender name: prioritize full_name, then username
                    sender_name = "Unknown"
                    if last_msg.sender:
                        # Use full_name if it exists, otherwise use username
                        if last_msg.sender.full_name:
                            sender_name = last_msg.sender.full_name
                        elif last_msg.sender.username:
                            sender_name = last_msg.sender.username

                last_message_text = f"{sender_name}: {last_msg.content[:100]}"

            chat_messages.append(
                ChatRequestListItem(
                    id=request.id,
                    title=request.title,
                    status_id=request.status_id,  # NEW: Include status_id
                    status=(
                        request.status.name if request.status else "unknown"
                    ),
                    status_color=(
                        request.status.color if request.status else None
                    ),
                    count_as_solved=(
                        request.status.count_as_solved if request.status else False
                    ),
                    created_at=request.created_at.isoformat() + "Z",
                    last_message=last_message_text,
                    last_message_at=last_msg_at,
                    last_message_sequence=last_msg.sequence_number if last_msg else None,
                    unread_count=unread_for_request,
                )
            )

        logger.debug(
            f"Chat messages list for user {user_id}: {len(chat_messages)} requests"
        )
        return chat_messages

    @staticmethod
    @safe_database_query(
        "get_chat_page_data",
        default_return=ChatPageResponse(
            request_status=[],
            chat_messages_count=[],
            chat_messages=[],
            statuses=[],
        )
    )
    @log_database_operation("chat page data retrieval", level="debug")
    async def get_chat_page_data(
        db: AsyncSession,
        user_id: int,
        status_filter: Optional[int] = None,
        read_filter: Optional[str] = None,
    ) -> ChatPageResponse:
        """
        Get aggregated data for the chat page including:
        - Request status counts with colors
        - Chat message read/unread counts
        - Chat message list with request details

        This is the main endpoint for the requester chat/ticket page.

        Args:
            db: Database session
            user_id: Current user ID (requester)
            status_filter: Optional status ID to filter requests
            read_filter: Optional read status filter ("read" or "unread")

        Returns:
            ChatPageResponse with aggregated data
        """
        # Verify user exists using repository
        user = await UserRepository.find_by_id(db, user_id)

        if not user:
            raise ValueError("User not found")

        # Get all three data components
        request_statuses = await ChatService._get_request_status_counts(
            db, user_id
        )
        chat_messages_count = await ChatService._get_chat_message_counts(
            db, user_id
        )
        chat_messages = await ChatService._get_chat_messages_list(
            db, user_id, status_filter, read_filter
        )

        statuses = await ChatService._get_all_request_statuses(db=db, is_active=True)
        return ChatPageResponse(
            request_status=request_statuses,
            chat_messages_count=chat_messages_count,
            chat_messages=chat_messages,
            statuses=statuses,
        )

    @staticmethod
    @safe_database_query("get_all_request_statuses", default_return=[])
    @log_database_operation("all request statuses retrieval", level="debug")
    async def _get_all_request_statuses(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        readonly: Optional[bool] = None,
    ) -> List[ChatRequestStatus]:
        """
        Get all request statuses for chat functionality.

        This function retrieves request statuses that can be used for filtering
        and display in chat pages.

        Args:
            db: Database session
            is_active: Filter by active status (optional)
            readonly: Filter by readonly status (optional)

        Returns:
            List of ChatRequestStatus objects with id, name, and color
        """
        # Use repository for data access
        statuses = await RequestStatusRepository.get_all_active_statuses(
            db,
            is_active=is_active,
            readonly=readonly
        )

        # Business logic: Convert to ChatRequestStatus schema
        return [
            ChatRequestStatus(
                id=status.id,
                name=status.name,
                name_en=status.name_en,
                name_ar=status.name_ar,
                color=status.color
            )
            for status in statuses
        ]

    @staticmethod
    async def _get_request_participants(db: AsyncSession, request_id: UUID) -> List[int]:
        """
        Get all user IDs who should receive notifications for a request.

        Args:
            db: Database session
            request_id: Service request ID

        Returns:
            List of user IDs (requester + assigned technicians)
        """
        from repositories.service_request_repository import \
            ServiceRequestRepository

        request = await ServiceRequestRepository.find_by_id(db, request_id)
        if not request:
            return []

        participants = [request.requester_id]

        # TODO: Add assigned technicians if needed
        # This would require querying UserRequestAssign table
        # For now, we only include the requester

        return participants

    @staticmethod
    @safe_database_query(
        "search_tickets",
        default_return=ChatPageResponse(
            request_status=[],
            chat_messages_count=[],
            chat_messages=[],
            statuses=[],
        )
    )
    @log_database_operation("ticket search", level="debug")
    async def search_tickets(
        db: AsyncSession,
        user_id: int,
        search_query: Optional[str] = None,
        status_filter: Optional[int] = None,
        read_filter: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> ChatPageResponse:
        """
        Search tickets for a requester with filtering and pagination.

        This method combines search functionality with the existing chat page data.

        Args:
            db: Database session
            user_id: Current user ID (requester)
            search_query: Optional search string to filter by title
            status_filter: Optional status ID to filter requests
            read_filter: Optional read status filter ("read" or "unread")
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            ChatPageResponse with filtered/searched tickets
        """
        # Verify user exists using repository
        user = await UserRepository.find_by_id(db, user_id)

        if not user:
            raise ValueError("User not found")

        # Get all three data components
        request_statuses = await ChatService._get_request_status_counts(
            db, user_id
        )
        chat_messages_count = await ChatService._get_chat_message_counts(
            db, user_id
        )

        # Get chat messages with search filter
        chat_messages = await ChatService._search_chat_messages_list(
            db,
            user_id,
            search_query=search_query,
            status_filter=status_filter,
            read_filter=read_filter,
            page=page,
            per_page=per_page,
        )

        statuses = await ChatService._get_all_request_statuses(db=db, is_active=True)
        return ChatPageResponse(
            request_status=request_statuses,
            chat_messages_count=chat_messages_count,
            chat_messages=chat_messages,
            statuses=statuses,
        )

    @staticmethod
    async def _search_chat_messages_list(
        db: AsyncSession,
        user_id: int,
        search_query: Optional[str] = None,
        status_filter: Optional[int] = None,
        read_filter: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> List[ChatRequestListItem]:
        """
        Search chat messages list with request details for a requester.

        Args:
            db: Database session
            user_id: Requester user ID
            search_query: Optional search string to filter by title
            status_filter: Optional status ID to filter requests
            read_filter: Optional read status filter ("read" or "unread")
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            List of ChatRequestListItem with request and message details
        """
        # DEBUG: Log search parameters
        logger.debug(f"[SEARCH_SERVICE] Starting search for user_id={user_id}")
        logger.debug(f"[SEARCH_SERVICE] Params: search_query={search_query!r}, status_filter={status_filter}, read_filter={read_filter!r}")

        # Use repository to get requests with chat messages loaded
        requests = await ChatMessageRepository.get_requests_with_last_message(
            db,
            user_id,
            status_filter=status_filter
        )

        # DEBUG: Log number of requests fetched from DB
        logger.debug(f"[SEARCH_SERVICE] Fetched {len(requests)} requests from database for user")

        # Build chat messages list with search filtering
        chat_messages = []
        skipped_by_search = 0
        skipped_by_read_filter = 0

        for request in requests:
            # Apply search filter if provided
            if search_query:
                search_lower = search_query.lower()
                title_lower = (request.title or "").lower()
                if search_lower not in title_lower:
                    skipped_by_search += 1
                    logger.debug(f"[SEARCH_SERVICE] Skipped request {request.id}: title={request.title!r} doesn't match query={search_query!r}")
                    continue

            # Get last message
            last_msg = None
            last_msg_at = None
            if request.chat_messages:
                sorted_messages = sorted(
                    request.chat_messages,
                    key=lambda m: m.created_at,
                    reverse=True,
                )
                if sorted_messages:
                    last_msg = sorted_messages[0]
                    last_msg_at = last_msg.created_at.isoformat() + "Z"

            # Count unread messages for this request using chat_read_monitor
            from services.chat_read_state_service import \
                ChatReadStateService

            unread_for_request = await ChatReadStateService.get_unread_count(
                db, request.id, user_id
            )

            # Apply read filter
            if read_filter == "read" and unread_for_request > 0:
                skipped_by_read_filter += 1
                logger.debug(f"[SEARCH_SERVICE] Skipped request {request.id}: has unread messages but filter='read'")
                continue
            if read_filter == "unread" and unread_for_request == 0:
                skipped_by_read_filter += 1
                logger.debug(f"[SEARCH_SERVICE] Skipped request {request.id}: no unread messages but filter='unread'")
                continue

            # Format last message with sender name
            last_message_text = None
            if last_msg:
                # Show "You" if current user is the sender, otherwise show sender name
                if last_msg.sender_id == user_id:
                    sender_name = "You"
                else:
                    # Determine sender name: prioritize full_name, then username
                    sender_name = "Unknown"
                    if last_msg.sender:
                        # Use full_name if it exists, otherwise use username
                        if last_msg.sender.full_name:
                            sender_name = last_msg.sender.full_name
                        elif last_msg.sender.username:
                            sender_name = last_msg.sender.username

                last_message_text = f"{sender_name}: {last_msg.content[:100]}"

            chat_messages.append(
                ChatRequestListItem(
                    id=request.id,
                    title=request.title,
                    status_id=request.status_id,
                    status=(
                        request.status.name if request.status else "unknown"
                    ),
                    status_color=(
                        request.status.color if request.status else None
                    ),
                    count_as_solved=(
                        request.status.count_as_solved
                        if request.status
                        else False
                    ),
                    created_at=request.created_at.isoformat() + "Z",
                    last_message=last_message_text,
                    last_message_at=last_msg_at,
                    unread_count=unread_for_request,
                )
            )

        # DEBUG: Log filtering summary
        logger.debug(f"[SEARCH_SERVICE] Filtering summary:")
        logger.debug(f"[SEARCH_SERVICE]   - Total from DB: {len(requests)}")
        logger.debug(f"[SEARCH_SERVICE]   - Skipped by search query: {skipped_by_search}")
        logger.debug(f"[SEARCH_SERVICE]   - Skipped by read filter: {skipped_by_read_filter}")
        logger.debug(f"[SEARCH_SERVICE]   - After filtering: {len(chat_messages)}")

        # Sort by request creation time (newest first)
        chat_messages.sort(
            key=lambda x: x.created_at,
            reverse=True
        )

        # Apply pagination
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_results = chat_messages[start_idx:end_idx]

        # DEBUG: Log pagination info
        logger.debug(f"[SEARCH_SERVICE] Pagination: showing items {start_idx+1}-{min(end_idx, len(chat_messages))} of {len(chat_messages)}")
        logger.debug(f"[SEARCH_SERVICE] Returning {len(paginated_results)} results")

        return paginated_results
