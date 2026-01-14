"""
Remote Access Service - Business logic for durable remote screen sharing.

Session lifecycle is DURABLE (FastAPI + DB):
- Session start/end with timestamps
- Control mode state
- Recovery endpoint support

WebRTC signaling is EPHEMERAL (SignalR only):
- ICE candidates
- SDP offers/answers
- Real-time connection negotiation

============================================================================
SECURITY NOTICE (Finding #19 - Remote Input Session Binding)
============================================================================

FUTURE WORK: Bind Remote Sessions to Desktop Sessions

Currently, remote access sessions track:
- agent_id: Who is providing support
- requester_id: Who is receiving support
- request_id: Which service request this is for (optional)

MISSING BINDING (TODO):
- desktop_session_id: Which specific desktop session is being controlled

WHY THIS MATTERS:
If a requester has multiple active desktop sessions (e.g., logged in on
two computers), the current implementation cannot distinguish which one
the agent is connected to. Remote input commands could theoretically
affect the wrong session.

MITIGATION PATH:
1. Add desktop_session_id column to RemoteAccessSession model
2. During request_remote_access(), capture the requester's active desktop
   session ID and store it
3. Before executing any remote input, verify the bound desktop session
   is still active and matches the current connection
4. On reconnect, verify desktop session hasn't changed

CURRENT ACCEPTABLE STATE:
- Single desktop session per user is the common case
- Agent explicitly selects which user to support
- Requester must approve remote access
============================================================================
"""
import logging
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    critical_database_operation,
    log_database_operation,
    transactional_database_operation,
)
from models import RemoteAccessSession, User
from repositories.remote_access_repository import RemoteAccessRepository

logger = logging.getLogger(__name__)


