"""remove_subcategories_page_from_settings

Revision ID: 8497517e9f53
Revises: 73ccdb1ae9f3
Create Date: 2026-01-15 22:24:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = '8497517e9f53'
down_revision = '73ccdb1ae9f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Remove Subcategories page from Settings menu."""

    conn = op.get_bind()

    # Remove page permissions first (foreign key constraint)
    conn.execute(sa.text("""
        DELETE FROM page_roles WHERE page_id = 22
    """))
    print("✅ Removed Subcategories page permissions")

    # Remove the page
    conn.execute(sa.text("""
        DELETE FROM pages WHERE id = 22
    """))
    print("✅ Removed Subcategories page")


def downgrade() -> None:
    """Re-add Subcategories page to Settings menu."""

    conn = op.get_bind()
    from datetime import datetime

    # Get admin user ID
    result = conn.execute(sa.text("""
        SELECT id FROM users WHERE is_super_admin = true LIMIT 1
    """))
    admin_user = result.fetchone()

    if not admin_user:
        print("⚠️  No admin user found, skipping page restoration")
        return

    admin_user_id = admin_user[0]

    # Re-insert Subcategories page
    conn.execute(sa.text("""
        INSERT INTO pages (
            id, title, description, icon, path, parent_id,
            is_active, is_deleted, created_by, updated_by,
            created_at, updated_at
        ) VALUES (
            22, 'Subcategories', 'Manage service request subcategories',
            'folder_open', 'setting/subcategories', 1,
            true, false, :admin_id, :admin_id,
            :now, :now
        )
    """), {
        'admin_id': admin_user_id,
        'now': datetime.utcnow()
    })
    print("✅ Restored Subcategories page")

    # Get administrator role ID
    result = conn.execute(sa.text("""
        SELECT id FROM roles WHERE name = 'administrator' LIMIT 1
    """))
    admin_role = result.fetchone()

    if admin_role:
        admin_role_id = admin_role[0]

        # Restore permission
        conn.execute(sa.text("""
            INSERT INTO page_roles (
                page_id, role_id, created_by, updated_by,
                is_active, is_deleted, created_at, updated_at
            ) VALUES (
                22, :role_id, :admin_id, :admin_id,
                true, false, :now, :now
            )
        """), {
            'role_id': admin_role_id,
            'admin_id': admin_user_id,
            'now': datetime.utcnow()
        })
        print("✅ Restored Subcategories page permissions")
