"""add_dashboard_and_portal_pages

Revision ID: c3a70234d95b
Revises: a1b2c3d4e5f7
Create Date: 2026-01-31 20:34:09.288478

Adds Dashboard and Portal pages to the navigation:
- Dashboard (ID: 5): Top-level page for technicians showing metrics and quick actions
- Portal (ID: 6): Top-level page for all users to download the client installer
"""
from alembic import op
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision = 'c3a70234d95b'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Get the admin user ID for created_by/updated_by fields
    conn = op.get_bind()

    # Get first super admin user
    result = conn.execute(
        text("SELECT id FROM users WHERE is_super_admin = true LIMIT 1")
    )
    admin_row = result.fetchone()

    if not admin_row:
        # Fallback: get any user
        result = conn.execute(text("SELECT id FROM users LIMIT 1"))
        admin_row = result.fetchone()

    if not admin_row:
        print("⚠️  No users found, skipping page creation")
        return

    admin_id = admin_row[0]

    # Insert Dashboard page (ID: 5)
    conn.execute(
        text("""
            INSERT INTO pages (id, title, description, icon, path, parent_id, is_active, is_deleted, created_by, updated_by, created_at, updated_at)
            VALUES (
                5,
                'Dashboard',
                'Dashboard with key metrics and quick actions for technicians',
                'dashboard',
                'dashboard',
                NULL,
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

    # Insert Portal page (ID: 6)
    conn.execute(
        text("""
            INSERT INTO pages (id, title, description, icon, path, parent_id, is_active, is_deleted, created_by, updated_by, created_at, updated_at)
            VALUES (
                6,
                'Portal',
                'Download portal for the IT Support Center desktop client',
                'download',
                'portal',
                NULL,
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

    # Grant access to Dashboard for all technician roles
    # Dashboard (ID: 5) should be accessible to technicians
    conn.execute(
        text("""
            INSERT INTO page_roles (page_id, role_id, created_by, updated_by, is_deleted, is_active, created_at, updated_at)
            SELECT 5, r.id, :admin_id, :admin_id, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM roles r
            WHERE r.name IN ('technician', 'supervisor', 'admin')
            ON CONFLICT (page_id, role_id) DO NOTHING
        """),
        {"admin_id": admin_id}
    )

    # Grant access to Portal for ALL roles (everyone can download the client)
    conn.execute(
        text("""
            INSERT INTO page_roles (page_id, role_id, created_by, updated_by, is_deleted, is_active, created_at, updated_at)
            SELECT 6, r.id, :admin_id, :admin_id, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM roles r
            ON CONFLICT (page_id, role_id) DO NOTHING
        """),
        {"admin_id": admin_id}
    )

    print("✅ Dashboard and Portal pages added successfully")


def downgrade() -> None:
    # Remove page-role permissions first
    conn = op.get_bind()
    conn.execute(text("DELETE FROM page_roles WHERE page_id IN (5, 6)"))

    # Remove pages
    conn.execute(text("DELETE FROM pages WHERE id IN (5, 6)"))

    print("✅ Dashboard and Portal pages removed")