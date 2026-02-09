"""
Combined session statistics endpoint.

Aggregates and returns session statistics from both DesktopSession and WebSession tables.
Provides a unified view of all active user sessions across different client types.

Features:
- Total sessions count across all session types
- Breakdown by session type (desktop, web, mobile)
- Unique users count (deduplicated across session types)
- Active sessions count (heartbeat within last 5 minutes)
- Average session duration (TODO)

Endpoints:
- GET /stats - Get combined session statistics

Authentication:
- Requires authentication

Note:
Mobile sessions are not yet implemented and always return 0.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user
from db import User
from api.schemas.desktop_session import ActiveSessionStats
from api.services.web_session_service import WebSessionService

router = APIRouter()
logger = logging.getLogger("api.session_stats")


@router.get("/stats", response_model=ActiveSessionStats)
async def get_combined_session_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ActiveSessionStats:
    """
    Get combined statistics from both desktop and web sessions.

    Returns:
        ActiveSessionStats with total sessions, breakdown by type, and unique users
    """
    from api.services.presence_service import presence_service

    # Desktop counts from Redis presence (authoritative)
    redis_session_ids = await presence_service.get_all_present_session_ids()
    redis_user_ids = await presence_service.get_present_user_ids()

    # Web sessions still come from DB (no Redis presence for web yet)
    web_sessions = await WebSessionService.get_active_sessions(db=db)
    web_user_ids = {str(s.user_id) for s in web_sessions}

    unique_users = len(redis_user_ids | web_user_ids)
    desktop_count = len(redis_session_ids)
    active_count = desktop_count + len(web_sessions)
    total_sessions = desktop_count + len(web_sessions)

    stats = ActiveSessionStats(
        total_sessions=total_sessions,
        desktop_sessions=desktop_count,
        web_sessions=len(web_sessions),
        mobile_sessions=0,  # Not implemented yet
        active_sessions=active_count,
        unique_users=unique_users,
        avg_session_duration=None,  # TODO: Calculate if needed
    )

    logger.debug(f"Session stats: {stats}")
    return stats
