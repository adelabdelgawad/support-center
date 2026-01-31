"""simplify_roles_to_three

Revision ID: 9700ff164cc0
Revises: 7929f4845fee
Create Date: 2026-01-31 15:09:08.530728

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '9700ff164cc0'
down_revision = '7929f4845fee'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Simplify role system to three roles: technician, supervisor, admin.

    Steps:
    1. Rename administrator → admin
    2. Migrate user_roles: senior → technician, auditor/manager → supervisor
    3. Migrate page_roles: senior → technician, auditor/manager → supervisor
    4. Delete unused roles: senior, auditor, manager
    """
    from sqlalchemy import text

    conn = op.get_bind()

    # Step 1: Rename administrator → admin
    op.execute("UPDATE roles SET name = 'admin' WHERE name = 'administrator'")

    # Get role IDs for migration
    technician_id = conn.execute(text("SELECT id FROM roles WHERE name = 'technician'")).scalar()
    supervisor_id = conn.execute(text("SELECT id FROM roles WHERE name = 'supervisor'")).scalar()

    # Step 2: Migrate user_roles assignments
    # senior → technician
    conn.execute(
        text("""
            UPDATE user_roles
            SET role_id = :technician_id
            WHERE role_id IN (SELECT id FROM roles WHERE name = 'senior')
        """),
        {'technician_id': technician_id}
    )

    # auditor → supervisor
    conn.execute(
        text("""
            UPDATE user_roles
            SET role_id = :supervisor_id
            WHERE role_id IN (SELECT id FROM roles WHERE name = 'auditor')
        """),
        {'supervisor_id': supervisor_id}
    )

    # manager → supervisor
    conn.execute(
        text("""
            UPDATE user_roles
            SET role_id = :supervisor_id
            WHERE role_id IN (SELECT id FROM roles WHERE name = 'manager')
        """),
        {'supervisor_id': supervisor_id}
    )

    # Step 3: Migrate page_roles assignments
    # Delete page_roles for 'senior' that would conflict with existing 'technician' entries
    conn.execute(
        text("""
            DELETE FROM page_roles
            WHERE role_id IN (SELECT id FROM roles WHERE name = 'senior')
            AND page_id IN (
                SELECT page_id FROM page_roles
                WHERE role_id = :technician_id
            )
        """),
        {'technician_id': technician_id}
    )

    # Now migrate remaining senior → technician
    conn.execute(
        text("""
            UPDATE page_roles
            SET role_id = :technician_id
            WHERE role_id IN (SELECT id FROM roles WHERE name = 'senior')
        """),
        {'technician_id': technician_id}
    )

    # Delete page_roles for 'auditor'/'manager' that would conflict with existing 'supervisor' entries
    conn.execute(
        text("""
            DELETE FROM page_roles
            WHERE role_id IN (SELECT id FROM roles WHERE name IN ('auditor', 'manager'))
            AND page_id IN (
                SELECT page_id FROM page_roles
                WHERE role_id = :supervisor_id
            )
        """),
        {'supervisor_id': supervisor_id}
    )

    # Now migrate remaining auditor/manager → supervisor
    conn.execute(
        text("""
            UPDATE page_roles
            SET role_id = :supervisor_id
            WHERE role_id IN (SELECT id FROM roles WHERE name IN ('auditor', 'manager'))
        """),
        {'supervisor_id': supervisor_id}
    )

    # Step 4: Hard delete unused roles
    op.execute("DELETE FROM roles WHERE name IN ('senior', 'auditor', 'manager')")


def downgrade() -> None:
    """
    Reverse the role simplification.

    Note: This downgrade recreates the old roles but cannot restore the exact
    user_roles and page_roles assignments that were migrated.
    """

    # Rename admin back to administrator
    op.execute("UPDATE roles SET name = 'administrator' WHERE name = 'admin'")

    # Recreate deleted roles
    op.execute("""
        INSERT INTO roles (name, is_deleted)
        VALUES
            ('senior', false),
            ('auditor', false),
            ('manager', false)
    """)