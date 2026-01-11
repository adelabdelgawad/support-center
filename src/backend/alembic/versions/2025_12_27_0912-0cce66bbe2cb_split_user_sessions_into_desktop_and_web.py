"""split_user_sessions_into_desktop_and_web

Revision ID: 0cce66bbe2cb
Revises: 9c858bb66f4b
Create Date: 2025-12-27 09:12:57.266757+00:00

Major Change: Split user_sessions table into desktop_sessions and web_sessions
for better separation of concerns, type safety, and performance.

Migration Strategy:
1. Create desktop_sessions table (for Tauri requester app sessions)
2. Create web_sessions table (for Next.js it-app sessions)
3. Migrate existing session data based on session_type_id:
   - session_type_id = 1 (WEB) → web_sessions
   - session_type_id = 2 (DESKTOP) → desktop_sessions
   - session_type_id = 3 (MOBILE) → Skip for now (no mobile app yet)
4. Keep user_sessions table for backward compatibility (will deprecate later)

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0cce66bbe2cb"
down_revision = "9c858bb66f4b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create desktop_sessions table
    op.create_table(
        "desktop_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("authenticated_at", sa.DateTime(), nullable=True),
        sa.Column("auth_method", sa.String(length=50), server_default=sa.text("'sso'"), nullable=False),
        sa.Column("last_auth_refresh", sa.DateTime(), nullable=True),
        sa.Column("device_fingerprint", sa.String(length=255), nullable=True),
        sa.Column("app_version", sa.String(length=50), nullable=False),  # REQUIRED for desktop
        sa.Column("computer_name", sa.String(length=255), nullable=True),
        sa.Column("os_info", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("last_heartbeat", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for desktop_sessions
    op.create_index("ix_desktop_sessions_user_id", "desktop_sessions", ["user_id"], unique=False)
    op.create_index("ix_desktop_sessions_is_active", "desktop_sessions", ["is_active"], unique=False)
    op.create_index("ix_desktop_sessions_user_active", "desktop_sessions", ["user_id", "is_active"], unique=False)
    op.create_index("ix_desktop_sessions_last_heartbeat", "desktop_sessions", ["last_heartbeat"], unique=False)
    op.create_index("ix_desktop_sessions_device_fingerprint", "desktop_sessions", ["device_fingerprint"], unique=False)
    op.create_index("ix_desktop_sessions_app_version", "desktop_sessions", ["app_version"], unique=False)

    # Create web_sessions table
    op.create_table(
        "web_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("authenticated_at", sa.DateTime(), nullable=True),
        sa.Column("auth_method", sa.String(length=50), server_default=sa.text("'passwordless'"), nullable=False),
        sa.Column("last_auth_refresh", sa.DateTime(), nullable=True),
        sa.Column("device_fingerprint", sa.String(length=255), nullable=True),
        sa.Column("browser", sa.String(length=100), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("last_heartbeat", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for web_sessions
    op.create_index("ix_web_sessions_user_id", "web_sessions", ["user_id"], unique=False)
    op.create_index("ix_web_sessions_is_active", "web_sessions", ["is_active"], unique=False)
    op.create_index("ix_web_sessions_user_active", "web_sessions", ["user_id", "is_active"], unique=False)
    op.create_index("ix_web_sessions_last_heartbeat", "web_sessions", ["last_heartbeat"], unique=False)
    op.create_index("ix_web_sessions_device_fingerprint", "web_sessions", ["device_fingerprint"], unique=False)

    # Migrate existing desktop sessions (session_type_id = 2)
    # CRITICAL: Desktop sessions MUST have app_version, so we set a default for existing sessions
    op.execute("""
        INSERT INTO desktop_sessions (
            user_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, app_version, created_at, last_heartbeat
        )
        SELECT
            user_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint,
            COALESCE(app_version, '1.0.0') as app_version,  -- Default version for existing sessions
            created_at, last_heartbeat
        FROM user_sessions
        WHERE session_type_id = 2
    """)

    # Migrate existing web sessions (session_type_id = 1)
    op.execute("""
        INSERT INTO web_sessions (
            user_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, created_at, last_heartbeat
        )
        SELECT
            user_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, created_at, last_heartbeat
        FROM user_sessions
        WHERE session_type_id = 1
    """)

    # Note: user_sessions table is kept for backward compatibility
    # Will be deprecated in a future migration once all code is updated


def downgrade() -> None:
    """Downgrade migration - merge sessions back into user_sessions."""

    # Restore desktop sessions back to user_sessions
    op.execute("""
        INSERT INTO user_sessions (
            user_id, session_type_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, app_version, created_at, last_heartbeat
        )
        SELECT
            user_id, 2 as session_type_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, app_version, created_at, last_heartbeat
        FROM desktop_sessions
        WHERE id NOT IN (SELECT id FROM user_sessions WHERE session_type_id = 2)
    """)

    # Restore web sessions back to user_sessions
    op.execute("""
        INSERT INTO user_sessions (
            user_id, session_type_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, created_at, last_heartbeat
        )
        SELECT
            user_id, 1 as session_type_id, ip_address, is_active, authenticated_at, auth_method,
            last_auth_refresh, device_fingerprint, created_at, last_heartbeat
        FROM web_sessions
        WHERE id NOT IN (SELECT id FROM user_sessions WHERE session_type_id = 1)
    """)

    # Drop indexes for web_sessions
    op.drop_index("ix_web_sessions_device_fingerprint", table_name="web_sessions")
    op.drop_index("ix_web_sessions_last_heartbeat", table_name="web_sessions")
    op.drop_index("ix_web_sessions_user_active", table_name="web_sessions")
    op.drop_index("ix_web_sessions_is_active", table_name="web_sessions")
    op.drop_index("ix_web_sessions_user_id", table_name="web_sessions")

    # Drop indexes for desktop_sessions
    op.drop_index("ix_desktop_sessions_app_version", table_name="desktop_sessions")
    op.drop_index("ix_desktop_sessions_device_fingerprint", table_name="desktop_sessions")
    op.drop_index("ix_desktop_sessions_last_heartbeat", table_name="desktop_sessions")
    op.drop_index("ix_desktop_sessions_user_active", table_name="desktop_sessions")
    op.drop_index("ix_desktop_sessions_is_active", table_name="desktop_sessions")
    op.drop_index("ix_desktop_sessions_user_id", table_name="desktop_sessions")

    # Drop tables
    op.drop_table("web_sessions")
    op.drop_table("desktop_sessions")
