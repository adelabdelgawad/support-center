"""
Authentication repository for managing AuthToken and RefreshSession models.

This repository handles all database operations for authentication tokens and refresh sessions.
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db import AuthToken, RefreshSession
from repositories.base_repository import BaseRepository

# mypy: disable-error-code="arg-type"
# mypy: disable-error-code="attr-defined"
# mypy: disable-error-code="call-overload"
# mypy: disable-error-code="return-value"
# mypy: disable-error-code="no-any-return"
# mypy: disable-error-code="operator"


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
                AuthToken.token_hash == token_hash,
                AuthToken.is_revoked == is_revoked,
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
        result = await db.execute(
            update(AuthToken)
            .where(AuthToken.session_id == session_id)
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )
        await db.commit()
        return result.rowcount

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
        result = await db.execute(
            update(AuthToken)
            .where(
                and_(
                    AuthToken.session_id == session_id,
                    not AuthToken.is_revoked,
                )
            )
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )
        return result.rowcount

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
        result = await db.execute(
            update(AuthToken)
            .where(AuthToken.user_id == user_id)
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )
        await db.commit()
        return result.rowcount

    @classmethod
    async def cleanup_expired_tokens(
        cls, db: AsyncSession, retention_days: int = 7
    ) -> Dict[str, int]:
        """
        Clean up expired and revoked auth tokens.

        Removes tokens that are:
        - Expired (expires_at < now) AND older than retention period
        - Revoked (is_revoked = True) AND older than retention period

        Retention period allows keeping old tokens for audit trail.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked tokens for audit

        Returns:
            Dict with counts of deleted tokens by category
        """
        now = datetime.utcnow()
        retention_cutoff = now - timedelta(days=retention_days)

        # Count tokens before cleanup
        total_before = await db.execute(select(func.count()).select_from(AuthToken))
        total_count_before = total_before.scalar()

        # Delete expired tokens older than retention period
        expired_result = await db.execute(
            delete(AuthToken)
            .where(AuthToken.expires_at < now)
            .where(AuthToken.created_at < retention_cutoff)
        )
        expired_deleted = expired_result.rowcount

        # Delete revoked tokens older than retention period
        revoked_result = await db.execute(
            delete(AuthToken)
            .where(AuthToken.is_revoked)
            .where(AuthToken.created_at < retention_cutoff)
        )
        revoked_deleted = revoked_result.rowcount

        await db.commit()

        # Count tokens after cleanup
        total_after = await db.execute(select(func.count()).select_from(AuthToken))
        total_count_after = total_after.scalar()

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

        Removes sessions that are:
        - Expired (expires_at < now) AND older than retention period
        - Revoked (revoked = True) AND older than retention period

        Retention period allows keeping old sessions for audit trail.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked sessions for audit

        Returns:
            Dict with counts of deleted sessions by category
        """
        now = datetime.utcnow()
        retention_cutoff = now - timedelta(days=retention_days)

        # Count sessions before cleanup
        total_before = await db.execute(
            select(func.count()).select_from(RefreshSession)
        )
        total_count_before = total_before.scalar()

        # Delete expired sessions older than retention period
        expired_result = await db.execute(
            delete(RefreshSession)
            .where(RefreshSession.expires_at < now)
            .where(RefreshSession.created_at < retention_cutoff)
        )
        expired_deleted = expired_result.rowcount

        # Delete revoked sessions older than retention period
        revoked_result = await db.execute(
            delete(RefreshSession)
            .where(RefreshSession.revoked)
            .where(RefreshSession.created_at < retention_cutoff)
        )
        revoked_deleted = revoked_result.rowcount

        await db.commit()

        # Count sessions after cleanup
        total_after = await db.execute(select(func.count()).select_from(RefreshSession))
        total_count_after = total_after.scalar()

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
