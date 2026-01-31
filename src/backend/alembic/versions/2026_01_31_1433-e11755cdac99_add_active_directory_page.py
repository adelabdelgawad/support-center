"""add_active_directory_page

Revision ID: e11755cdac99
Revises: b1a31caf3f2b
Create Date: 2026-01-31 14:33:50.140755

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'e11755cdac99'
down_revision = 'b1a31caf3f2b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert Active Directory page under Management parent (ID: 4)
    op.execute("""
        INSERT INTO pages (id, title, description, icon, path, parent_id, is_active, is_deleted, created_at, updated_at)
        SELECT
            46,
            'Active Directory',
            'Manage Active Directory server configurations',
            'dns',
            'management/active-directory',
            4,
            true,
            false,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        WHERE NOT EXISTS (SELECT 1 FROM pages WHERE id = 46);
    """)


def downgrade() -> None:
    # Remove Active Directory page
    op.execute("DELETE FROM pages WHERE id = 46;")