"""
Search API endpoints for ticket/request searching.

Provides full-text search and filtering capabilities for service requests,
primarily used by the requester (desktop) application.

Features:
- Full-text search by ticket title
- Status filtering (all or specific status ID)
- Read/unread filtering
- Paginated results
- Returns complete ChatPageResponse with tickets, status counts, and statuses

Endpoints:
- GET /tickets - Search tickets for the current user (requester)

Query Parameters:
- q: Search query string (searches ticket title)
- status_filter: 'all' or a specific status ID
- read_filter: 'all', 'read', or 'unread'
- page: Page number (1-indexed)
- per_page: Items per page (max 100)

Authentication:
- Requires authentication
- Only returns tickets for the current user

Note:
This endpoint is optimized for the requester app's ticket list view.
For admin/agent ticket searching, use the requests endpoints.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user
from db.models import User
from api.schemas.chat_page import ChatPageResponse
from api.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/tickets", response_model=ChatPageResponse)
async def search_tickets(
    q: Optional[str] = Query(None, description="Search query for ticket title"),
    status_filter: Optional[str] = Query(
        "all", description="Filter by status: 'all' or status ID"
    ),
    read_filter: Optional[str] = Query(
        "all", description="Filter by read status: 'all', 'read', or 'unread'"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Search tickets for the current user (requester).

    This endpoint supports:
    - Full-text search by title
    - Status filtering
    - Read/unread filtering
    - Pagination

    Query Parameters:
    - **q**: Search query string (searches ticket title)
    - **status_filter**: 'all' or a specific status ID
    - **read_filter**: 'all', 'read', or 'unread'
    - **page**: Page number (1-indexed)
    - **per_page**: Items per page (max 100)

    Returns:
    - ChatPageResponse with filtered tickets, status counts, and statuses
    """
    # DEBUG: Log incoming request parameters
    logger.info("=" * 60)
    logger.info("[SEARCH] Incoming search request")
    logger.info(f"[SEARCH] User ID: {current_user.id} ({current_user.username})")
    logger.info(f"[SEARCH] Query params: q={q!r}, status_filter={status_filter!r}, read_filter={read_filter!r}")
    logger.info(f"[SEARCH] Pagination: page={page}, per_page={per_page}")

    # Convert status_filter to int or None
    status_id: Optional[int] = None
    if status_filter and status_filter != "all":
        try:
            status_id = int(status_filter)
        except ValueError:
            pass  # Keep as None if invalid

    # Convert read_filter
    read_filter_value: Optional[str] = None
    if read_filter and read_filter != "all":
        read_filter_value = read_filter

    # DEBUG: Log converted filter values
    logger.info(f"[SEARCH] Converted filters: status_id={status_id}, read_filter_value={read_filter_value!r}")

    # Use the search method from ChatService
    page_data = await ChatService.search_tickets(
        db=db,
        user_id=current_user.id,
        search_query=q,
        status_filter=status_id,
        read_filter=read_filter_value,
        page=page,
        per_page=per_page,
    )

    # DEBUG: Log search results summary
    logger.info(f"[SEARCH] Results: {len(page_data.chat_messages)} tickets returned")
    logger.info(f"[SEARCH] Status counts: {len(page_data.request_status)} statuses")
    if page_data.chat_messages:
        logger.info("[SEARCH] Returned tickets:")
        for i, ticket in enumerate(page_data.chat_messages[:5]):  # Show first 5
            logger.info(f"[SEARCH]   {i+1}. ID={ticket.id}, title={ticket.title!r}, status={ticket.status}")
        if len(page_data.chat_messages) > 5:
            logger.info(f"[SEARCH]   ... and {len(page_data.chat_messages) - 5} more")
    else:
        logger.info("[SEARCH] No tickets found matching criteria")
    logger.info("=" * 60)

    return page_data
