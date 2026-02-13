"""add_audit_logs_page

Revision ID: a1b2c3d4e5a7
Revises: f4ee3c6f5b79
Create Date: 2026-02-14 12:00:00.000000

Adds Audit Logs page (ID: 47) under Management parent (ID: 4).
Grants access to admin role only (super admin access is implicit).
"""
from alembic import op
from sqlalchemy.sql import text

revision = 'a1b2c3d4e5a7'
down_revision = '975b29dbdfa5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Get admin user for created_by
    result = conn.execute(
        text("SELECT id FROM users WHERE is_super_admin = true LIMIT 1")
    )
    admin_row = result.fetchone()

    if not admin_row:
        result = conn.execute(text("SELECT id FROM users LIMIT 1"))
        admin_row = result.fetchone()

    if not admin_row:
        print("⚠️  No users found, skipping Audit Logs page creation")
        return

    admin_id = admin_row[0]

    # Insert Audit Logs page (ID: 47) under Management (parent_id: 4)
    conn.execute(
        text("""
            INSERT INTO pages (id, title, description, icon, path, parent_id, is_active, is_deleted, created_by, updated_by, created_at, updated_at)
            VALUES (
                47,
                'Audit Logs',
                'View audit trail of all system actions',
                'history',
                'management/audit-logs',
                4,
                true,
                false,
                :admin_id,
                :admin_id,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (id) DO NOTHING
        """),
        {"admin_id": admin_id}
    )

    # Grant access to admin role only
    conn.execute(
        text("""
            INSERT INTO page_roles (page_id, role_id, created_by, updated_by, is_deleted, is_active, created_at, updated_at)
            SELECT 47, r.id, :admin_id, :admin_id, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM roles r
            WHERE r.name = 'admin'
            ON CONFLICT (page_id, role_id) DO NOTHING
        """),
        {"admin_id": admin_id}
    )

    print("✅ Audit Logs page added successfully")


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DELETE FROM page_roles WHERE page_id = 47"))
    conn.execute(text("DELETE FROM pages WHERE id = 47"))
    print("✅ Audit Logs page removed")
