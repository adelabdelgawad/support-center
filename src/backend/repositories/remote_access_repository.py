"""
Remote Access Repository - Data access layer for remote access sessions.

Provides durable session lifecycle tracking.
WebRTC signaling remains ephemeral (SignalR only).
"""
import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import RemoteAccessSession

logger = logging.getLogger(__name__)


class RemoteAccessRepository:
    """Repository for remote access session data access.

    Provides durable session lifecycle tracking:
    - Session creation/end with timestamps
    - Control mode toggling
    - Active session queries
    """

    @staticmethod
    async def create_session(
        db: AsyncSession,
        request_id: Optional[UUID],
        agent_id: UUID,
        requester_id: UUID,
    ) -> RemoteAccessSession:
        """Create a minimal remote access session mapping.

        Args:
            db: Database session
            request_id: Service request ID (optional for direct sessions)
            agent_id: Agent requesting access
            requester_id: User being helped

        Returns:
            Created session with relationships loaded
        """
        session = RemoteAccessSession(
            request_id=request_id,
            agent_id=agent_id,
            requester_id=requester_id,
        )
        db.add(session)
        await db.flush()
        await db.refresh(
            session,
            ["agent", "requester", "request"],
        )
        return session

    @staticmethod
    async def get_session_by_id(
        db: AsyncSession, session_id: UUID
    ) -> Optional[RemoteAccessSession]:
        """Get session by ID with relationships loaded."""
        result = await db.execute(
            select(RemoteAccessSession)
            .where(RemoteAccessSession.id == session_id)
            .options(
                selectinload(RemoteAccessSession.agent),
                selectinload(RemoteAccessSession.requester),
                selectinload(RemoteAccessSession.request),
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_sessions_by_request(
        db: AsyncSession,
        request_id: UUID,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[RemoteAccessSession], int]:
        """Get all sessions for a request with pagination.

        Returns session history (who accessed this request remotely).
        """
        # Count query
        count_result = await db.execute(
            select(func.count())
            .select_from(RemoteAccessSession)
            .where(RemoteAccessSession.request_id == request_id)
        )
        total = count_result.scalar()

        # Data query
        offset = (page - 1) * per_page
        result = await db.execute(
            select(RemoteAccessSession)
            .where(RemoteAccessSession.request_id == request_id)
            .options(
                selectinload(RemoteAccessSession.agent),
                selectinload(RemoteAccessSession.requester),
            )
            .order_by(desc(RemoteAccessSession.created_at))
            .offset(offset)
            .limit(per_page)
        )
        sessions = result.scalars().all()
        return list(sessions), total

    @staticmethod
    async def end_session(
        db: AsyncSession,
        session_id: UUID,
        end_reason: str,
    ) -> Optional[RemoteAccessSession]:
        """End a session by setting status and end time.

        Args:
            db: Database session
            session_id: Session to end
            end_reason: Why the session ended

        Returns:
            Updated session or None if not found
        """
        # Update the session
        await db.execute(
            update(RemoteAccessSession)
            .where(RemoteAccessSession.id == session_id)
            .values(
                status="ended",
                ended_at=datetime.utcnow(),
                end_reason=end_reason,
            )
        )
        await db.flush()

        # Return updated session
        return await RemoteAccessRepository.get_session_by_id(db, session_id)

    @staticmethod
    async def toggle_control(
        db: AsyncSession,
        session_id: UUID,
        enabled: bool,
    ) -> Optional[RemoteAccessSession]:
        """Toggle control mode for a session.

        Args:
            db: Database session
            session_id: Session to update
            enabled: Whether control is enabled

        Returns:
            Updated session or None if not found
        """
        await db.execute(
            update(RemoteAccessSession)
            .where(RemoteAccessSession.id == session_id)
            .values(control_enabled=enabled)
        )
        await db.flush()

        return await RemoteAccessRepository.get_session_by_id(db, session_id)

    @staticmethod
    async def get_active_session_for_user(
        db: AsyncSession,
        user_id: UUID,
    ) -> Optional[RemoteAccessSession]:
        """Get active session where user is requester (for recovery).

        Args:
            db: Database session
            user_id: Requester ID

        Returns:
            Active session or None
        """
        result = await db.execute(
            select(RemoteAccessSession)
            .where(
                RemoteAccessSession.requester_id == user_id,
                RemoteAccessSession.status == "active",
            )
            .options(
                selectinload(RemoteAccessSession.agent),
                selectinload(RemoteAccessSession.requester),
                selectinload(RemoteAccessSession.request),
            )
            .order_by(desc(RemoteAccessSession.created_at))
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_active_session_for_agent(
        db: AsyncSession,
        agent_id: UUID,
    ) -> Optional[RemoteAccessSession]:
        """Get active session where user is agent (for recovery).

        Args:
            db: Database session
            agent_id: Agent ID

        Returns:
            Active session or None
        """
        result = await db.execute(
            select(RemoteAccessSession)
            .where(
                RemoteAccessSession.agent_id == agent_id,
                RemoteAccessSession.status == "active",
            )
            .options(
                selectinload(RemoteAccessSession.agent),
                selectinload(RemoteAccessSession.requester),
                selectinload(RemoteAccessSession.request),
            )
            .order_by(desc(RemoteAccessSession.created_at))
            .limit(1)
        )
        return result.scalar_one_or_none()
