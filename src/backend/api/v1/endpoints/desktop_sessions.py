"""
Desktop Session API endpoints for Tauri requester app tracking.
Dedicated endpoints for desktop-specific session management.

============================================================================
SECURITY NOTICE (Finding #19 - Remote Input Session Binding)
============================================================================

FUTURE INTEGRATION POINT: Desktop Session ID for Remote Access

This module manages DesktopSession records which track Tauri app connections.
Each DesktopSession has a unique UUID (session.id) that identifies a specific
connection from a specific device.

WHEN IMPLEMENTING SESSION BINDING:
1. Remote access requests should capture the requester's current
   DesktopSession.id at the time of request initiation
2. The desktop session ID should be validated before processing remote
   input commands
3. If the requester's DesktopSession changes (logout/login, app restart),
   the bound session ID will no longer match and input should be rejected

KEY FIELDS FOR BINDING:
- DesktopSession.id: Unique session identifier (UUID)
- DesktopSession.user_id: Owner of this session
- DesktopSession.is_active: Whether session is currently active
- DesktopSession.last_heartbeat: Last activity timestamp
- DesktopSession.device_fingerprint: Device identifier for disambiguation

See Finding #19 documentation in remote_access.py for full context.
============================================================================
"""

import logging
import re
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_optional_user
from core.logging_config import SessionLogger
from models import User
from schemas.session.desktop_session import (
    DesktopSessionRead,
    DesktopSessionWithUserRead,
)
from services.desktop_session_service import DesktopSessionService

router = APIRouter()

# UUID validation pattern for clear error messages
UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)


def validate_session_uuid(session_id: str = Path(..., description="Desktop session UUID")) -> UUID:
    """
    Validate session_id is a proper UUID, provide clear error message if not.
    This catches legacy numeric session IDs from old clients.
    """
    if not UUID_PATTERN.match(session_id):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id: UUID required, got '{session_id}'. "
                   "Please update your application to the latest version."
        )
    return UUID(session_id)

# Create logger for desktop session endpoints
logger = logging.getLogger("api.desktop_sessions")
session_logger = SessionLogger()


@router.get("/active", response_model=List[DesktopSessionRead])
async def get_active_desktop_sessions(db: AsyncSession = Depends(get_session)):
    """
    Get all active desktop sessions across all users.

    Returns:
        List of all active desktop sessions ordered by last_heartbeat descending
    """
    return await DesktopSessionService.get_active_sessions(db=db)


@router.get("/active-with-users", response_model=List[DesktopSessionWithUserRead])
async def get_active_desktop_sessions_with_users(db: AsyncSession = Depends(get_session)):
    """
    Get all active desktop sessions with user information and version policy status.
    Used for monitoring dashboard.

    Each session is enriched with version_status and target_version fields
    based on the Version Authority policy resolution.

    Returns:
        List of active desktop sessions with user details and version policy,
        ordered by last_heartbeat descending
    """
    from services.version_policy_service import VersionPolicyService

    # Fetch raw sessions
    sessions = await DesktopSessionService.get_active_sessions_with_users(db=db)

    if not sessions:
        return []

    # Fetch version registry once for all sessions (efficiency)
    version_registry = await VersionPolicyService.get_version_registry(db, "desktop")

    # Enrich each session with version policy
    enriched_sessions = []
    for session in sessions:
        # Resolve version policy for this session
        policy = VersionPolicyService.resolve_version_policy(
            client_version_string=session.app_version,
            platform="desktop",
            version_registry=version_registry,
        )

        # Create enriched response dict
        # We need to convert session to dict, add policy fields, then return
        session_dict = {
            "id": session.id,
            "user_id": session.user_id,
            "ip_address": session.ip_address,
            "app_version": session.app_version,
            "computer_name": session.computer_name,
            "os_info": session.os_info,
            "is_active": session.is_active,
            "created_at": session.created_at,
            "last_heartbeat": session.last_heartbeat,
            "authenticated_at": session.authenticated_at,
            "auth_method": session.auth_method,
            "device_fingerprint": session.device_fingerprint,
            "user": {
                "id": session.user.id,
                "username": session.user.username,
                "full_name": session.user.full_name,
            },
            "session_type_id": 2,
            "version_status": policy.version_status.value,
            "target_version": policy.target_version_string,
        }

        enriched_sessions.append(session_dict)

    return enriched_sessions


