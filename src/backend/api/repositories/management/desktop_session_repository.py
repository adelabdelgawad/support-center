"""
Desktop session repository for managing DesktopSession model.

This repository handles all database operations for desktop sessions.
"""

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import DesktopSession
from api.repositories.base_repository import BaseRepository

# mypy: disable-error-code="arg-type"
# mypy: disable-error-code="attr-defined"
# mypy: disable-error-code="call-overload"
# mypy: disable-error-code="return-value"
# mypy: disable-error-code="no-any-return"


class DesktopSessionRepository(BaseRepository[DesktopSession]):
    """Repository for DesktopSession operations."""

    model = DesktopSession

    @classmethod
    async def find_active_by_user_and_fingerprint(
        cls, db: AsyncSession, user_id: UUID, device_fingerprint: str
    ) -> Optional[DesktopSession]:
        """
        Find active desktop session for user and device fingerprint.

        Args:
            db: Database session
            user_id: User ID
            device_fingerprint: Device fingerprint

        Returns:
            DesktopSession or None
        """
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.user_id == user_id)
            .where(DesktopSession.is_active)
            .where(DesktopSession.device_fingerprint == device_fingerprint)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_active_by_user_and_computer(
        cls, db: AsyncSession, user_id: UUID, computer_name: str
    ) -> List[DesktopSession]:
        """
        Find active desktop sessions for user and computer.

        Args:
            db: Database session
            user_id: User ID
            computer_name: Computer name

        Returns:
            List of DesktopSession
        """
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.user_id == user_id)
            .where(DesktopSession.computer_name == computer_name)
            .where(DesktopSession.is_active)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def find_active_by_user(
        cls, db: AsyncSession, user_id: UUID
    ) -> List[DesktopSession]:
        """
        Find all active desktop sessions for a user.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List of active DesktopSession
        """
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.user_id == user_id)
            .where(DesktopSession.is_active)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def find_all_active(cls, db: AsyncSession) -> List[DesktopSession]:
        """
        Find all active desktop sessions.

        Args:
            db: Database session

        Returns:
            List of active DesktopSession
        """
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.is_active)
            .order_by(DesktopSession.last_heartbeat.desc())
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def find_all_active_with_users(cls, db: AsyncSession) -> List[DesktopSession]:
        """
        Find all active desktop sessions with user information eagerly loaded.

        Args:
            db: Database session

        Returns:
            List of active DesktopSession with user relationship loaded
        """
        stmt = (
            select(DesktopSession)
            .options(selectinload(DesktopSession.user))
            .where(DesktopSession.is_active)
            .order_by(DesktopSession.last_heartbeat.desc())
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def find_by_user(
        cls, db: AsyncSession, user_id: UUID, active_only: bool = True
    ) -> List[DesktopSession]:
        """
        Find desktop sessions for a user.

        Args:
            db: Database session
            user_id: User ID
            active_only: Only return active sessions

        Returns:
            List of DesktopSession
        """
        stmt = select(DesktopSession).where(DesktopSession.user_id == user_id)

        if active_only:
            stmt = stmt.where(DesktopSession.is_active)

        stmt = stmt.order_by(DesktopSession.last_heartbeat.desc())

        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def find_stale(
        cls, db: AsyncSession, timeout_minutes: int = 1440
    ) -> List[DesktopSession]:
        """
        Find stale desktop sessions (no heartbeat for > timeout_minutes).

        Args:
            db: Database session
            timeout_minutes: Minutes before considering session stale

        Returns:
            List of stale DesktopSession
        """
        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        stmt = (
            select(DesktopSession)
            .where(DesktopSession.is_active)
            .where(DesktopSession.last_heartbeat < cutoff_time)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @classmethod
    async def update_heartbeat(
        cls,
        db: AsyncSession,
        session_id: UUID,
        ip_address: Optional[str] = None,
    ) -> Optional[DesktopSession]:
        """
        Update desktop session heartbeat with optimistic locking.

        Args:
            db: Database session
            session_id: Session ID
            ip_address: Optional IP address update

        Returns:
            Updated session or None

        Note:
            Caller must commit transaction.
            Returns None on optimistic locking conflict.
            Returns None if session has been inactive for > 60 minutes (expiration guard).
        """
        stmt = select(DesktopSession).where(DesktopSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            return None

        # EXPIRATION GUARD: Prevent resurrection of long-dead sessions
        # If session is inactive, check if it's been too long since last heartbeat
        if not session.is_active:
            inactive_duration = (datetime.utcnow() - session.last_heartbeat).total_seconds() / 60

            if inactive_duration > 60:  # 1 hour threshold
                import logging
                logger = logging.getLogger("api.desktop_sessions")
                logger.warning(
                    f"Session {session_id} rejected: inactive for {inactive_duration:.1f} minutes "
                    f"(> 60 min threshold). Resurrection prevented."
                )
                return None

        # Store current version for optimistic locking
        current_version = session.version

        # Update fields
        session.last_heartbeat = datetime.utcnow()
        session.is_active = True

        if ip_address:
            session.ip_address = ip_address

        # Increment version for optimistic locking
        session.version = current_version + 1

        try:
            await db.flush()
        except Exception:
            # Flush failed - likely version conflict or concurrent update
            return None

        return session

    @classmethod
    async def mark_inactive(
        cls, db: AsyncSession, session_id: UUID
    ) -> Optional[DesktopSession]:
        """
        Mark a desktop session as inactive.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Updated session or None

        Note:
            Caller must commit transaction.
        """
        stmt = select(DesktopSession).where(DesktopSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            return None

        session.is_active = False

        await db.flush()

        return session

    @classmethod
    async def mark_all_inactive_for_user(cls, db: AsyncSession, user_id: UUID) -> int:
        """
        Mark all desktop sessions for a user as inactive.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            Number of sessions marked inactive

        Note:
            Caller must commit transaction.
        """
        result = await db.execute(
            update(DesktopSession)
            .where(DesktopSession.user_id == user_id)
            .values(is_active=False)
        )
        return result.rowcount

    @classmethod
    async def update_session_info(
        cls,
        db: AsyncSession,
        session: DesktopSession,
        ip_address: str,
        app_version: str,
        computer_name: Optional[str] = None,
        os_info: Optional[str] = None,
    ) -> DesktopSession:
        """
        Update desktop session information.

        Args:
            db: Database session
            session: DesktopSession to update
            ip_address: New IP address
            app_version: New app version
            computer_name: New computer name
            os_info: New OS info

        Returns:
            Updated session

        Note:
            Caller must commit transaction.
        """
        session.ip_address = ip_address
        session.app_version = app_version
        session.last_heartbeat = datetime.utcnow()

        if computer_name:
            session.computer_name = computer_name

        if os_info:
            session.os_info = os_info

        await db.flush()

        return session

    @classmethod
    async def mark_sessions_inactive_by_computer(
        cls, db: AsyncSession, user_id: UUID, computer_name: str
    ) -> List[DesktopSession]:
        """
        Mark active sessions for user + computer as inactive.

        Args:
            db: Database session
            user_id: User ID
            computer_name: Computer name

        Returns:
            List of deactivated sessions

        Note:
            Caller must commit transaction.
        """
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.user_id == user_id)
            .where(DesktopSession.computer_name == computer_name)
            .where(DesktopSession.is_active)
        )
        result = await db.execute(stmt)
        sessions = result.scalars().all()

        for session in sessions:
            session.is_active = False

        await db.flush()

        return sessions
