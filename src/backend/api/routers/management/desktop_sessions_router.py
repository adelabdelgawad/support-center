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
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_optional_user
from core.logging_config import SessionLogger
from db import User
from api.schemas.desktop_session import (
    DesktopSessionRead,
    DesktopSessionWithUserRead,
    UserActivityHeatmapResponse,
)
from api.services.management.desktop_session_service import DesktopSessionService
from core.metrics import (
    track_database_error,
    track_redis_error,
    track_validation_error,
    track_service_error
)

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
    try:
        return await DesktopSessionService.get_active_sessions(db=db)
    except Exception as e:
        track_service_error("desktop_sessions/active")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve active desktop sessions: {str(e)}"
        )


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
    try:
        from api.services.version_policy_service import VersionPolicyService
        from api.services.presence_service import presence_service

        # Fetch raw sessions
        sessions = await DesktopSessionService.get_active_sessions_with_users(db=db)

        if not sessions:
            return []

        # Fetch version registry once for all sessions (efficiency)
        version_registry = await VersionPolicyService.get_version_registry(db, "desktop")

        # Batch-fetch Redis presence for all sessions (authoritative online status)
        try:
            live_session_ids = await presence_service.get_all_present_session_ids()
        except Exception:
            track_redis_error("desktop_sessions/active-with-users")
            live_session_ids = set()

        # Enrich each session with version policy and live presence
        enriched_sessions = []
        for session in sessions:
            # Resolve version policy for this session
            try:
                policy = VersionPolicyService.resolve_version_policy(
                    client_version_string=session.app_version,
                    platform="desktop",
                    version_registry=version_registry,
                )
            except Exception:
                track_service_error("desktop_sessions/active-with-users")
                policy = None

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
                "is_live": str(session.id) in live_session_ids,
                "version_status": policy.version_status.value if policy else "unknown",
                "target_version": policy.target_version_string if policy else None,
            }

            enriched_sessions.append(session_dict)

        return enriched_sessions
    except Exception as e:
        track_service_error("desktop_sessions/active-with-users")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve active desktop sessions: {str(e)}"
        )


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
    try:
        logger.info(f"Manual desktop session cleanup triggered | Timeout: {timeout_minutes} minutes")

        count = await DesktopSessionService.cleanup_stale_sessions(
            db=db, timeout_minutes=timeout_minutes
        )

        logger.info(f"Desktop session cleanup completed | Cleaned up {count} stale sessions")
        return {"cleaned_count": count, "message": f"Cleaned up {count} stale desktop sessions"}
    except Exception as e:
        track_database_error("desktop_sessions/cleanup")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cleanup stale desktop sessions: {str(e)}"
        )


@router.get("/stats")
async def get_desktop_session_stats(
    db: AsyncSession = Depends(get_session),
):
    """
    Get statistics for desktop sessions only.

    Returns:
        Dictionary with desktop session stats
    """
    try:
        from api.services.presence_service import presence_service

        try:
            redis_count = await presence_service.count_present_sessions()
            redis_user_ids = await presence_service.get_present_user_ids()
        except Exception:
            track_redis_error("desktop_sessions/stats")
            redis_count = 0
            redis_user_ids = []

        return {
            "totalSessions": redis_count,
            "desktopSessions": redis_count,
            "webSessions": 0,
            "mobileSessions": 0,
            "activeSessions": redis_count,
            "uniqueUsers": len(redis_user_ids),
            "avgSessionDuration": None,
        }
    except Exception as e:
        track_service_error("desktop_sessions/stats")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get desktop session stats: {str(e)}"
        )


@router.get("/config", response_model=dict)
async def get_desktop_session_config():
    """
    Get desktop session configuration. Used by Tauri app to sync heartbeat interval.

    Returns:
        Dictionary with heartbeat interval and Redis TTL configuration
    """
    from core.config import settings
    return {
        "heartbeatIntervalMs": settings.presence.heartbeat_interval_seconds * 1000,
        "heartbeatIntervalSeconds": settings.presence.heartbeat_interval_seconds,
        "redisTtlSeconds": settings.presence.ttl_seconds,
    }


@router.get("/presence/parity")
async def check_presence_parity(
    db: AsyncSession = Depends(get_session),
):
    """
    Compare DB-based active sessions vs Redis presence keys.
    Used to validate Redis dual-write parity during Phase 1 migration.
    """
    try:
        from api.services.presence_service import presence_service

        try:
            db_sessions = await DesktopSessionService.get_active_sessions(db=db)
            db_session_ids = {str(s.id) for s in db_sessions}
        except Exception:
            track_database_error("desktop_sessions/presence/parity")
            db_session_ids = set()

        try:
            redis_count = await presence_service.count_present_sessions()
        except Exception:
            track_redis_error("desktop_sessions/presence/parity")
            redis_count = 0

        return {
            "dbActiveSessions": len(db_session_ids),
            "redisPresenceKeys": redis_count,
            "delta": len(db_session_ids) - redis_count,
        }
    except Exception as e:
        track_service_error("desktop_sessions/presence/parity")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check presence parity: {str(e)}"
        )