class RemoteAccessService:
    """Service for managing durable remote access sessions."""

    @staticmethod
    @log_database_operation("request_remote_access")
    @transactional_database_operation
    @critical_database_operation()
    async def request_remote_access(
        db: AsyncSession,
        request_id: UUID,
        agent_id: UUID,
        agent: User,
    ) -> RemoteAccessSession:
        """
        Agent requests remote access to requester's screen.

        Creates minimal session record and sends WebSocket notification.
        No status management - session is ephemeral.

        Args:
            db: Database session
            request_id: Service request ID
            agent_id: Agent requesting access
            agent: Agent user object

        Returns:
            RemoteAccessSession: Created session mapping

        Raises:
            ValueError: If service request not found or closed
        """
        # Get the service request
        from repositories.service_request_repository import ServiceRequestRepository

        request = await ServiceRequestRepository.find_by_id(db, request_id)
        if not request:
            raise ValueError(f"Service request {request_id} not found")

        # Check if request is closed/solved
        if request.status and request.status.count_as_solved:
            raise ValueError("Cannot start remote access for a closed/resolved request")

        # Check if requester is online via SignalR
        from services.signalr_client import signalr_client

        requester_id_str = str(request.requester_id)
        is_online = await signalr_client.is_user_online(requester_id_str)

        if not is_online:
            logger.warning(
                f"Cannot start remote access - requester {requester_id_str} is not online"
            )
            raise ValueError("Cannot start remote access - requester is not online")

        logger.info(f"Requester {requester_id_str} is online via SignalR")

        # Create minimal session record (just for ID mapping and history)
        session = await RemoteAccessRepository.create_session(
            db=db,
            request_id=request_id,
            agent_id=agent_id,
            requester_id=request.requester_id,
        )

        logger.info(
            f"Created remote access session {session.id} - "
            f"Agent: {agent.username}, Request: {request_id}"
        )

        # AUDIT LOG: remote_session_started (FR-011)
        # Log structured audit event for session start with all required fields
        logger.info(
            "AUDIT: remote_session_started",
            extra={
                "event": "remote_session_started",
                "session_id": str(session.id),
                "agent_id": str(agent_id),
                "agent_username": agent.username,
                "requester_id": str(request.requester_id),
                "request_id": str(request_id),
                "timestamp": session.created_at.isoformat() if session.created_at else None,
            },
        )

        # Notify requester via SignalR
        try:
            await signalr_client.notify_remote_session_auto_start(
                requester_id=str(request.requester_id),
                session={
                    "sessionId": str(session.id),
                    "agentId": str(agent_id),
                    "agentName": agent.full_name or agent.username,
                    "requestId": str(request_id),
                    "requestTitle": request.title,
                    "mode": "view",
                    "autoApproved": True,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to notify remote session via SignalR: {e}")

        return session

    @staticmethod
    @log_database_operation("resume_session")
    @critical_database_operation()
    async def resume_session(
        db: AsyncSession,
        session_id: UUID,
        agent_id: UUID,
        agent: User,
    ) -> RemoteAccessSession:
        """
        Resume/reconnect to an existing remote access session.

        Use when agent needs to reconnect after disconnection.

        Args:
            db: Database session
            session_id: Session to resume
            agent_id: Agent requesting reconnection
            agent: Agent user object

        Returns:
            RemoteAccessSession: Existing session

        Raises:
            ValueError: If session not found or agent mismatch
        """
        # Verify session exists
        session = await RemoteAccessRepository.get_session_by_id(db, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify agent matches
        if session.agent_id != agent_id:
            raise ValueError("Agent mismatch - cannot resume another agent's session")

        logger.info(
            f"Resuming remote access session {session_id} - Agent: {agent.username}"
        )

        # Notify requester via SignalR
        try:
            from services.signalr_client import signalr_client

            await signalr_client.notify_remote_session_reconnect(
                requester_id=str(session.requester_id),
                session={
                    "sessionId": str(session.id),
                    "agentId": str(agent_id),
                    "agentName": agent.full_name or agent.username,
                    "requestId": str(session.request_id),
                    "requestTitle": session.request.title,
                    "mode": "view",
                    "isReconnection": True,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to notify session reconnect via SignalR: {e}")

        return session

    @staticmethod
    async def get_session_by_id(
        db: AsyncSession, session_id: UUID
    ) -> RemoteAccessSession:
        """Get session by ID."""
        return await RemoteAccessRepository.get_session_by_id(db, session_id)

    @staticmethod
    async def get_sessions_by_request(
        db: AsyncSession,
        request_id: UUID,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[RemoteAccessSession], int]:
        """Get all sessions for a request (history view)."""
        return await RemoteAccessRepository.get_sessions_by_request(
            db, request_id, page, per_page
        )

    @staticmethod
    @log_database_operation("end_session")
    @transactional_database_operation
    @critical_database_operation()
    async def end_session(
        db: AsyncSession,
        session_id: UUID,
        end_reason: str,
        user_id: UUID,
    ) -> RemoteAccessSession:
        """
        End a remote access session.

        Persists end time and reason to database, then broadcasts via SignalR.

        Args:
            db: Database session
            session_id: Session to end
            end_reason: Why session ended
            user_id: User ending the session (for authorization)

        Returns:
            Updated session

        Raises:
            ValueError: If session not found or unauthorized
        """
        # Verify session exists
        session = await RemoteAccessRepository.get_session_by_id(db, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify user is participant
        if session.agent_id != user_id and session.requester_id != user_id:
            raise ValueError("Not authorized to end this session")

        # Check if already ended
        if session.status == "ended":
            raise ValueError("Session is already ended")

        # End the session (DB persistence FIRST)
        session = await RemoteAccessRepository.end_session(db, session_id, end_reason)

        logger.info(
            f"Ended remote access session {session_id} - reason: {end_reason}"
        )

        # AUDIT LOG: remote_session_ended (FR-011)
        # Log structured audit event for session end with all required fields
        # Calculate duration if both timestamps are available
        duration_seconds = None
        if session.created_at and session.ended_at:
            duration_seconds = (session.ended_at - session.created_at).total_seconds()

        logger.info(
            "AUDIT: remote_session_ended",
            extra={
                "event": "remote_session_ended",
                "session_id": str(session_id),
                "agent_id": str(session.agent_id),
                "agent_username": None,  # Would need to join User table to get this
                "requester_id": str(session.requester_id),
                "end_reason": end_reason,
                "duration_seconds": duration_seconds,
                "timestamp": session.ended_at.isoformat() if session.ended_at else None,
            },
        )

        # Broadcast via SignalR AFTER DB commit (handled by transactional decorator)
        try:
            from services.signalr_client import signalr_client

            await signalr_client.notify_remote_session_ended(
                session_id=str(session_id),
                agent_id=str(session.agent_id),
                requester_id=str(session.requester_id),
                reason=end_reason,
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast session end via SignalR: {e}")

        return session

    @staticmethod
    @log_database_operation("toggle_control")
    @transactional_database_operation
    @critical_database_operation()
    async def toggle_control(
        db: AsyncSession,
        session_id: UUID,
        enabled: bool,
        agent_id: UUID,
    ) -> RemoteAccessSession:
        """
        Toggle remote control mode.

        Persists control state to database, then broadcasts via SignalR.

        Args:
            db: Database session
            session_id: Session to update
            enabled: Whether control is enabled
            agent_id: Agent toggling control (for authorization)

        Returns:
            Updated session

        Raises:
            ValueError: If session not found or unauthorized
        """
        # Verify session exists
        session = await RemoteAccessRepository.get_session_by_id(db, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Only agent can toggle control
        if session.agent_id != agent_id:
            raise ValueError("Only the agent can toggle control mode")

        # Check if session is active
        if session.status != "active":
            raise ValueError("Cannot toggle control on ended session")

        # Toggle control (DB persistence FIRST)
        session = await RemoteAccessRepository.toggle_control(db, session_id, enabled)

        logger.info(
            f"Toggled control mode for session {session_id} - enabled: {enabled}"
        )

        # Broadcast via SignalR AFTER DB commit
        try:
            from services.signalr_client import signalr_client

            await signalr_client.notify_control_mode_changed(
                session_id=str(session_id),
                requester_id=str(session.requester_id),
                enabled=enabled,
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast control toggle via SignalR: {e}")

        return session

    @staticmethod
    async def get_session_state(
        db: AsyncSession, session_id: UUID
    ) -> Optional[RemoteAccessSession]:
        """
        Get session state for recovery.

        Returns current durable state so client can resume after reconnect.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Session with current state or None
        """
        return await RemoteAccessRepository.get_session_by_id(db, session_id)

    @staticmethod
    async def get_active_session_for_user(
        db: AsyncSession, user_id: UUID
    ) -> Optional[RemoteAccessSession]:
        """Get active session where user is requester (for recovery)."""
        return await RemoteAccessRepository.get_active_session_for_user(db, user_id)

    @staticmethod
    async def get_active_session_for_agent(
        db: AsyncSession, agent_id: UUID
    ) -> Optional[RemoteAccessSession]:
        """Get active session where user is agent (for recovery)."""
        return await RemoteAccessRepository.get_active_session_for_agent(db, agent_id)