@router.post("/cleanup", status_code=200)
async def cleanup_stale_desktop_sessions(
    timeout_minutes: int = 10, db: AsyncSession = Depends(get_session)
):
    """
    Cleanup stale desktop sessions (no heartbeat for > timeout_minutes).
    Desktop sessions have shorter timeout (10 mins) than web sessions.

    Args:
        timeout_minutes: Minutes of inactivity before cleanup (default: 10)

    Returns:
        Number of sessions cleaned up
    """
    logger.info(f"Manual desktop session cleanup triggered | Timeout: {timeout_minutes} minutes")

    count = await DesktopSessionService.cleanup_stale_sessions(
        db=db, timeout_minutes=timeout_minutes
    )

    logger.info(f"Desktop session cleanup completed | Cleaned up {count} stale sessions")
    return {"cleaned_count": count, "message": f"Cleaned up {count} stale desktop sessions"}


@router.get("/stats")
async def get_desktop_session_stats(
    db: AsyncSession = Depends(get_session),
):
    """
    Get statistics for desktop sessions only.

    Returns:
        Dictionary with desktop session stats
    """
    from datetime import datetime, timedelta

    # Get active desktop sessions only
    desktop_sessions = await DesktopSessionService.get_active_sessions(db=db)

    # Count unique users
    unique_users = len({str(session.user_id) for session in desktop_sessions})

    # Count truly active sessions (heartbeat within last 1 minute)
    # Matches frontend STALE_THRESHOLD for consistent status reporting
    now = datetime.utcnow()
    active_threshold = now - timedelta(minutes=1)

    active_count = sum(
        1 for session in desktop_sessions
        if session.last_heartbeat and session.last_heartbeat >= active_threshold
    )

    total_sessions = len(desktop_sessions)

    return {
        "totalSessions": total_sessions,
        "desktopSessions": total_sessions,
        "webSessions": 0,
        "mobileSessions": 0,
        "activeSessions": active_count,
        "uniqueUsers": unique_users,
        "avgSessionDuration": None,
    }


