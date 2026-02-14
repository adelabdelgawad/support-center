"""
Web Session repository for managing WebSession model.

This repository handles all database operations for web session management.
"""

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import WebSession
from repositories.base_repository import BaseRepository


class WebSessionRepository(BaseRepository[WebSession]):
    """Repository for WebSession operations."""

    model = WebSession

    @classmethod
    async def find_by_user_and_fingerprint(
        cls,
        db: AsyncSession,
        user_id: UUID,
        device_fingerprint: str,
    ) -> Optional[WebSession]:
        """
        Find active session by user ID and device fingerprint.

        Args:
            db: Database session
            user_id: User UUID
            device_fingerprint: Device fingerprint

        Returns:
            WebSession or None
        """
        stmt = (
            select(WebSession)
            .where(WebSession.user_id == user_id)
            .where(WebSession.is_active)
            .where(WebSession.device_fingerprint == device_fingerprint)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_active_by_user(
        cls, db: AsyncSession, user_id: UUID
    ) -> List[WebSession]:
        """
        Find all active sessions for a user.

        Args:
            db: Database session
            user_id: User UUID

        Returns:
            List of active WebSession
        """
        stmt = (
            select(WebSession)
            .where(WebSession.user_id == user_id)
            .where(WebSession.is_active)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_by_user(
        cls, db: AsyncSession, user_id: UUID, active_only: bool = True
    ) -> List[WebSession]:
        """
        Get all web sessions for a user.

        Args:
            db: Database session
            user_id: User ID
            active_only: Only return active sessions

        Returns:
            List of WebSession
        """
        stmt = select(WebSession).where(WebSession.user_id == user_id)

        if active_only:
            stmt = stmt.where(WebSession.is_active)

        stmt = stmt.order_by(WebSession.last_heartbeat.desc())

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_all_active(cls, db: AsyncSession) -> List[WebSession]:
        """
        Get all active web sessions across all users.

        Args:
            db: Database session

        Returns:
            List of active WebSession
        """
        stmt = (
            select(WebSession)
            .where(WebSession.is_active)
            .order_by(WebSession.last_heartbeat.desc())
        )

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_all_active_with_users(cls, db: AsyncSession) -> List[WebSession]:
        """
        Get all active web sessions with user information eagerly loaded.

        Args:
            db: Database session

        Returns:
            List of active WebSession with user relationship loaded
        """
        stmt = (
            select(WebSession)
            .options(selectinload(WebSession.user))
            .where(WebSession.is_active)
            .order_by(WebSession.last_heartbeat.desc())
        )

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_stale_sessions(
        cls, db: AsyncSession, timeout_minutes: int = 60
    ) -> List[WebSession]:
        """
        Find stale web sessions (no heartbeat for > timeout_minutes).

        Args:
            db: Database session
            timeout_minutes: Minutes before considering session stale

        Returns:
            List of stale WebSession
        """
        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        stmt = (
            select(WebSession)
            .where(WebSession.is_active)
            .where(WebSession.last_heartbeat < cutoff_time)
        )

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_by_session_and_user(
        cls, db: AsyncSession, session_id: int, user_id: UUID
    ) -> Optional[WebSession]:
        """
        Find session by ID and user ID (for verification).

        Args:
            db: Database session
            session_id: Session ID
            user_id: User ID

        Returns:
            WebSession or None
        """
        stmt = select(WebSession).where(
            WebSession.id == session_id, WebSession.user_id == user_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def update_heartbeat(
        cls,
        db: AsyncSession,
        session_id: int,
        ip_address: Optional[str] = None,
    ) -> Optional[WebSession]:
        """
        Update web session heartbeat.

        Args:
            db: Database session
            session_id: Session ID
            ip_address: Optional IP address update

        Returns:
            Updated session or None
        """
        session = await cls.find_by_id(db, session_id)

        if not session:
            return None

        session.last_heartbeat = datetime.utcnow()
        session.is_active = True

        if ip_address:
            session.ip_address = ip_address

        await db.commit()
        await db.refresh(session)

        return session

    @classmethod
    async def deactivate_session(
        cls, db: AsyncSession, session_id: int
    ) -> Optional[WebSession]:
        """
        Mark a web session as disconnected.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Updated session or None
        """
        session = await cls.find_by_id(db, session_id)

        if not session:
            return None

        session.is_active = False

        await db.commit()
        await db.refresh(session)

        return session

    @classmethod
    async def bulk_deactivate_sessions(
        cls, db: AsyncSession, sessions: List[WebSession]
    ) -> int:
        """
        Bulk deactivate sessions.

        Args:
            db: Database session
            sessions: List of sessions to deactivate

        Returns:
            Number of sessions deactivated
        """
        count = 0
        for session in sessions:
            session.is_active = False
            count += 1

        await db.commit()
        return count
