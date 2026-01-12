"""
Web Session Service for Next.js it-app sessions.

Handles web-specific session management with browser tracking,
web authentication flows (passwordless, AD, admin), and httpOnly cookie integration.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    critical_database_operation,
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from core.logging_config import SessionLogger
from models import WebSession, User

# Module-level logger
logger = logging.getLogger(__name__)


class WebSessionService:
    """Service for managing web application sessions (Next.js it-app)."""

    @staticmethod
    @transactional_database_operation("create_web_session")
    @log_database_operation("web session creation", level="debug")
    async def create_session(
        db: AsyncSession,
        user_id: UUID,
        ip_address: str,
        auth_method: str = "passwordless",
        device_fingerprint: Optional[str] = None,
        browser: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> WebSession:
        """
        Create a new web session.

        Args:
            db: Database session
            user_id: User UUID
            ip_address: Client IP address
            auth_method: Authentication method (passwordless, ad, admin)
            device_fingerprint: Unique device identifier
            browser: Browser information
            user_agent: Full user agent string

        Returns:
            Created WebSession

        Raises:
            HTTPException: If concurrent session limit is reached (when limit > 0)
        """
        from core.config import settings
        from fastapi import HTTPException, status

        session_logger = SessionLogger()

        logger.info(f"Creating web session for user: {user_id} | Auth: {auth_method}")

        # Check for existing active session with same fingerprint
        if device_fingerprint:
            stmt = (
                select(WebSession)
                .where(WebSession.user_id == user_id)
                .where(WebSession.is_active == True)
                .where(WebSession.device_fingerprint == device_fingerprint)
            )
            result = await db.execute(stmt)
            existing_session = result.scalar_one_or_none()

            if existing_session:
                logger.info(f"Found existing active web session for user {user_id}")

                # Update existing session
                existing_session.ip_address = ip_address
                existing_session.last_heartbeat = datetime.utcnow()
                existing_session.browser = browser
                existing_session.user_agent = user_agent

                await db.commit()
                await db.refresh(existing_session)

                logger.info(f"Updated existing web session {existing_session.id}")
                session_logger.session_updated(
                    existing_session.id, user_id, existing_session.last_heartbeat
                )
                return existing_session

        # Enforce concurrent session limit (if enabled)
        max_concurrent = settings.security.session_max_concurrent
        if max_concurrent > 0:
            # Count current active web sessions for this user
            count_stmt = (
                select(WebSession)
                .where(WebSession.user_id == user_id)
                .where(WebSession.is_active == True)
            )
            result = await db.execute(count_stmt)
            active_sessions = result.scalars().all()
            active_count = len(active_sessions)

            if active_count >= max_concurrent:
                logger.warning(
                    f"Web session limit reached for user {user_id}: "
                    f"{active_count}/{max_concurrent} active sessions"
                )

                # Delete oldest session(s) to make room
                # Sort by last_heartbeat (oldest first)
                active_sessions.sort(key=lambda s: s.last_heartbeat)
                sessions_to_remove = active_count - max_concurrent + 1

                for i in range(sessions_to_remove):
                    old_session = active_sessions[i]
                    old_session.is_active = False
                    logger.info(
                        f"Deactivated oldest web session {old_session.id} for user {user_id} "
                        f"(last active: {old_session.last_heartbeat})"
                    )

                await db.commit()

        # Create new web session
        session = WebSession(
            user_id=user_id,
            ip_address=ip_address,
            auth_method=auth_method,
            authenticated_at=datetime.utcnow(),
            device_fingerprint=device_fingerprint,
            browser=browser,
            user_agent=user_agent,
        )

        db.add(session)
        await db.commit()
        await db.refresh(session)

        logger.info(
            f"Created new web session {session.id} for user {user_id} | "
            f"Auth: {auth_method} | IP: {ip_address}"
        )
        session_logger.session_created(user_id, session.id, 1, ip_address)  # type_id=1 for web

        return session

    @staticmethod
    @transactional_database_operation("update_web_heartbeat")
    @log_database_operation("web heartbeat update", level="debug")
    async def update_heartbeat(
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
        session_logger = SessionLogger()

        stmt = select(WebSession).where(WebSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            logger.warning(f"Web heartbeat update failed - Session not found: {session_id}")
            return None

        # Update heartbeat
        old_heartbeat = session.last_heartbeat
        session.last_heartbeat = datetime.utcnow()
        session.is_active = True

        if ip_address:
            session.ip_address = ip_address

        await db.commit()
        await db.refresh(session)

        duration = (session.last_heartbeat - old_heartbeat).total_seconds() / 60
        logger.debug(
            f"Web heartbeat updated for session {session_id} | "
            f"User: {session.user_id} | Duration since last: {duration:.1f} min"
        )

        session_logger.heartbeat_received(session_id, session.user_id, session.ip_address)
        return session

    @staticmethod
    @transactional_database_operation("disconnect_web_session")
    @log_database_operation("web session disconnection", level="debug")
    async def disconnect_session(
        db: AsyncSession, session_id: int
    ) -> Optional[WebSession]:
        """
        Mark a web session as disconnected.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Updated session or None
        """
        session_logger = SessionLogger()

        stmt = select(WebSession).where(WebSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            logger.warning(f"Web disconnect failed - Session not found: {session_id}")
            return None

        duration = (datetime.utcnow() - session.created_at).total_seconds() / 60
        session.is_active = False

        await db.commit()
        await db.refresh(session)

        logger.info(
            f"Web session disconnected: {session_id} | "
            f"User: {session.user_id} | Duration: {duration:.1f} minutes"
        )
        session_logger.session_disconnected(session_id, session.user_id, duration)

        return session

    @staticmethod
    @safe_database_query("get_user_web_sessions", default_return=[])
    async def get_user_sessions(
        db: AsyncSession, user_id: UUID, active_only: bool = True
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
            stmt = stmt.where(WebSession.is_active == True)

        stmt = stmt.order_by(WebSession.last_heartbeat.desc())

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        return sessions

    @staticmethod
    @safe_database_query("get_active_web_sessions", default_return=[])
    async def get_active_sessions(db: AsyncSession) -> List[WebSession]:
        """
        Get all active web sessions across all users.

        Args:
            db: Database session

        Returns:
            List of active WebSession
        """
        stmt = (
            select(WebSession)
            .where(WebSession.is_active == True)
            .order_by(WebSession.last_heartbeat.desc())
        )

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        return sessions

    @staticmethod
    @safe_database_query("get_active_web_sessions_with_users", default_return=[])
    async def get_active_sessions_with_users(db: AsyncSession) -> List[WebSession]:
        """
        Get all active web sessions with user information eagerly loaded.
        Used for monitoring dashboard.

        Args:
            db: Database session

        Returns:
            List of active WebSession with user relationship loaded
        """
        from sqlalchemy.orm import selectinload

        stmt = (
            select(WebSession)
            .options(selectinload(WebSession.user))
            .where(WebSession.is_active == True)
            .order_by(WebSession.last_heartbeat.desc())
        )

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        return sessions

    @staticmethod
    @transactional_database_operation("cleanup_stale_web_sessions")
    @log_database_operation("stale web session cleanup", level="info")
    async def cleanup_stale_sessions(
        db: AsyncSession, timeout_minutes: int = 60
    ) -> int:
        """
        Clean up stale web sessions (no heartbeat for > timeout_minutes).
        Web sessions typically have longer timeout than desktop.

        Args:
            db: Database session
            timeout_minutes: Minutes before considering session stale (default 60 for web)

        Returns:
            Number of sessions cleaned up
        """
        session_logger = SessionLogger()

        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        logger.info(
            f"Starting stale web session cleanup | "
            f"Timeout: {timeout_minutes} minutes | Cutoff: {cutoff_time.isoformat()}"
        )

        # Find stale sessions
        stmt = (
            select(WebSession)
            .where(WebSession.is_active == True)
            .where(WebSession.last_heartbeat < cutoff_time)
        )

        result = await db.execute(stmt)
        stale_sessions = result.scalars().all()

        count = 0
        for session in stale_sessions:
            inactive_duration = (datetime.utcnow() - session.last_heartbeat).total_seconds() / 60
            session.is_active = False

            session_logger.stale_session_cleaned(
                session.id,
                session.user_id,
                session.last_heartbeat,
                inactive_duration,
            )
            logger.warning(
                f"Cleaned stale web session {session.id} | "
                f"User: {session.user_id} | Inactive for: {inactive_duration:.1f} minutes"
            )
            count += 1

        if count > 0:
            await db.commit()
            logger.info(f"Web cleanup completed | {count} stale sessions cleaned up")
        else:
            logger.info("Web cleanup completed | No stale sessions found")

        return count

    @staticmethod
    @safe_database_query("get_web_session_by_id")
    async def get_session_by_id(
        db: AsyncSession, session_id: int
    ) -> Optional[WebSession]:
        """
        Get a web session by ID.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            WebSession or None
        """
        stmt = select(WebSession).where(WebSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        return session

    @staticmethod
    @safe_database_query("revoke_web_session")
    async def revoke_session(
        db: AsyncSession, session_id: int, user_id: UUID
    ) -> bool:
        """
        Revoke a specific web session (for logout/session management).

        Args:
            db: Database session
            session_id: Session ID to revoke
            user_id: User ID (for verification)

        Returns:
            True if revoked, False if not found
        """
        stmt = select(WebSession).where(
            WebSession.id == session_id,
            WebSession.user_id == user_id
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            return False

        session.is_active = False
        await db.commit()

        logger.info(f"Revoked web session {session_id} for user {user_id}")
        return True
