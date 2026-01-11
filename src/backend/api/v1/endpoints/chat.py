"""
Chat API endpoints for screenshot-based messaging.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Rate limiter for chat endpoints
limiter = Limiter(key_func=get_remote_address)

from core.config import settings
from core.database import get_session
from core.dependencies import get_client_ip, get_current_user, verify_request_access
from models.database_models import User
from schemas import (
    ChatMessageCreate,
    ChatMessageCreateByClient,
    ChatMessageRead,
)
# REMOVED: attachment imports (attachments removed, kept only screenshots)
from schemas.chat_message.chat_page import ChatPageResponse
from schemas.chat_message.read_state import (
    ChatUnreadCountItem,
    ChatUnreadCountsResponse,
    MarkChatAsReadResponse,
    ReadReceiptResponse,
    TotalUnreadResponse,
    UnreadCountResponse,
)
# REMOVED: ChatAttachmentService, FileService imports (attachments removed)
from services.chat_service import ChatService

router = APIRouter()


@router.post("/messages", response_model=ChatMessageRead, status_code=201)
@limiter.limit("30/minute")  # Rate limit: 30 messages per minute per IP
async def create_message(
    request: Request,  # Must be first param for rate limiter
    message_data: ChatMessageCreateByClient,  # Client doesn't send sender_id
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new chat message. Rate limited to 30 messages per minute.

    Sender is automatically inferred from the authenticated user (JWT token).
    Client IP address is automatically extracted from request headers.
    Client sends: request_id, content
    Backend auto-populates: sender_id, ip_address

    Authorization: User must be the requester, assigned technician, or a technician/admin.
    """
    # Verify user has access to this service request
    await verify_request_access(message_data.request_id, current_user, db)

    try:
        # Extract client IP address
        client_ip = get_client_ip(request)

        # Create full message data with sender_id from current user
        full_message_data = ChatMessageCreate(
            request_id=message_data.request_id,
            content=message_data.content,
            is_screenshot=message_data.is_screenshot,
            screenshot_file_name=message_data.screenshot_file_name,
            sender_id=current_user.id,  # Auto-populated from JWT
            client_temp_id=message_data.client_temp_id,  # Pass through for optimistic UI matching
            # File attachment fields (for non-image files)
            file_name=message_data.file_name,
            file_size=message_data.file_size,
            file_mime_type=message_data.file_mime_type,
        )

        message = await ChatService.create_message(
            db=db,
            message_data=full_message_data,
            sender_id=current_user.id,
            ip_address=client_ip,
        )

        # REMOVED: attachment loading (attachments removed, kept only screenshots)

        # Check if current user has read this message using ChatReadMonitor
        from services.chat_read_state_service import ChatReadStateService

        monitor = await ChatReadStateService.get_or_create_monitor(
            db, message.request_id, current_user.id
        )
        # Message is read if it was created before or at the last_read_at timestamp
        is_read_by_user = False
        if monitor.last_read_at and message.created_at <= monitor.last_read_at:
            is_read_by_user = True

        # Build sender info (include full name for display)
        sender_info = None
        if message.sender:
            sender_info = {
                "id": str(message.sender.id),  # Convert UUID to string for JSON serialization
                "username": message.sender.username,
                "fullName": message.sender.full_name,
                "email": message.sender.email,
            }

        # Create complete message dict (camelCase for WebSocket/frontend)
        message_dict = {
            "id": str(message.id),
            "requestId": str(message.request_id),
            "senderId": str(message.sender_id) if message.sender_id else None,  # Convert UUID to string
            "sender": sender_info,  # Include sender details
            "content": message.content,
            "sequenceNumber": message.sequence_number,
            "isScreenshot": message.is_screenshot,
            "screenshotFileName": message.screenshot_file_name,
            # File attachment fields (for non-image files)
            "fileName": message.file_name,
            "fileSize": message.file_size,
            "fileMimeType": message.file_mime_type,
            "isRead": message.is_read,
            "isReadByCurrentUser": is_read_by_user,
            # REMOVED: attachmentCount field (attachments removed)
            "createdAt": message.created_at.isoformat() + "Z",
            "updatedAt": (
                message.updated_at.isoformat() + "Z" if message.updated_at else None
            ),
            "readAt": message.read_at.isoformat() + "Z" if message.read_at else None,
            "readReceipt": None,
            # CRITICAL: Include client_temp_id for optimistic message replacement
            "clientTempId": message_data.client_temp_id,
        }

        # Message is already broadcast via SignalR in chat_service.create_message()

        # Get service request to determine who to notify for ticket list update
        from services.request_service import RequestService

        service_request = await RequestService.get_service_request_by_id(
            db=db, request_id=message.request_id
        )

        if service_request:
            # Broadcast ticket list update to requester
            user_ids_to_notify = [service_request.requester_id]

            # Get unread count for the recipient using ChatReadMonitor
            from services.chat_read_state_service import ChatReadStateService

            # Increment unread count for participants (excluding sender and viewers)
            viewers = await ChatReadStateService.get_users_viewing_chat(
                db, message.request_id
            )
            exclude_users = [current_user.id] + viewers
            participant_ids = [service_request.requester_id]  # Add assigned agents here if needed

            await ChatReadStateService.increment_unread_for_users(
                db=db,
                request_id=message.request_id,
                exclude_user_ids=exclude_users,
                participant_user_ids=participant_ids,
            )

            # Get unread count for requester
            unread_count = await ChatReadStateService.get_unread_count(
                db, message.request_id, service_request.requester_id
            )

            # Send notification to requester via SignalR
            # CRITICAL: Notifications are NON-FATAL - message creation must succeed
            # even if notification delivery fails
            try:
                from services.signalr_client import signalr_client

                for user_id in user_ids_to_notify:
                    await signalr_client.send_user_notification(
                        user_id=str(user_id),
                        notification={
                            "type": "new_message_notification",
                            "requestId": str(message.request_id),
                            "message": {
                                "id": str(message.id),
                                "senderId": str(current_user.id),
                                "content": message.content[:100] if message.content else "",
                                "senderName": current_user.full_name or current_user.username,
                                "createdAt": message.created_at.isoformat() + "Z",
                            },
                            "unreadCount": unread_count,
                        }
                    )
            except Exception as notif_error:
                # Log but don't fail the message creation
                logger.warning(
                    f"Failed to send notification for message {message.id}: {notif_error}"
                )

        # Return the message_dict which includes clientTempId for optimistic UI matching
        return message_dict
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/messages/request/{request_id}", response_model=List[ChatMessageRead]
)
async def get_messages(
    request_id: UUID,
    response: Response,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    limit: Optional[int] = Query(None, ge=1, le=200, description="Limit for cursor-based pagination"),
    before_sequence: Optional[int] = Query(None, ge=1, description="Cursor: load messages with sequence < this"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get messages for a request with per-user read state.

    Supports TWO pagination modes:

    **Cursor-based (RECOMMENDED for chat)**:
    - Use `limit` + optional `before_sequence` parameters
    - Initial load: `?limit=100` returns the latest 100 messages
    - Load more: `?limit=200&before_sequence={oldest_sequence}` returns 200 older messages
    - Response headers include `X-Oldest-Sequence` for the next cursor

    **Offset-based (legacy)**:
    - Use `page` + `per_page` parameters
    - Page 1 returns the newest messages

    Response Headers:
    - `X-Total-Count`: Total number of messages in the chat
    - `X-Oldest-Sequence`: Sequence number of oldest message in response (cursor for "load more")
    - `X-Has-More`: "true" if there are older messages to load

    Authorization: User must be the requester, assigned technician, or a technician/admin.
    """
    # Verify user has access to this service request
    await verify_request_access(request_id, current_user, db)

    # Determine pagination mode
    use_cursor_pagination = limit is not None

    if use_cursor_pagination:
        # Cursor-based pagination (preferred)
        messages, total, oldest_sequence = await ChatService.get_messages_cursor_paginated(
            db=db,
            request_id=request_id,
            current_user_id=current_user.id,
            limit=limit,
            before_sequence=before_sequence,
        )
        response.headers["X-Oldest-Sequence"] = str(oldest_sequence) if oldest_sequence else ""
        response.headers["X-Has-More"] = "true" if oldest_sequence and oldest_sequence > 1 else "false"
    else:
        # Offset-based pagination (legacy)
        messages, total, user_id = await ChatService.get_messages(
            db=db,
            request_id=request_id,
            current_user_id=current_user.id,
            include_internal=False,
            page=page,
            per_page=per_page,
        )

    response.headers["X-Total-Count"] = str(total)

    # Get read monitor ONCE for all messages (avoid N+1 queries)
    # All messages share the same request_id and current_user.id
    from services.chat_read_state_service import ChatReadStateService

    monitor = await ChatReadStateService.get_or_create_monitor(
        db, request_id, current_user.id
    )

    # Convert messages to response schema with per-user read state
    result = []
    for message in messages:
        # Check if current user has read this message using the monitor fetched above
        # Message is read if it was created before or at the last_read_at timestamp
        is_read_by_user = False
        if monitor.last_read_at and message.created_at <= monitor.last_read_at:
            is_read_by_user = True

        # REMOVED: attachment loading (attachments removed, kept only screenshots)

        # Build sender info from eager-loaded relationship
        sender_info = None
        if message.sender:
            sender_info = {
                "id": message.sender.id,
                "username": message.sender.username,
                "full_name": message.sender.full_name,
                "email": message.sender.email,
            }

        # Create response dict with all message fields plus per-user read state
        message_dict = {
            "id": message.id,
            "request_id": message.request_id,
            "sender_id": message.sender_id,
            "sender": sender_info,  # Include sender details for display
            "content": message.content,
            "sequence_number": message.sequence_number,  # Include for cursor pagination
            "is_screenshot": message.is_screenshot,
            "screenshot_file_name": message.screenshot_file_name,
            "is_read": message.is_read,  # Deprecated
            "is_read_by_current_user": is_read_by_user,
            # REMOVED: attachment_count field (attachments removed)
            "created_at": message.created_at,
            "updated_at": message.updated_at,
            "read_at": message.read_at,  # Deprecated
            # REMOVED: attachments array (attachments removed)
        }
        result.append(ChatMessageRead(**message_dict))

    return result


@router.post("/messages/{message_id}/read", response_model=ChatMessageRead)
async def mark_message_as_read(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a message as read for the current user.

    UPDATED: Creates per-user read state record.
    """
    message = await ChatService.mark_as_read(
        db=db, message_id=message_id, user_id=current_user.id
    )

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    return message


@router.post("/messages/request/{request_id}/read-all")
async def mark_all_messages_as_read(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Mark all messages in a request as read for the current user.

    UPDATED: Uses bulk insert for efficiency.

    Authorization: User must be the requester, assigned technician, or a technician/admin.
    """
    # Verify user has access to this service request
    await verify_request_access(request_id, current_user, db)

    # Mark messages as read
    count = await ChatService.mark_all_as_read(
        db=db, request_id=request_id, user_id=current_user.id
    )

    return {"marked_as_read": count}


@router.get(
    "/messages/request/{request_id}/unread-count",
    response_model=UnreadCountResponse,
)
async def get_unread_count(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get count of unread messages for current user in a request.

    UPDATED: Excludes messages sent by current user.

    Authorization: User must be the requester, assigned technician, or a technician/admin.
    """
    # Verify user has access to this service request
    await verify_request_access(request_id, current_user, db)

    count = await ChatService.get_unread_count(
        db=db, request_id=request_id, user_id=current_user.id
    )

    # Get total message count using repository
    from repositories.chat_repository import ChatMessageRepository

    total = await ChatMessageRepository.get_total_count_by_request(
        db, request_id
    )

    # Get last message timestamp using repository
    last_message_at = await ChatMessageRepository.get_last_message_timestamp(
        db, request_id
    )

    return UnreadCountResponse(
        request_id=request_id,
        user_id=current_user.id,
        unread_count=count,
        total_messages=total,
        last_message_at=last_message_at,
    )


@router.get(
    "/messages/{message_id}/read-receipts", response_model=ReadReceiptResponse
)
async def get_message_read_receipts(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get list of users who have read a specific message.

    Useful for "seen by" indicators in group chats.
    """
    readers = await MessageReadStateService.get_users_who_read_message(
        db, message_id
    )

    return ReadReceiptResponse(
        message_id=message_id, total_readers=len(readers), readers=readers
    )


@router.delete("/messages/{message_id}/read")
async def mark_message_as_unread(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a message as unread by deleting the read state.

    Useful for "mark as unread" feature.
    """
    deleted = await MessageReadStateService.mark_message_unread(
        db, message_id, current_user.id
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Read state not found (message not read or doesn't exist)",
        )

    return {"message": "Marked as unread"}


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a message (sender or supervisor only)."""
    success = await ChatService.delete_message(
        db=db, message_id=message_id, user_id=current_user.id
    )

    if not success:
        raise HTTPException(
            status_code=404, detail="Message not found or unauthorized"
        )

    return Response(status_code=204)


@router.get("/page-data", response_model=ChatPageResponse)
async def get_chat_page_data(
    status_filter: Optional[int] = Query(
        None, description="Filter by status ID"
    ),
    read_filter: Optional[str] = Query(
        None, description="Filter by read status: 'read' or 'unread'"
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get aggregated data for the chat page.

    Returns:
    - **request_status**: List of request statuses with counts and colors
    - **chat_messages_count**: Read/unread message counts
    - **chat_messages**: List of requests with last message details

    Query Parameters:
    - **status_filter**: Optional status ID to filter requests
    - **read_filter**: Optional filter by read status ('read' or 'unread')
    """
    try:
        page_data = await ChatService.get_chat_page_data(
            db=db,
            user_id=current_user.id,
            status_filter=status_filter,
            read_filter=read_filter,
        )
        return page_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# ALL TICKETS ENDPOINT (for React app client-side filtering)
# ============================================================================


@router.get("/all-tickets", response_model=ChatPageResponse)
async def get_all_user_tickets(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get all tickets for the current user without any filtering.

    This endpoint is optimized for the React app which implements client-side filtering.
    It returns all tickets (up to ~150 per user) in a single request.

    Returns:
    - **request_status**: List of all request statuses with counts and colors
    - **chat_messages_count**: Total read/unread message counts
    - **chat_messages**: List of ALL requests with last message details

    Note: This endpoint is used by the React app only. The Next.js app continues
    to use the /page-data endpoint with server-side filtering.
    """
    try:
        # Call the same service method but without any filters
        # This ensures we get ALL tickets for the user
        page_data = await ChatService.get_chat_page_data(
            db=db,
            user_id=current_user.id,
            status_filter=None,  # No status filter
            read_filter=None,    # No read filter
        )
        return page_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# CHAT READ MONITOR ENDPOINTS (per-user, per-chat read tracking)
# ============================================================================


@router.get("/unread-counts", response_model=ChatUnreadCountsResponse)
async def get_all_unread_counts(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get unread counts for all chats the current user has access to.

    Returns per-chat unread counts and total unread count.
    Uses the ChatReadMonitor table for efficient per-user tracking.
    """
    from services.chat_read_state_service import ChatReadStateService

    # Get all monitors for user
    monitors = await ChatReadStateService.get_all_monitors_for_user(
        db, current_user.id
    )

    # Get total unread count
    total_unread = await ChatReadStateService.get_total_unread_count(
        db, current_user.id
    )

    # Convert to response schema
    chats = [
        ChatUnreadCountItem(
            request_id=UUID(m["request_id"]),
            unread_count=m["unread_count"],
            last_read_at=m["last_read_at"],
        )
        for m in monitors
    ]

    return ChatUnreadCountsResponse(
        user_id=current_user.id,
        total_unread=total_unread,
        chats=chats,
    )


@router.get("/total-unread", response_model=TotalUnreadResponse)
async def get_total_unread(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get total unread message count across all chats.

    Useful for notification badges in the UI.
    """
    from services.chat_read_state_service import ChatReadStateService

    total = await ChatReadStateService.get_total_unread_count(
        db, current_user.id
    )

    return TotalUnreadResponse(
        user_id=current_user.id,
        total_unread=total,
    )


@router.post("/{request_id}/mark-read", response_model=MarkChatAsReadResponse)
async def mark_chat_as_read(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a chat as fully read for the current user.

    Sets unread_count to 0 and updates last_read_at timestamp.
    Should be called when the user opens/views a chat.

    IMPORTANT: This is the ONLY path for marking messages as read.
    After DB persistence, broadcasts ReadStatusUpdate via SignalR.

    Authorization: User must be the requester, assigned technician, or a technician/admin.
    """
    # Verify user has access to this service request
    await verify_request_access(request_id, current_user, db)

    import logging
    from datetime import datetime
    from services.chat_read_state_service import ChatReadStateService
    from services.signalr_client import SignalRClient

    logger = logging.getLogger(__name__)
    logger.debug(f"[READ_RECEIPTS] mark_chat_as_read: request_id={request_id}, user_id={current_user.id}")

    # Get current unread count before marking as read
    previous_unread = await ChatReadStateService.get_unread_count(
        db, request_id, current_user.id
    )

    # Get unread message IDs BEFORE marking as read (for SignalR broadcast)
    unread_message_ids = await ChatReadStateService.get_unread_message_ids(
        db, request_id, current_user.id
    )

    # Mark as read (DB persistence)
    monitor = await ChatReadStateService.mark_chat_as_read(
        db, request_id, current_user.id
    )
    logger.debug(f"[READ_RECEIPTS] Marked {len(unread_message_ids)} messages as read for request {request_id}")

    # CRITICAL: Broadcast read status via SignalR AFTER DB commit
    # This ensures the contract: FastAPI is the source of truth
    if unread_message_ids:
        try:
            await SignalRClient.broadcast_read_status(
                request_id=str(request_id),
                user_id=str(current_user.id),
                message_ids=unread_message_ids,
            )
            logger.debug(f"[READ_RECEIPTS] Broadcast ReadStatusUpdate for {len(unread_message_ids)} messages")
        except Exception as e:
            # Log but don't fail - DB is already committed (source of truth)
            logger.warning(f"[READ_RECEIPTS] Failed to broadcast via SignalR: {e}")

    return MarkChatAsReadResponse(
        request_id=request_id,
        user_id=current_user.id,
        marked_at=monitor.last_read_at or datetime.utcnow(),
        previous_unread=previous_unread,
    )


@router.get("/{request_id}/unread", response_model=ChatUnreadCountItem)
async def get_chat_unread(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get unread count for a specific chat.

    Returns unread count and last read timestamp for the current user.

    Authorization: User must be the requester, assigned technician, or a technician/admin.
    """
    # Verify user has access to this service request
    await verify_request_access(request_id, current_user, db)

    from services.chat_read_state_service import ChatReadStateService

    unread_count = await ChatReadStateService.get_unread_count(
        db, request_id, current_user.id
    )

    # Get monitor for last_read_at
    monitor = await ChatReadStateService.get_or_create_monitor(
        db, request_id, current_user.id
    )

    return ChatUnreadCountItem(
        request_id=request_id,
        unread_count=unread_count,
        last_read_at=monitor.last_read_at,
    )


# ============================================================================
# REMOVED: ATTACHMENT ENDPOINTS (attachments removed, kept only screenshots)
# ============================================================================


