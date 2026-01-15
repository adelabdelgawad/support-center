"""add_subcategories_page_to_settings

Revision ID: 73ccdb1ae9f3
Revises: 9b57ab75cbb9
Create Date: 2026-01-15 22:14:14.012675

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '73ccdb1ae9f3'
down_revision = '9b57ab75cbb9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add Subcategories page to Settings menu and grant admin permissions."""

    # Get connection
    conn = op.get_bind()

    # Get admin user ID (first user with is_super_admin=true)
    result = conn.execute(sa.text("""
        SELECT id FROM users WHERE is_super_admin = true LIMIT 1
    """))
    admin_user = result.fetchone()

    if not admin_user:
        print("⚠️  No admin user found, skipping page creation")
        return

    admin_user_id = admin_user[0]

    # Check if Subcategories page already exists
    result = conn.execute(sa.text("""
        SELECT id FROM pages WHERE id = 22
    """))
    existing_page = result.fetchone()

    if not existing_page:
        # Insert Subcategories page
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
        print("✅ Created Subcategories page (ID: 22)")
    else:
        print("✅ Subcategories page already exists (ID: 22)")

    # Get administrator role ID
    result = conn.execute(sa.text("""
        SELECT id FROM roles WHERE name = 'administrator' LIMIT 1
    """))
    admin_role = result.fetchone()

    if not admin_role:
        print("⚠️  Administrator role not found, skipping permissions")
        return

    admin_role_id = admin_role[0]

    # Check if permission already exists
    result = conn.execute(sa.text("""
        SELECT id FROM page_roles
        WHERE page_id = 22 AND role_id = :role_id
    """), {'role_id': admin_role_id})
    existing_permission = result.fetchone()

    if not existing_permission:
        # Grant permission to administrator role
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
        print("✅ Granted Subcategories page permission to administrator role")
    else:
        print("✅ Subcategories page permission already exists")


def downgrade() -> None:
    """Remove Subcategories page and its permissions."""

    conn = op.get_bind()

    # Remove page permissions
    conn.execute(sa.text("""
        DELETE FROM page_roles WHERE page_id = 22
    """))

    # Remove page
    conn.execute(sa.text("""
        DELETE FROM pages WHERE id = 22
    """))

    print("✅ Removed Subcategories page and permissions")
