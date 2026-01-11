"""
Desktop Session Service for Tauri requester app sessions.

Handles desktop-specific session management with required app_version tracking,
computer identification, and desktop-specific heartbeat/cleanup logic.

============================================================================
SECURITY NOTICE (Finding #19 - Remote Input Session Binding)
============================================================================

FUTURE INTEGRATION: Expose Session Lookup for Remote Access Binding

This service manages DesktopSession lifecycle. For remote input session
binding to work properly, the RemoteAccessService will need to:

1. LOOKUP: Get the requester's active DesktopSession when remote access
   is requested (use get_user_sessions with active_only=True)

2. VALIDATE: Before processing remote input commands, verify:
   - The bound desktop_session_id is still active
   - The session's last_heartbeat is within acceptable threshold
   - The session hasn't been replaced (same device_fingerprint)

3. CLEANUP: When a DesktopSession is disconnected or cleaned up,
   any bound RemoteAccessSession should be notified/ended

HELPER METHODS TO ADD (FUTURE):
- get_active_session_for_user_with_fingerprint(): For precise binding
- validate_session_for_remote_access(): Pre-command validation
- notify_remote_sessions_on_disconnect(): Cascade session end

See Finding #19 documentation in remote_access_service.py for full context.
============================================================================
"""

import logging
import secrets
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
from models import DesktopSession, User

# Module-level logger
logger = logging.getLogger(__name__)


