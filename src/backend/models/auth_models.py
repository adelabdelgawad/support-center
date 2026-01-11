"""
Authentication models for passwordless authentication system.

This module contains the AuthToken model for long-lived access tokens (30 days).
Also includes RefreshSession model for stateful authentication with refresh tokens.
"""
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Index, Integer,
                        String, Text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .database_models import TableModel

if TYPE_CHECKING:
    from .database_models import User


def cairo_now():
    """Get current time in UTC (timezone-naive) for database storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AuthToken(SQLModel, table=True):
    """Access tokens for authentication"""
    __tablename__ = "auth_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    token_id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PGUUID(as_uuid=True), unique=True, nullable=False)
    )
    user_id: UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    )
    session_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True)
    )  # Session ID (references user_sessions table)
    token_hash: str = Field(max_length=255, unique=True)
    token_type: str = Field(default="access", max_length=20)
    device_info: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: Optional[datetime] = None
    is_revoked: bool = Field(default=False)

    # Indexes for performance
    __table_args__ = (
        Index("idx_auth_tokens_token_id", "token_id"),
        Index("idx_auth_tokens_user_id", "user_id"),
        Index("idx_auth_tokens_session_id", "session_id"),
        Index("idx_auth_tokens_token_hash", "token_hash"),
        Index("idx_auth_tokens_expires_at", "expires_at"),
        Index("idx_auth_tokens_active", "user_id", "is_revoked", "expires_at"),
    )


class RefreshSession(SQLModel, table=True):
    """
    Stateful session tracking with refresh token support.

    This model enables modern authentication with short-lived access tokens
    and long-lived refresh tokens, providing better security than single
    long-lived tokens.

    Features:
    - Atomic token rotation with SELECT FOR UPDATE
    - Device fingerprinting for security
    - Session limit enforcement
    - Individual session revocation
    - Metadata storage for locale and other preferences
    """
    __tablename__ = "refresh_sessions"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True),
        description="Session UUID",
    )

    # User reference (UUID primary key)
    user_id: UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        description="User UUID (primary key reference)",
    )

    # Refresh token tracking
    refresh_token_id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PGUUID(as_uuid=True), unique=True, nullable=False),
        description="JTI of current refresh token (rotates on refresh)",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(DateTime, nullable=False),
        description="Session creation timestamp",
    )
    last_seen_at: datetime = Field(
        default_factory=cairo_now,
        sa_column=Column(DateTime, nullable=False),
        description="Last activity timestamp",
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime, nullable=False),
        description="Session expiration timestamp",
    )

    # Security and tracking
    revoked: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
        description="Whether session has been revoked",
    )
    device_info: Optional[str] = Field(
        default=None,
        max_length=500,
        sa_column=Column(String(500), nullable=True),
        description="User agent or device information",
    )
    ip_address: Optional[str] = Field(
        default=None,
        max_length=45,
        sa_column=Column(String(45), nullable=True),
        description="Client IP address (IPv4 or IPv6)",
    )
    fingerprint: Optional[str] = Field(
        default=None,
        max_length=64,
        sa_column=Column(String(64), nullable=True),
        description="Hashed device fingerprint",
    )
    session_metadata: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="Additional session metadata (locale, preferences, etc.)",
    )

    # Relationships
    user: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "RefreshSession.user_id",
        }
    )

    # Indexes for performance
    __table_args__ = (
        Index("ix_refresh_sessions_user_id", "user_id"),
        Index("ix_refresh_sessions_refresh_token_id", "refresh_token_id", unique=True),
        Index("ix_refresh_sessions_revoked", "revoked"),
        Index("ix_refresh_sessions_expires_at", "expires_at"),
        Index("ix_refresh_sessions_active", "user_id", "revoked", "expires_at"),
    )
