"""
Remote Access API endpoints for ephemeral screen sharing.

This module provides endpoints for managing remote desktop access sessions where
technicians can view and optionally control requester's desktop screen.

**Architecture:**
- Minimal API surface - session state is primarily managed via WebSocket/SignalR
- Database stores session record for ID mapping and history only
- Real-time state (status, control mode, screen data) flows through SignalR

**Session Lifecycle:**
1. Request: Agent requests access, sends notification to requester
2. Accept: Requester accepts, establishes screen sharing via SignalR
3. Control: Agent can toggle remote control (view only vs interactive)
4. End: Either party ends session, stores end time and reason

**Security Considerations:**
- Agent must be authenticated (require_technician)
- Agent must own the session to modify/control it
- Both agent and requester can end the session
- Requester must be online via SignalR to start session

**FUTURE WORK:** Session Binding for Remote Input Commands
- Current: Authorization based on agent_id only
- Future: Bind commands to specific DesktopSession.id to prevent cross-session injection
- This requires coordinated changes across backend, SignalR service, and Tauri app
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.database import get_session
from core.dependencies import get_current_user, require_technician
from db.models import RequestStatus, ServiceRequest, User
from api.schemas.remote_access import (
    RemoteAccessSessionList,
    RemoteAccessSessionRead,
    RemoteAccessSessionState,
    EndSessionRequest,
    ToggleControlRequest,
)
from api.services.remote_access_service import RemoteAccessService
from crud.remote_access_crud import RemoteAccessCRUD

router = APIRouter()


@router.post("/requests/{request_id}/remote-access/request", status_code=201)
async def request_remote_access(
    request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Agent/technician requests remote access to help with a service request.

    **Session creation flow:**
    1. Validates request exists and is not closed/resolved
    2. Creates minimal session record (for ID mapping and history)
    3. Sends WebSocket notification to requester via SignalR
    4. All real-time state (status, mode, screen data) flows through WebSocket

    **EPHEMERAL DESIGN:**
    - Database stores minimal: IDs, timestamps, agent/requester mapping
    - Actual session state lives in WebSocket layer (SignalR)
    - This reduces DB writes and enables real-time updates

    **Permission:** Technicians only (require_technician)

    **Args:**
        request_id: Service request UUID to start remote access for

    **Returns:**
        Created session with:
        - sessionId: Session UUID
        - agentId: Agent UUID who requested access
        - requesterId: Requester UUID
        - requestId: Request UUID (or None for direct sessions)
        - status: "pending" (waiting for requester to accept)
        - controlEnabled: false (starts in view-only mode)
        - serverTime: Current server timestamp

    **Raises:**
        HTTPException 404: Request not found
        HTTPException 400: Request is closed/resolved

    **Notes:**
        - Auto-approves if no open request exists for the requester
        - Broadcast failures are logged but don't prevent session creation
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

    **Returns minimal session mapping:**
    - Session IDs (session, agent, requester, request)
    - Creation timestamp
    - Status and control mode (from database)

    **Note:** Real-time state should be fetched from SignalR, not this endpoint.

    **Permission:** Authenticated users

    **Returns:**
        Session details with ID mapping

    **Raises:**
        HTTPException 404: Session not found
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

    **Reconnection flow:**
    1. Validates session exists and is active
    2. Verifies agent owns the session (security check)
    3. Sends reconnection notification to requester via SignalR
    4. Returns session details for establishing new WebSocket connection

    **Use when:** Agent needs to reconnect after disconnection or network interruption.

    **Permission:** Technicians only (require_technician)
    **Security:** Only the agent who created the session can resume it

    **Args:**
        session_id: Session UUID to resume

    **Returns:**
        Session details with server timestamp

    **Raises:**
        HTTPException 404: Session not found
        HTTPException 403: Agent doesn't own this session (security mismatch)
        HTTPException 400: Session is not active
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
    Get all remote access sessions for a service request (paginated history).

    **Session history** shows who accessed this request remotely and when.
    Useful for auditing and troubleshooting.

    **Query Parameters:**
    - page: Page number (1-indexed, default: 1)
    - per_page: Items per page (default: 20, max: 100)

    **Permission:** Technicians only (require_technician)

    **Returns:**
        Paginated list of sessions with pagination headers

    **Response Headers:**
        - X-Total-Count: Total number of sessions
        - X-Page: Current page number
        - X-Per-Page: Items per page
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
    Start remote access directly by user ID (from Active Sessions management).

    **Direct session initiation:**
    - AUTO-TERMINATES any existing active session for the requester
    - Checks if requester is online via SignalR first
    - Finds user's most recent open request and starts remote access for it
    - If user has no open requests, creates a direct session without a request

    **Used when:** Initiating remote access from the Active Sessions management page
    rather than from a specific ticket.

    **Permission:** Technicians only (require_technician)

    **Args:**
        user_id: Requester UUID to start session with

    **Returns:**
        Created session with server timestamp

    **Raises:**
        HTTPException 404: User not found
        HTTPException 400: User is not online (SignalR check failed)

    **Notes:**
        - Automatically terminates requester's existing active session before creating new one
        - Broadcast failures are logged but don't prevent session creation
    """
    import logging
    from datetime import datetime, timezone

    logger = logging.getLogger(__name__)

    logger.info(f"[Backend] POST /remote-access/start-by-user/{user_id}")
    logger.info(f"[Backend] Agent: {current_user.username} (ID: {current_user.id})")

    # Check if user is online via SignalR
    from api.services.signalr_client import signalr_client

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
            not ServiceRequest.is_deleted,
            not RequestStatus.count_as_solved,
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

        # Check if user is blocked
        if user.is_blocked:
            raise HTTPException(
                status_code=403,
                detail=user.block_message or "User account is blocked"
            )

        # Auto-terminate existing session before creating
        terminated_session = await RemoteAccessService.terminate_active_session_for_requester(
            db=db,
            requester_id=user_id,
        )

        if terminated_session:
            logger.info(
                f"Auto-terminated session {terminated_session.id} "
                f"(old agent: {terminated_session.agent_id})"
            )

        # Create session without request
        session = await RemoteAccessCRUD.create_session(
            db=db,
            request_id=None,  # No request
            agent_id=current_user.id,
            requester_id=user_id,
        )

        await db.commit()  # CRITICAL: Commit transaction

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

    **Session termination:**
    1. Validates session exists and user is a participant (agent or requester)
    2. Persists end time and reason to database (durable state)
    3. Broadcasts session end via SignalR to other participant

    **DURABLE:** Persists end time and reason to database for audit/history.

    **Permission:** Either agent or requester can end the session

    **Args:**
        session_id: Session UUID to end
        body: { "reason": "Reason for ending session" }

    **Returns:**
        Updated session with ended_at and end_reason

    **Raises:**
        HTTPException 403: User is not a participant in the session
        HTTPException 404: Session not found
        HTTPException 400: Session is already ended

    **Notes:**
        - Broadcast failures are logged but don't prevent session end
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
    Toggle remote control mode (view-only vs interactive).

    **Control mode switching:**
    1. Validates session exists and agent owns it
    2. Persists control_enabled flag to database (durable state)
    3. Broadcasts mode change via SignalR to requester

    **DURABLE:** Persists control state to database for audit/history.

    **Modes:**
    - enabled=false: View-only (agent can only see screen)
    - enabled=true: Interactive (agent can control mouse/keyboard)

    **Permission:** Only the agent can toggle control mode

    **Args:**
        session_id: Session UUID
        body: { "enabled": true/false }

    **Returns:**
        Updated session with new control_enabled state

    **Raises:**
        HTTPException 403: User is not the agent
        HTTPException 404: Session not found
        HTTPException 400: Session is ended

    **Notes:**
        - Broadcast failures are logged but don't prevent mode change
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
    Get session state for recovery after reconnection.

    **RECOVERY ENDPOINT:** Returns current durable state so client can resume
    after SignalR reconnection or network interruption.

    **State includes:**
    - Session status (pending, active, ended)
    - Control mode (view-only vs interactive)
    - Participant IDs
    - Timestamps
    - End reason (if ended)

    **Permission:** User must be a participant (agent or requester)

    **Returns:**
        Session state with all durable fields

    **Raises:**
        HTTPException 403: User is not a participant
        HTTPException 404: Session not found

    **Use Case:** SignalR client calls this after reconnecting to restore session state
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

    **RECOVERY ENDPOINT:** Checks if user has an active session as either
    requester or agent, and returns state for reconnection.

    Used by SignalR client after reconnection to restore session state.

    **Search order:**
    1. Check if user is a requester with active session
    2. If not, check if user is an agent with active session

    **Returns:**
        Active session state (first found)

    **Raises:**
        HTTPException 404: No active session found for this user

    **Use Case:** SignalR client calls this after reconnecting to restore session
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