@router.get("/{session_id}", response_model=DesktopSessionRead)
async def get_desktop_session_by_id(
    session_id: UUID = Depends(validate_session_uuid),
    db: AsyncSession = Depends(get_session)
):
    """
    Get a specific desktop session by ID.

    Args:
        session_id: Desktop session UUID (validated)

    Returns:
        Desktop session details

    Raises:
        HTTPException: 400 if session_id is not a valid UUID
        HTTPException: 404 if session not found
    """
    session = await DesktopSessionService.get_session_by_id(db=db, session_id=session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Desktop session not found")

    return session


@router.post("/{session_id}/heartbeat", response_model=DesktopSessionRead)
async def update_desktop_heartbeat(
    session_id: UUID = Depends(validate_session_uuid),
    ip_address: str = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_optional_user),
):
    """
    Update desktop session heartbeat (called periodically by Tauri requester app).

    SECURITY: If authenticated, verifies the session belongs to the current user.
    This prevents one user from sending heartbeats for another user's session.

    Args:
        session_id: Desktop session UUID (validated)
        ip_address: Optional IP address update
        current_user: Optional authenticated user for ownership verification

    Returns:
        Updated desktop session

    Raises:
        HTTPException: 400 if session_id is not a valid UUID
        HTTPException: 403 if authenticated user doesn't own the session
        HTTPException: 404 if session not found
    """
    # First, get the session to verify ownership if authenticated
    session = await DesktopSessionService.get_session_by_id(db=db, session_id=session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Desktop session not found")

    # SECURITY: If user is authenticated, verify they own this session
    if current_user and session.user_id != current_user.id:
        logger.warning(
            f"Heartbeat rejected: user {current_user.id} tried to update session {session_id} "
            f"owned by user {session.user_id}"
        )
        raise HTTPException(
            status_code=403,
            detail="Not authorized to update this session"
        )

    # Update heartbeat
    session = await DesktopSessionService.update_heartbeat(
        db=db, session_id=session_id, ip_address=ip_address
    )

    logger.debug(f"Desktop heartbeat updated for session {session_id}")
    return session


@router.post("/{session_id}/disconnect", status_code=200)
async def disconnect_desktop_session(
    session_id: UUID = Depends(validate_session_uuid),
    db: AsyncSession = Depends(get_session),
    force: bool = False
):
    """
    Mark a desktop session as disconnected (called when Tauri app closes or admin forces disconnect).

    Args:
        session_id: Desktop session UUID (validated)
        force: If True, sends WebSocket message to force the client to disconnect immediately

    Returns:
        Success message

    Raises:
        HTTPException: 400 if session_id is not a valid UUID
        HTTPException: 404 if session not found
    """
    session = await DesktopSessionService.disconnect_session(db=db, session_id=session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Desktop session not found")

    # If force disconnect requested, send notification to client via SignalR
    if force:
        try:
            from services.signalr_client import signalr_client
            from datetime import datetime

            user_id_str = str(session.user_id)
            await signalr_client.send_user_notification(
                user_id=user_id_str,
                notification={
                    "type": "session_terminated",
                    "sessionId": str(session_id),
                    "reason": "Session terminated by administrator",
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
            )
            logger.info(f"Sent force disconnect message to user {user_id_str} for session {session_id}")
        except Exception as e:
            logger.warning(f"Failed to send force disconnect notification: {e}")

    logger.info(f"Desktop session {session_id} disconnected (force={force})")
    return {"message": "Desktop session disconnected successfully"}


@router.get("/user/{user_id}", response_model=List[DesktopSessionRead])
async def get_user_desktop_sessions(
    user_id: UUID,
    active_only: bool = True,
    db: AsyncSession = Depends(get_session),
):
    """
    Get all desktop sessions for a specific user.

    Args:
        user_id: User UUID
        active_only: Only return active sessions (default: true)

    Returns:
        List of user's desktop sessions
    """
    sessions = await DesktopSessionService.get_user_sessions(
        db=db, user_id=user_id, active_only=active_only
    )

    return sessions


@router.post("/{session_id}/push-update", status_code=200)
async def push_update_to_desktop_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Push update notification to a desktop session to trigger client upgrade.

    Sends a WebSocket message to the connected client with the latest version
    information. The client should download and install the update.

    Args:
        session_id: Desktop session ID (UUID)

    Returns:
        Success message with target version

    Raises:
        HTTPException: 404 if session not found
        HTTPException: 400 if no latest version configured
    """
    from datetime import datetime
    from sqlalchemy import select
    from services.client_version_service import ClientVersionService
    from services.signalr_client import signalr_client
    from models import DesktopSession

    # Get the session by UUID
    stmt = select(DesktopSession).where(DesktopSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Desktop session not found")

    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")

    # Get the latest version
    latest_version = await ClientVersionService.get_latest_version(db, platform="desktop")

    if not latest_version:
        raise HTTPException(status_code=400, detail="No latest version configured in Version Authority")

    # Require installer_url to be configured for push updates
    if not latest_version.installer_url:
        raise HTTPException(
            status_code=400,
            detail=f"Installer URL not configured for version {latest_version.version_string}. "
                   "Please configure it in Version Authority before pushing updates."
        )

    # Send notification to client via SignalR with update info
    user_id_str = str(session.user_id)
    try:
        await signalr_client.send_user_notification(
            user_id=user_id_str,
            notification={
                "type": "update_available",
                "targetVersion": latest_version.version_string,
                "installerUrl": latest_version.installer_url,
                "silentInstallArgs": latest_version.silent_install_args,
                "releaseNotes": latest_version.release_notes,
                "isEnforced": latest_version.is_enforced,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )
        logger.info(
            f"Pushed update notification to user {user_id_str} for session {session_id} | "
            f"Target version: {latest_version.version_string}"
        )
    except Exception as e:
        logger.warning(
            f"Failed to push update notification to user {user_id_str}: {e}"
        )

    return {
        "success": True,
        "sessionId": str(session_id),
        "userId": user_id_str,
        "targetVersion": latest_version.version_string,
        "message": f"Update notification sent for version {latest_version.version_string}"
    }
