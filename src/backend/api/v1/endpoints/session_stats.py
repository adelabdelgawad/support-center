"""
Combined session statistics endpoint.
Aggregates data from both DesktopSession and WebSession tables.
"""

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas.session.desktop_session import ActiveSessionStats
from services.desktop_session_service import DesktopSessionService
from services.web_session_service import WebSessionService

router = APIRouter()
logger = logging.getLogger("api.session_stats")


@router.get("/stats", response_model=ActiveSessionStats)
async def get_combined_session_stats(
    db: AsyncSession = Depends(get_session),
) -> ActiveSessionStats:
    """
    Get combined statistics from both desktop and web sessions.

    Returns:
        ActiveSessionStats with total sessions, breakdown by type, and unique users
    """
    # Get active sessions from both types
    desktop_sessions = await DesktopSessionService.get_active_sessions(db=db)
    web_sessions = await WebSessionService.get_active_sessions(db=db)

    # Count unique users across both session types
    desktop_user_ids = {str(session.user_id) for session in desktop_sessions}
    web_user_ids = {str(session.user_id) for session in web_sessions}
    unique_users = len(desktop_user_ids | web_user_ids)

    # Count truly active sessions (heartbeat within last 5 minutes)
    now = datetime.utcnow()
    active_threshold = now - timedelta(minutes=5)

    active_count = 0
    for session in desktop_sessions:
        if session.last_heartbeat and session.last_heartbeat >= active_threshold:
            active_count += 1
    for session in web_sessions:
        if session.last_heartbeat and session.last_heartbeat >= active_threshold:
            active_count += 1

    total_sessions = len(desktop_sessions) + len(web_sessions)

    stats = ActiveSessionStats(
        total_sessions=total_sessions,
        desktop_sessions=len(desktop_sessions),
        web_sessions=len(web_sessions),
        mobile_sessions=0,  # Not implemented yet
        active_sessions=active_count,
        unique_users=unique_users,
        avg_session_duration=None,  # TODO: Calculate if needed
    )

    logger.debug(f"Session stats: {stats}")
    return stats
