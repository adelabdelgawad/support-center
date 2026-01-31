"""add_active_directory_page_permissions

Revision ID: 8578985fbd5c
Revises: e11755cdac99
Create Date: 2026-01-31 14:34:44.904400

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '8578985fbd5c'
down_revision = 'e11755cdac99'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add Active Directory page permission for administrator role
    op.execute("""
        INSERT INTO page_roles (role_id, page_id, is_active, is_deleted, created_at, updated_at)
        SELECT
            r.id,
            46,
            true,
            false,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM roles r
        WHERE r.name = 'administrator'
        AND NOT EXISTS (
            SELECT 1 FROM page_roles pr
            WHERE pr.role_id = r.id AND pr.page_id = 46
        );
    """)


def downgrade() -> None:
    # Remove Active Directory page permissions
    op.execute("DELETE FROM page_roles WHERE page_id = 46;")