@router.get("/presence/user/{user_id}")
async def check_user_presence(user_id: UUID):
    """
    Check if a specific user is currently present (has active Redis presence key).
    Returns instantly from Redis without hitting DB.
    """
    try:
        from api.services.presence_service import presence_service

        try:
            is_present = await presence_service.is_user_present(user_id)
            sessions = await presence_service.get_user_sessions(user_id)
        except Exception:
            track_redis_error("desktop_sessions/presence/user")
            is_present = False
            sessions = []

        return {
            "userId": str(user_id),
            "present": is_present,
            "activeSessions": len(sessions),
        }
    except Exception as e:
        track_service_error("desktop_sessions/presence/user")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check user presence: {str(e)}"
        )


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
    try:
        session = await DesktopSessionService.get_session_by_id(db=db, session_id=session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Desktop session not found")

        return session
    except HTTPException:
        # Re-raise HTTP exceptions without tracking as service error
        raise
    except Exception as e:
        track_database_error("desktop_sessions/{session_id}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve desktop session: {str(e)}"
        )


@router.post("/{session_id}/heartbeat", response_model=DesktopSessionRead)
async def update_desktop_heartbeat(
    session_id: UUID = Depends(validate_session_uuid),
    ip_address: Optional[str] = None,
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
        HTTPException: 410 if session has expired and cannot be reactivated
    """
    try:
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

        # EXPIRATION GUARD: Check if repository rejected the heartbeat due to expiration
        if session is None:
            logger.warning(
                f"Heartbeat rejected for session {session_id}: Session has expired and cannot be reactivated"
            )
            raise HTTPException(
                status_code=410,
                detail="Session has expired and cannot be reactivated. Please create a new session."
            )

        logger.debug(f"Desktop heartbeat updated for session {session_id}")
        return session
    except HTTPException:
        # Re-raise HTTP exceptions without tracking as service error
        raise
    except Exception as e:
        track_service_error("desktop_sessions/{session_id}/heartbeat")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update desktop heartbeat: {str(e)}"
        )


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
    try:
        session = await DesktopSessionService.disconnect_session(db=db, session_id=session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Desktop session not found")

        # If force disconnect requested, send notification to client via SignalR
        if force:
            try:
                from api.services.signalr_client import signalr_client
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
                track_service_error("desktop_sessions/{session_id}/disconnect")
                logger.warning(f"Failed to send force disconnect notification: {e}")

        logger.info(f"Desktop session {session_id} disconnected (force={force})")
        return {"message": "Desktop session disconnected successfully"}
    except HTTPException:
        # Re-raise HTTP exceptions without tracking as service error
        raise
    except Exception as e:
        track_service_error("desktop_sessions/{session_id}/disconnect")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to disconnect desktop session: {str(e)}"
        )


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
    try:
        sessions = await DesktopSessionService.get_user_sessions(
            db=db, user_id=user_id, active_only=active_only
        )

        return sessions
    except Exception as e:
        track_service_error("desktop_sessions/user/{user_id}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user desktop sessions: {str(e)}"
        )


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
    try:
        from datetime import datetime
        from api.services.management.client_version_service import ClientVersionService
        from api.services.signalr_client import signalr_client

        # Get the session by UUID using service
        session = await DesktopSessionService.get_session_by_id(db=db, session_id=session_id)

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
            track_service_error("desktop_sessions/{session_id}/push-update")
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
    except HTTPException:
        # Re-raise HTTP exceptions without tracking as service error
        raise
    except Exception as e:
        track_service_error("desktop_sessions/{session_id}/push-update")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to push update notification: {str(e)}"
        )


@router.get("/analytics/user-activity-heatmap", response_model=UserActivityHeatmapResponse)
async def get_user_activity_heatmap(
    days_back: int = 30,
    db: AsyncSession = Depends(get_session)
):
    """
    Get user activity heatmap data aggregated by hour and day of week.

    Returns activity patterns for desktop sessions over the specified time period,
    suitable for visualization with a heatmap chart. Data includes:
    - Activity count per hour (0-23) and day of week (0-6)
    - Total activity count
    - Date range analyzed
    - Activity breakdown by day of week

    Args:
        days_back: Number of days to look back for activity data (default: 30)
        db: Database session

    Returns:
        UserActivityHeatmapResponse with heatmap data and summary statistics
    """
    return await DesktopSessionService.get_user_activity_heatmap(
        db=db, days_back=days_back
    )
