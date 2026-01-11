"""
Remote Access API endpoints for ephemeral screen sharing.

Minimal API surface - session state is managed via WebSocket, not database.

============================================================================
SECURITY NOTICE (Finding #19 - Remote Input Session Binding)
============================================================================

FUTURE WORK: Session Binding for Remote Input Commands

This module handles remote access sessions where an agent can view/control
a requester's desktop. Currently, command authorization is based solely on
agent_id verification against the session record.

REQUIRED FUTURE IMPROVEMENTS:
1. **Session Binding**: Bind remote input commands to a specific desktop
   session (DesktopSession.id) - not just the user. This prevents input
   injection into the wrong session if user has multiple sessions.

2. **Reconnect Handling**: When SignalR reconnects, verify the desktop
   session is still the same one that was originally authorized. A user
   may have logged out and back in with a new session.

3. **Session State Verification**: Before executing remote input commands,
   verify:
   - DesktopSession is still active (is_active=True)
   - DesktopSession last_heartbeat is recent (within timeout threshold)
   - Remote session's requester_id matches DesktopSession's user_id

CURRENT STATE (Acceptable for MVP):
- Agent must be authenticated (require_technician)
- Agent must own the remote session (agent_id check)
- Requester must be online (SignalR check)
- Session must be active (status="active")

DO NOT implement session binding inline - requires coordinated changes
across backend, SignalR service, and Tauri app.
============================================================================
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_session
from core.dependencies import get_current_user, require_technician
from models.database_models import RequestStatus, ServiceRequest, User
from schemas.remote_access import (
    RemoteAccessSessionList,
    RemoteAccessSessionRead,
    RemoteAccessSessionState,
    EndSessionRequest,
    ToggleControlRequest,
)
from services.remote_access_service import RemoteAccessService

router = APIRouter()


@router.post("/requests/{request_id}/remote-access/request", status_code=201)
async def request_remote_access(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Agent/technician requests remote access to help with a service request.

    EPHEMERAL FLOW:
    - Creates minimal session record (just for ID mapping and history)
    - Sends WebSocket notification to requester
    - All session state (status, control mode, etc.) is WebSocket-only

    Returns the created session.

    Raises:
        404: If request not found
        400: If request is closed/resolved
    """
    import logging
    from datetime import datetime, timezone

    logger = logging.getLogger(__name__)

    logger.info(f"[Backend] POST /requests/{request_id}/remote-access/request")
    logger.info(f"[Backend] Agent: {current_user.username} (ID: {current_user.id})")

    try:
        session = await RemoteAccessService.request_remote_access(
            db=db,
            request_id=request_id,
            agent_id=current_user.id,
            agent=current_user,
        )

        # Convert to dict and add server timestamp
        session_dict = RemoteAccessSessionRead.model_validate(session).model_dump(by_alias=True)
        server_now = datetime.now(timezone.utc).replace(tzinfo=None)
        session_dict['serverTime'] = server_now.isoformat() + 'Z'

        logger.info(f"[Backend] ✅ Session created: {session.id}")
        return session_dict

    except ValueError as e:
        logger.error(f"[Backend] ❌ ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Backend] ❌ Unexpected error: {str(e)}")
        logger.exception(e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/remote-access/{session_id}", response_model=RemoteAccessSessionRead)
async def get_remote_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get remote access session details.

    Returns minimal session mapping (IDs and timestamp).

    Raises:
        404: If session not found
    """
    session = await RemoteAccessService.get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/remote-access/{session_id}/resume", response_model=RemoteAccessSessionRead)
async def resume_remote_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Resume/reconnect to an existing remote access session.

    Use when agent needs to reconnect after disconnection.

    Requirements:
    - Session must exist
    - Only the agent who created the session can resume it

    Sends WebSocket notification to requester to reconnect.

    Raises:
        403: If agent doesn't own this session
        404: If session not found
    """
    import logging
    from datetime import datetime, timezone

    logger = logging.getLogger(__name__)

    logger.info(f"[Backend] POST /remote-access/{session_id}/resume")
    logger.info(f"[Backend] Agent: {current_user.username} (ID: {current_user.id})")

    try:
        session = await RemoteAccessService.resume_session(
            db=db,
            session_id=session_id,
            agent_id=current_user.id,
            agent=current_user,
        )

        # Convert to dict and add server timestamp
        session_dict = RemoteAccessSessionRead.model_validate(session).model_dump(by_alias=True)
        server_now = datetime.now(timezone.utc).replace(tzinfo=None)
        session_dict['serverTime'] = server_now.isoformat() + 'Z'

        logger.info(f"[Backend] ✅ Session resumed: {session_id}")
        return session_dict

    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        elif "mismatch" in error_msg:
            raise HTTPException(status_code=403, detail=error_msg)
        else:
            raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logger.error(f"[Backend] ❌ Error resuming session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/requests/{request_id}/remote-access/history", response_model=RemoteAccessSessionList)
async def get_request_remote_sessions(
    request_id: UUID,
    response: Response,
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get all remote access sessions for a service request.

    Returns session history with pagination (who accessed this request remotely).

    Query Parameters:
    - page: Page number (default: 1)
    - per_page: Items per page (default: 20, max: 100)

    Returns list of sessions with pagination headers.
    """
    sessions, total = await RemoteAccessService.get_sessions_by_request(
        db=db,
        request_id=request_id,
        page=page,
        per_page=per_page,
    )

    # Add pagination headers
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(per_page)

    return RemoteAccessSessionList(
        items=sessions,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/remote-access/start-by-user/{user_id}", status_code=201)
async def start_remote_access_by_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Start remote access directly by user ID (from Active Sessions).

    Used when initiating remote access from the Active Sessions management page.
    Finds the user's most recent open request and starts remote access for it.

    If user has no open requests, creates a direct session without a request.

    Returns the created session with a URL to open in a new tab.

    Raises:
        404: If user not found
        400: If user is not online
    """
    import logging
    from datetime import datetime, timezone

    logger = logging.getLogger(__name__)

    logger.info(f"[Backend] POST /remote-access/start-by-user/{user_id}")
    logger.info(f"[Backend] Agent: {current_user.username} (ID: {current_user.id})")

    # Check if user is online via SignalR
    from services.signalr_client import signalr_client

    user_id_str = str(user_id)
    is_online = await signalr_client.is_user_online(user_id_str)

    if not is_online:
        logger.warning(f"Cannot start remote access - user {user_id_str} is not online")
        raise HTTPException(
            status_code=400,
            detail="Cannot start remote access - user is not online"
        )

    logger.info(f"User {user_id_str} is online via SignalR")

    # Find user's most recent open (unsolved) request
    stmt = (
        select(ServiceRequest)
        .join(RequestStatus, ServiceRequest.status_id == RequestStatus.id)
        .where(
            ServiceRequest.requester_id == user_id,
            ServiceRequest.is_deleted == False,
            RequestStatus.count_as_solved == False,
        )
        .options(
            selectinload(ServiceRequest.requester),
            selectinload(ServiceRequest.status),
        )
        .order_by(ServiceRequest.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    request = result.scalar_one_or_none()

    if not request:
        # User has no open requests - start direct session
        logger.info(f"User {user_id_str} has no open requests, starting direct session")

        # Get user info for notification
        user_result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Create session without request
        from repositories.remote_access_repository import RemoteAccessRepository

        session = await RemoteAccessRepository.create_session(
            db=db,
            request_id=None,  # No request
            agent_id=current_user.id,
            requester_id=user_id,
        )

        logger.info(f"Created direct remote access session {session.id}")

        # Notify requester via SignalR
        try:
            await signalr_client.notify_remote_session_auto_start(
                requester_id=str(user_id),
                session={
                    "sessionId": str(session.id),
                    "agentId": str(current_user.id),
                    "agentName": current_user.full_name or current_user.username,
                    "requestId": None,
                    "requestTitle": "Direct Remote Session",
                    "mode": "view",
                    "autoApproved": True,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to notify via SignalR: {e}")

        session_dict = RemoteAccessSessionRead.model_validate(session).model_dump(by_alias=True)
        server_now = datetime.now(timezone.utc).replace(tzinfo=None)
        session_dict['serverTime'] = server_now.isoformat() + 'Z'

        logger.info(f"[Backend] ✅ Direct session created: {session.id}")
        return session_dict

    # User has an open request - use it
    logger.info(f"Found open request {request.id} for user {user_id_str}")

    try:
        session = await RemoteAccessService.request_remote_access(
            db=db,
            request_id=request.id,
            agent_id=current_user.id,
            agent=current_user,
        )

        session_dict = RemoteAccessSessionRead.model_validate(session).model_dump(by_alias=True)
        server_now = datetime.now(timezone.utc).replace(tzinfo=None)
        session_dict['serverTime'] = server_now.isoformat() + 'Z'

        logger.info(f"[Backend] ✅ Session created: {session.id}")
        return session_dict

    except ValueError as e:
        logger.error(f"[Backend] ❌ ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Backend] ❌ Unexpected error: {str(e)}")
        logger.exception(e)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SESSION LIFECYCLE ENDPOINTS (DURABLE STATE)
# =============================================================================


@router.post("/remote-access/{session_id}/end", response_model=RemoteAccessSessionRead)
async def end_remote_session(
    session_id: UUID,
    body: EndSessionRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    End a remote access session.

    DURABLE: Persists end time and reason to database, then broadcasts via SignalR.

    Both agent and requester can end the session.

    Raises:
        403: If user is not a participant in the session
        404: If session not found
        400: If session is already ended
    """
    import logging

    logger = logging.getLogger(__name__)

    logger.info(f"[Backend] POST /remote-access/{session_id}/end")
    logger.info(f"[Backend] User: {current_user.username}, Reason: {body.reason}")

    try:
        session = await RemoteAccessService.end_session(
            db=db,
            session_id=session_id,
            end_reason=body.reason,
            user_id=current_user.id,
        )

        logger.info(f"[Backend] ✅ Session ended: {session_id}")
        return session

    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        elif "authorized" in error_msg:
            raise HTTPException(status_code=403, detail=error_msg)
        else:
            raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logger.error(f"[Backend] ❌ Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remote-access/{session_id}/control", response_model=RemoteAccessSessionRead)
async def toggle_control_mode(
    session_id: UUID,
    body: ToggleControlRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Toggle remote control mode.

    DURABLE: Persists control state to database, then broadcasts via SignalR.

    Only the agent can toggle control mode.

    Raises:
        403: If user is not the agent
        404: If session not found
        400: If session is ended
    """
    import logging

    logger = logging.getLogger(__name__)

    logger.info(f"[Backend] POST /remote-access/{session_id}/control")
    logger.info(f"[Backend] Agent: {current_user.username}, Enabled: {body.enabled}")

    try:
        session = await RemoteAccessService.toggle_control(
            db=db,
            session_id=session_id,
            enabled=body.enabled,
            agent_id=current_user.id,
        )

        logger.info(f"[Backend] ✅ Control toggled: {session_id} -> {body.enabled}")
        return session

    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        elif "agent" in error_msg.lower():
            raise HTTPException(status_code=403, detail=error_msg)
        else:
            raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logger.error(f"[Backend] ❌ Error toggling control: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/remote-access/{session_id}/state", response_model=RemoteAccessSessionState)
async def get_session_state(
    session_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get session state for recovery.

    RECOVERY ENDPOINT: Returns current durable state so client can resume
    after SignalR reconnection.

    Raises:
        403: If user is not a participant
        404: If session not found
    """
    session = await RemoteAccessService.get_session_state(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify user is participant
    if session.agent_id != current_user.id and session.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this session")

    return RemoteAccessSessionState(
        session_id=session.id,
        status=session.status,
        control_enabled=session.control_enabled,
        agent_id=session.agent_id,
        requester_id=session.requester_id,
        request_id=session.request_id,
        created_at=session.created_at,
        ended_at=session.ended_at,
        end_reason=session.end_reason,
        is_active=session.status == "active",
    )


@router.get("/remote-access/active", response_model=RemoteAccessSessionState)
async def get_active_session(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get active session for current user (for recovery on reconnect).

    RECOVERY ENDPOINT: Checks if user has an active session as either
    requester or agent, and returns state for reconnection.

    Returns 404 if no active session exists.
    """
    # First check if user is a requester
    session = await RemoteAccessService.get_active_session_for_user(db, current_user.id)

    # If not, check if user is an agent
    if not session:
        session = await RemoteAccessService.get_active_session_for_agent(db, current_user.id)

    if not session:
        raise HTTPException(status_code=404, detail="No active session found")

    return RemoteAccessSessionState(
        session_id=session.id,
        status=session.status,
        control_enabled=session.control_enabled,
        agent_id=session.agent_id,
        requester_id=session.requester_id,
        request_id=session.request_id,
        created_at=session.created_at,
        ended_at=session.ended_at,
        end_reason=session.end_reason,
        is_active=session.status == "active",
    )
