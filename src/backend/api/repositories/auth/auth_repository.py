"""
Authentication repository for managing AuthToken and RefreshSession models.

This repository handles all database operations for authentication tokens and refresh sessions.
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from db import AuthToken, RefreshSession
from api.repositories.base_repository import BaseRepository


class AuthTokenRepository(BaseRepository[AuthToken]):
    """Repository for AuthToken operations."""

    model = AuthToken

    @classmethod
    async def find_by_token_hash(
        cls, db: AsyncSession, token_hash: str, is_revoked: bool = False
    ) -> Optional[AuthToken]:
        """
        Find an auth token by hash.

        Args:
            db: Database session
            token_hash: Token hash to search for
            is_revoked: Filter by revoked status (default: False)

        Returns:
            AuthToken or None
        """
        stmt = select(AuthToken).where(
            and_(
                AuthToken.__table__.c.token_hash == token_hash,
                AuthToken.__table__.c.is_revoked == is_revoked,
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def revoke_session_tokens(cls, db: AsyncSession, session_id: UUID) -> int:
        """
        Revoke all tokens for a specific session.

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Number of tokens revoked
        """
        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            update(AuthToken)
            .where(AuthToken.__table__.c.session_id == session_id)
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )
        await db.flush()
        return cursor_result.rowcount

    @classmethod
    async def revoke_old_session_tokens(cls, db: AsyncSession, session_id: UUID) -> int:
        """
        Revoke old access tokens for a session (before creating new one).

        Args:
            db: Database session
            session_id: Session ID

        Returns:
            Number of tokens revoked
        """
        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            update(AuthToken)
            .where(
                and_(
                    AuthToken.__table__.c.session_id == session_id,
                    AuthToken.__table__.c.is_revoked.is_(False),
                )
            )
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )
        return cursor_result.rowcount

    @classmethod
    async def revoke_all_user_tokens(cls, db: AsyncSession, user_id: UUID) -> int:
        """
        Revoke all tokens for a user.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            Number of tokens revoked
        """
        cursor_result: CursorResult = await db.execute(  # type: ignore[assignment]
            update(AuthToken)
            .where(AuthToken.__table__.c.user_id == user_id)
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )
        await db.flush()
        return cursor_result.rowcount

    @classmethod
    async def cleanup_expired_tokens(
        cls, db: AsyncSession, retention_days: int = 7
    ) -> Dict[str, int]:
        """
        Clean up expired and revoked auth tokens.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked tokens for audit

        Returns:
            Dict with counts of deleted tokens by category
        """
        now = datetime.utcnow()
        retention_cutoff = now - timedelta(days=retention_days)

        total_before_result = await db.execute(select(func.count()).select_from(AuthToken))
        total_count_before = total_before_result.scalar() or 0

        expired_cursor: CursorResult = await db.execute(  # type: ignore[assignment]
            delete(AuthToken)
            .where(AuthToken.__table__.c.expires_at < now)
            .where(AuthToken.__table__.c.created_at < retention_cutoff)
        )
        expired_deleted = expired_cursor.rowcount

        revoked_cursor: CursorResult = await db.execute(  # type: ignore[assignment]
            delete(AuthToken)
            .where(AuthToken.__table__.c.is_revoked.is_(True))
            .where(AuthToken.__table__.c.created_at < retention_cutoff)
        )
        revoked_deleted = revoked_cursor.rowcount

        await db.flush()

        total_after_result = await db.execute(select(func.count()).select_from(AuthToken))
        total_count_after = total_after_result.scalar() or 0

        total_deleted = total_count_before - total_count_after

        return {
            "total_deleted": total_deleted,
            "expired_deleted": expired_deleted,
            "revoked_deleted": revoked_deleted,
            "total_before": total_count_before,
            "total_after": total_count_after,
        }

    @classmethod
    async def count_total(cls, db: AsyncSession) -> int:
        """
        Count total auth tokens.

        Args:
            db: Database session

        Returns:
            Total count of auth tokens
        """
        result = await db.execute(select(func.count()).select_from(AuthToken))
        return result.scalar() or 0


class RefreshSessionRepository(BaseRepository[RefreshSession]):
    """Repository for RefreshSession operations."""

    model = RefreshSession

    @classmethod
    async def cleanup_expired_sessions(
        cls, db: AsyncSession, retention_days: int = 7
    ) -> Dict[str, int]:
        """
        Clean up expired and revoked refresh sessions.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked sessions for audit

        Returns:
            Dict with counts of deleted sessions by category
        """
        now = datetime.utcnow()
        retention_cutoff = now - timedelta(days=retention_days)

        total_before_result = await db.execute(
            select(func.count()).select_from(RefreshSession)
        )
        total_count_before = total_before_result.scalar() or 0

        expired_cursor: CursorResult = await db.execute(  # type: ignore[assignment]
            delete(RefreshSession)
            .where(RefreshSession.__table__.c.expires_at < now)
            .where(RefreshSession.__table__.c.created_at < retention_cutoff)
        )
        expired_deleted = expired_cursor.rowcount

        revoked_cursor: CursorResult = await db.execute(  # type: ignore[assignment]
            delete(RefreshSession)
            .where(RefreshSession.__table__.c.revoked.is_(True))
            .where(RefreshSession.__table__.c.created_at < retention_cutoff)
        )
        revoked_deleted = revoked_cursor.rowcount

        await db.flush()

        total_after_result = await db.execute(select(func.count()).select_from(RefreshSession))
        total_count_after = total_after_result.scalar() or 0

        total_deleted = total_count_before - total_count_after

        return {
            "total_deleted": total_deleted,
            "expired_deleted": expired_deleted,
            "revoked_deleted": revoked_deleted,
            "total_before": total_count_before,
            "total_after": total_count_after,
        }

    @classmethod
    async def count_total(cls, db: AsyncSession) -> int:
        """
        Count total refresh sessions.

        Args:
            db: Database session

        Returns:
            Total count of refresh sessions
        """
        result = await db.execute(select(func.count()).select_from(RefreshSession))
        return result.scalar() or 0
