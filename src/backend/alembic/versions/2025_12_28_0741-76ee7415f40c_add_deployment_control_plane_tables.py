"""add_deployment_control_plane_tables

Revision ID: 76ee7415f40c
Revises: 6c40f62294d7
Create Date: 2025-12-28 07:41:00.000000+00:00

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "76ee7415f40c"
down_revision = "6c40f62294d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create devices table
    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("mac_address", sa.String(length=17), nullable=True),
        sa.Column(
            "lifecycle_state",
            sa.String(length=50),
            server_default=sa.text("'discovered'"),
            nullable=False,
        ),
        sa.Column("discovery_source", sa.String(length=50), nullable=False),
        sa.Column("ad_computer_dn", sa.String(length=500), nullable=True),
        sa.Column("desktop_session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["desktop_session_id"],
            ["desktop_sessions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_devices_hostname", "devices", ["hostname"], unique=False)
    op.create_index(
        "ix_devices_lifecycle_state", "devices", ["lifecycle_state"], unique=False
    )
    op.create_index(
        "ix_devices_discovery_source", "devices", ["discovery_source"], unique=False
    )
    op.create_index("ix_devices_created_at", "devices", ["created_at"], unique=False)
    op.create_index(
        "ix_devices_desktop_session_id",
        "devices",
        ["desktop_session_id"],
        unique=False,
    )
    op.create_index(
        "ix_devices_state_source",
        "devices",
        ["lifecycle_state", "discovery_source"],
        unique=False,
    )

    # Create deployment_jobs table
    op.create_table(
        "deployment_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_type", sa.String(length=100), nullable=False),
        sa.Column(
            "status",
            sa.String(length=50),
            server_default=sa.text("'queued'"),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("claimed_by", sa.String(length=255), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("result", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_deployment_jobs_status", "deployment_jobs", ["status"], unique=False
    )
    op.create_index(
        "ix_deployment_jobs_job_type", "deployment_jobs", ["job_type"], unique=False
    )
    op.create_index(
        "ix_deployment_jobs_created_at",
        "deployment_jobs",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_deployment_jobs_status_created",
        "deployment_jobs",
        ["status", "created_at"],
        unique=False,
    )

    # Create credentials table
    op.create_table(
        "credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("credential_type", sa.String(length=50), nullable=False),
        sa.Column("scope", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("vault_ref", sa.String(length=500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column(
            "enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_credentials_name", "credentials", ["name"], unique=False)
    op.create_index(
        "ix_credentials_type", "credentials", ["credential_type"], unique=False
    )
    op.create_index("ix_credentials_enabled", "credentials", ["enabled"], unique=False)
    op.create_index(
        "ix_credentials_created_at", "credentials", ["created_at"], unique=False
    )


def downgrade() -> None:
    # Drop credentials table
    op.drop_index("ix_credentials_created_at", table_name="credentials")
    op.drop_index("ix_credentials_enabled", table_name="credentials")
    op.drop_index("ix_credentials_type", table_name="credentials")
    op.drop_index("ix_credentials_name", table_name="credentials")
    op.drop_table("credentials")

    # Drop deployment_jobs table
    op.drop_index("ix_deployment_jobs_status_created", table_name="deployment_jobs")
    op.drop_index("ix_deployment_jobs_created_at", table_name="deployment_jobs")
    op.drop_index("ix_deployment_jobs_job_type", table_name="deployment_jobs")
    op.drop_index("ix_deployment_jobs_status", table_name="deployment_jobs")
    op.drop_table("deployment_jobs")

    # Drop devices table
    op.drop_index("ix_devices_state_source", table_name="devices")
    op.drop_index("ix_devices_desktop_session_id", table_name="devices")
    op.drop_index("ix_devices_created_at", table_name="devices")
    op.drop_index("ix_devices_discovery_source", table_name="devices")
    op.drop_index("ix_devices_lifecycle_state", table_name="devices")
    op.drop_index("ix_devices_hostname", table_name="devices")
    op.drop_table("devices")
