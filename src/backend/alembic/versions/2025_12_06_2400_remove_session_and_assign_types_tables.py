"""Remove session_types and assign_types tables - replaced with enums.

Revision ID: 2025_12_06_2400_remove_lookup_tables
Revises: 2025_12_06_2330_add_tags
Create Date: 2025-12-06 24:00:00.000000

This migration:
1. Drops the foreign key constraint from user_sessions.session_type_id to session_types.id
2. Drops the foreign key constraint from request_user_assigns.assign_type_id to assign_types.id
3. Drops the session_types table
4. Drops the assign_types table

The session_type_id and assign_type_id columns remain as simple integers.
Values are now validated by enums in db.enums:
- SessionType: WEB=1, DESKTOP=2, MOBILE=3
- AssignType: TECHNICIAN=1, CC=2
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2025_12_06_2400_remove_lookup_tables'
down_revision = '2025_12_06_2330_add_tags'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Drop the foreign key constraint from user_sessions to session_types
    # The constraint name may vary, so we use batch_alter_table for SQLite compatibility
    # and naming conventions for PostgreSQL

    # Drop FK from user_sessions.session_type_id
    op.drop_constraint(
        'user_sessions_session_type_id_fkey',
        'user_sessions',
        type_='foreignkey'
    )

    # Drop FK from request_user_assigns.assign_type_id
    op.drop_constraint(
        'request_user_assigns_assign_type_id_fkey',
        'request_user_assigns',
        type_='foreignkey'
    )

    # Step 2: Drop the lookup tables (now replaced by enums)
    op.drop_table('session_types')
    op.drop_table('assign_types')


def downgrade() -> None:
    # Recreate the session_types table
    op.create_table(
        'session_types',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='ix_session_types_name')
    )

    # Recreate the assign_types table
    op.create_table(
        'assign_types',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='ix_assign_types_name'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ),
    )
    op.create_index('ix_assign_types_is_active', 'assign_types', ['is_active'])
    op.create_index('ix_assign_types_is_deleted', 'assign_types', ['is_deleted'])

    # Insert default session_types data
    op.execute("""
        INSERT INTO session_types (id, name, description) VALUES
        (1, 'web', 'Browser-based session'),
        (2, 'desktop', 'Desktop application session'),
        (3, 'mobile', 'Mobile application session')
    """)

    # Insert default assign_types data
    op.execute("""
        INSERT INTO assign_types (id, name, description, is_active) VALUES
        (1, 'technician', 'Technical staff assigned to resolve the request', true),
        (2, 'cc', 'User copied on request updates', true)
    """)

    # Recreate foreign key constraints
    op.create_foreign_key(
        'user_sessions_session_type_id_fkey',
        'user_sessions',
        'session_types',
        ['session_type_id'],
        ['id']
    )

    op.create_foreign_key(
        'request_user_assigns_assign_type_id_fkey',
        'request_user_assigns',
        'assign_types',
        ['assign_type_id'],
        ['id']
    )
