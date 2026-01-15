"""add_categories_page_to_settings

Revision ID: 9b57ab75cbb9
Revises: 74d5a2d9ebf5
Create Date: 2026-01-15 21:31:10.619414

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '9b57ab75cbb9'
down_revision = '74d5a2d9ebf5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add Categories page to Settings menu and grant admin permissions."""

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

    # Check if Categories page already exists
    result = conn.execute(sa.text("""
        SELECT id FROM pages WHERE id = 20
    """))
    existing_page = result.fetchone()

    if not existing_page:
        # Insert Categories page
        conn.execute(sa.text("""
            INSERT INTO pages (
                id, title, description, icon, path, parent_id,
                is_active, is_deleted, created_by, updated_by,
                created_at, updated_at
            ) VALUES (
                20, 'Categories', 'Manage service request categories',
                'folder', 'setting/categories', 1,
                true, false, :admin_id, :admin_id,
                :now, :now
            )
        """), {
            'admin_id': admin_user_id,
            'now': datetime.utcnow()
        })
        print("✅ Created Categories page (ID: 20)")
    else:
        print("✅ Categories page already exists (ID: 20)")

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
        WHERE page_id = 20 AND role_id = :role_id
    """), {'role_id': admin_role_id})
    existing_permission = result.fetchone()

    if not existing_permission:
        # Grant permission to administrator role
        conn.execute(sa.text("""
            INSERT INTO page_roles (
                page_id, role_id, created_by, updated_by,
                is_active, is_deleted, created_at, updated_at
            ) VALUES (
                20, :role_id, :admin_id, :admin_id,
                true, false, :now, :now
            )
        """), {
            'role_id': admin_role_id,
            'admin_id': admin_user_id,
            'now': datetime.utcnow()
        })
        print("✅ Granted Categories page permission to administrator role")
    else:
        print("✅ Categories page permission already exists")


def downgrade() -> None:
    """Remove Categories page and its permissions."""

    conn = op.get_bind()

    # Remove page permissions
    conn.execute(sa.text("""
        DELETE FROM page_roles WHERE page_id = 20
    """))

    # Remove page
    conn.execute(sa.text("""
        DELETE FROM pages WHERE id = 20
    """))

    print("✅ Removed Categories page and permissions")