class DesktopSessionService:
    """Service for managing desktop/Tauri application sessions."""

    @staticmethod
    @critical_database_operation("get_or_create_user")
    @log_database_operation("user creation/retrieval", level="debug")
    async def get_or_create_user(db: AsyncSession, username: str) -> User:
        """
        Get existing user by username or create a new one with dummy data.

        Args:
            db: Database session
            username: Username to look up or create

        Returns:
            Existing or newly created User
        """
        # Try to find existing user
        stmt = select(User).where(User.username == username)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            logger.debug(f"Found existing user: {username} (ID: {user.id})")
            return user

        logger.info(f"Creating new auto-generated user: {username}")

        # Create new user with dummy data
        email = f"{username}@auto-generated.local"

        # Check if email already exists
        email_stmt = select(User).where(User.email == email)
        email_result = await db.execute(email_stmt)
        if email_result.scalar_one_or_none():
            email = f"{username}.{secrets.token_hex(4)}@auto-generated.local"
            logger.debug(f"Email collision detected, using: {email}")

        # Create user with placeholder data
        new_user = User(
            username=username,
            email=email,
            full_name=f"Auto-generated User ({username})",
            password_hash=None,
            is_technician=False,
            is_active=True,
            is_online=False,
            is_super_admin=False,
            is_domain=True,
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        logger.info(f"Auto-created user: {username} (ID: {new_user.id})")
        return new_user

    @staticmethod
    @transactional_database_operation("create_desktop_session")
    @log_database_operation("desktop session creation", level="debug")
    async def create_session(
        db: AsyncSession,
        user_id: UUID,
        ip_address: str,
        app_version: str,  # REQUIRED for desktop
        auth_method: str = "sso",
        device_fingerprint: Optional[str] = None,
        computer_name: Optional[str] = None,
        os_info: Optional[str] = None,
    ) -> DesktopSession:
        """
        Create a new desktop session.

        Args:
            db: Database session
            user_id: User UUID
            ip_address: Client IP address
            app_version: Tauri app version (REQUIRED)
            auth_method: Authentication method used (sso, ad)
            device_fingerprint: Unique device identifier
            computer_name: Computer/hostname
            os_info: Operating system information

        Returns:
            Created DesktopSession

        Raises:
            HTTPException: If concurrent session limit is reached (when limit > 0)
        """
        from core.config import settings
        from fastapi import HTTPException, status as http_status

        session_logger = SessionLogger()

        logger.info(f"Creating desktop session for user: {user_id} | App version: {app_version}")

        # Check for existing active session with same device fingerprint
        # Users can have multiple active sessions from different devices
        if device_fingerprint:
            stmt = (
                select(DesktopSession)
                .where(DesktopSession.user_id == user_id)
                .where(DesktopSession.is_active == True)
                .where(DesktopSession.device_fingerprint == device_fingerprint)
            )
            result = await db.execute(stmt)
            existing_session = result.scalar_one_or_none()

            if existing_session:
                logger.info(
                    f"Found existing active desktop session {existing_session.id} for user {user_id} | "
                    f"Old IP: {existing_session.ip_address} | Old Computer: {existing_session.computer_name}"
                )

                # Update existing session
                existing_session.ip_address = ip_address
                existing_session.app_version = app_version
                existing_session.last_heartbeat = datetime.utcnow()
                existing_session.computer_name = computer_name
                existing_session.os_info = os_info

                await db.commit()
                await db.refresh(existing_session)

                logger.info(
                    f"🔄 Updated desktop session {existing_session.id} | "
                    f"New IP: {ip_address} | Computer: {computer_name} | "
                    f"App version: {app_version} | OS: {os_info}"
                )
                session_logger.session_updated(
                    existing_session.id, user_id, existing_session.last_heartbeat
                )
                return existing_session

        # Deactivate any existing active sessions for the same user + computer
        # This handles cases where device_fingerprint changes (app restart/reinstall)
        if computer_name:
            deactivate_stmt = (
                select(DesktopSession)
                .where(DesktopSession.user_id == user_id)
                .where(DesktopSession.computer_name == computer_name)
                .where(DesktopSession.is_active == True)
            )
            result = await db.execute(deactivate_stmt)
            old_sessions = result.scalars().all()

            for old_session in old_sessions:
                old_session.is_active = False
                logger.info(
                    f"Deactivated old session {old_session.id} for user {user_id} "
                    f"on computer {computer_name} (fingerprint: {old_session.device_fingerprint})"
                )

        # Enforce concurrent session limit (if enabled)
        max_concurrent = settings.security.session_max_concurrent
        if max_concurrent > 0:
            # Count current active desktop sessions for this user
            count_stmt = (
                select(DesktopSession)
                .where(DesktopSession.user_id == user_id)
                .where(DesktopSession.is_active == True)
            )
            result = await db.execute(count_stmt)
            active_sessions = result.scalars().all()
            active_count = len(active_sessions)

            if active_count >= max_concurrent:
                logger.warning(
                    f"Desktop session limit reached for user {user_id}: "
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
                        f"Deactivated oldest desktop session {old_session.id} for user {user_id} "
                        f"(last active: {old_session.last_heartbeat})"
                    )

                await db.commit()

        # Create new desktop session
        logger.info(
            f"Creating NEW desktop session | "
            f"user_id: {user_id} | "
            f"ip_address: {ip_address} | "
            f"app_version: {app_version} | "
            f"computer_name: {computer_name} | "
            f"os_info: {os_info} | "
            f"auth_method: {auth_method} | "
            f"device_fingerprint: {device_fingerprint}"
        )

        session = DesktopSession(
            user_id=user_id,
            ip_address=ip_address,
            app_version=app_version,
            auth_method=auth_method,
            authenticated_at=datetime.utcnow(),
            device_fingerprint=device_fingerprint,
            computer_name=computer_name,
            os_info=os_info,
        )

        db.add(session)
        await db.commit()
        await db.refresh(session)

        logger.info(
            f"✅ Created desktop session {session.id} for user {user_id} | "
            f"App version: {app_version} | IP: {ip_address} | "
            f"Computer: {computer_name} | OS: {os_info}"
        )
        session_logger.session_created(user_id, session.id, 2, ip_address)  # type_id=2 for desktop

        return session

    @staticmethod
    @transactional_database_operation("update_desktop_heartbeat")
    @log_database_operation("desktop heartbeat update", level="debug")
    async def update_heartbeat(
        db: AsyncSession,
        session_id: UUID,
        ip_address: Optional[str] = None,
    ) -> Optional[DesktopSession]:
        """
        Update desktop session heartbeat.

        Args:
            db: Database session
            session_id: Session ID
            ip_address: Optional IP address update

        Returns:
            Updated session or None
        """
        session_logger = SessionLogger()

        stmt = select(DesktopSession).where(DesktopSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            logger.warning(f"Desktop heartbeat update failed - Session not found: {session_id}")
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
        logger.info(
            f"Desktop heartbeat updated for session {session_id} | "
            f"User: {session.user_id} | Duration since last: {duration:.1f} min"
        )

        session_logger.heartbeat_received(session_id, session.user_id, session.ip_address)
        return session

    @staticmethod
    @transactional_database_operation("disconnect_desktop_session")
    @log_database_operation("desktop session disconnection", level="debug")
    async def disconnect_session(
        db: AsyncSession, session_id: UUID
    ) -> Optional[DesktopSession]:
        """
        Mark a desktop session as disconnected.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Updated session or None
        """
        session_logger = SessionLogger()

        stmt = select(DesktopSession).where(DesktopSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            logger.warning(f"Desktop disconnect failed - Session not found: {session_id}")
            return None

        duration = (datetime.utcnow() - session.created_at).total_seconds() / 60
        session.is_active = False

        await db.commit()
        await db.refresh(session)

        logger.info(
            f"Desktop session disconnected: {session_id} | "
            f"User: {session.user_id} | Duration: {duration:.1f} minutes"
        )
        session_logger.session_disconnected(session_id, session.user_id, duration)

        return session

    @staticmethod
    @safe_database_query("get_user_desktop_sessions", default_return=[])
    async def get_user_sessions(
        db: AsyncSession, user_id: UUID, active_only: bool = True
    ) -> List[DesktopSession]:
        """
        Get all desktop sessions for a user.

        Args:
            db: Database session
            user_id: User ID
            active_only: Only return active sessions

        Returns:
            List of DesktopSession
        """
        stmt = select(DesktopSession).where(DesktopSession.user_id == user_id)

        if active_only:
            stmt = stmt.where(DesktopSession.is_active == True)

        stmt = stmt.order_by(DesktopSession.last_heartbeat.desc())

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        return sessions

    @staticmethod
    @safe_database_query("get_active_desktop_sessions", default_return=[])
    async def get_active_sessions(db: AsyncSession) -> List[DesktopSession]:
        """
        Get all active desktop sessions across all users.

        Args:
            db: Database session

        Returns:
            List of active DesktopSession
        """
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.is_active == True)
            .order_by(DesktopSession.last_heartbeat.desc())
        )

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        return sessions

    @staticmethod
    @safe_database_query("get_active_desktop_sessions_with_users", default_return=[])
    async def get_active_sessions_with_users(db: AsyncSession) -> List[DesktopSession]:
        """
        Get all active desktop sessions with user information eagerly loaded.
        Used for monitoring dashboard.

        Args:
            db: Database session

        Returns:
            List of active DesktopSession with user relationship loaded
        """
        from sqlalchemy.orm import selectinload

        stmt = (
            select(DesktopSession)
            .options(selectinload(DesktopSession.user))
            .where(DesktopSession.is_active == True)
            .order_by(DesktopSession.last_heartbeat.desc())
        )

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        return sessions

    @staticmethod
    @transactional_database_operation("cleanup_stale_desktop_sessions")
    @log_database_operation("stale desktop session cleanup", level="info")
    async def cleanup_stale_sessions(
        db: AsyncSession, timeout_minutes: int = 10
    ) -> int:
        """
        Clean up stale desktop sessions (no heartbeat for > timeout_minutes).

        Args:
            db: Database session
            timeout_minutes: Minutes before considering session stale

        Returns:
            Number of sessions cleaned up
        """
        session_logger = SessionLogger()

        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        logger.info(
            f"Starting stale desktop session cleanup | "
            f"Timeout: {timeout_minutes} minutes | Cutoff: {cutoff_time.isoformat()}"
        )

        # Find stale sessions
        stmt = (
            select(DesktopSession)
            .where(DesktopSession.is_active == True)
            .where(DesktopSession.last_heartbeat < cutoff_time)
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
                f"Cleaned stale desktop session {session.id} | "
                f"User: {session.user_id} | Inactive for: {inactive_duration:.1f} minutes"
            )
            count += 1

        if count > 0:
            await db.commit()
            logger.info(f"Desktop cleanup completed | {count} stale sessions cleaned up")
        else:
            logger.info("Desktop cleanup completed | No stale sessions found")

        return count

    @staticmethod
    @safe_database_query("get_desktop_session_by_id")
    async def get_session_by_id(
        db: AsyncSession, session_id: UUID
    ) -> Optional[DesktopSession]:
        """
        Get a desktop session by ID.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            DesktopSession or None
        """
        stmt = select(DesktopSession).where(DesktopSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        return session