@router.post("/remote-access/{session_id}/heartbeat")
async def send_heartbeat(
    session_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update session heartbeat timestamp.

    **HEARTBEAT ENDPOINT:** Clients call this periodically (every 15s) to indicate
    the session is still alive. Used for orphan detection and cleanup.

    **Orphan detection:**
    - Sessions without recent heartbeats are considered abandoned
    - System may auto-end sessions that haven't received heartbeat
    - Helps detect crashed clients or network failures

    **Permission:** User must be a participant (agent or requester)

    **Args:**
        session_id: Session UUID

    **Returns:**
        Heartbeat confirmation with last_heartbeat timestamp

    **Raises:**
        HTTPException 404: Session not found or not active
        HTTPException 403: User is not a participant
        HTTPException 400: Session is not active

    **Notes:**
        - Clients should send heartbeat every 15 seconds
        - Server tracks last_heartbeat for orphan detection
    """
    import logging

    logger = logging.getLogger(__name__)

    # Get session to verify user is participant
    session = await RemoteAccessCRUD.get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify user is participant
    if session.agent_id != current_user.id and session.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Verify session is active
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    # Update heartbeat
    updated_session = await RemoteAccessCRUD.update_heartbeat(db, session_id)
    await db.commit()

    if not updated_session:
        raise HTTPException(status_code=404, detail="Session not found or not active")

    logger.debug(f"[Backend] Heartbeat updated for session {session_id}")

    return {"status": "ok", "last_heartbeat": updated_session.last_heartbeat}
