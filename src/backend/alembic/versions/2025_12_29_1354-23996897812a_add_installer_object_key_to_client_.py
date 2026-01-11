"""add_installer_object_key_to_client_versions

Revision ID: 23996897812a
Revises: 76ee7415f40c
Create Date: 2025-12-29 13:54:18.231742+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "23996897812a"
down_revision = "76ee7415f40c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_versions",
        sa.Column("installer_object_key", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_versions", "installer_object_key")
