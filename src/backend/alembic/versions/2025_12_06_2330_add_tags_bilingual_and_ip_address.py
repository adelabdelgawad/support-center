"""Add Tags, bilingual support, and chat IP address.

Revision ID: 2025_12_06_2330_add_tags
Revises: 2025_12_06_add_bilingual_support_to_request_status_and_system_messages
Create Date: 2025-12-06 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '2025_12_06_2330_add_tags'
down_revision = 'f5f80e3e1dbd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add bilingual fields to categories table (nullable first)
    op.add_column('categories', sa.Column('name_en', sa.String(100), nullable=True))
    op.add_column('categories', sa.Column('name_ar', sa.String(100), nullable=True))

    # Populate name_en and name_ar from existing name field
    op.execute("UPDATE categories SET name_en = name, name_ar = name WHERE name_en IS NULL")

    # Make columns NOT NULL
    op.alter_column('categories', 'name_en', existing_type=sa.String(100), nullable=False)
    op.alter_column('categories', 'name_ar', existing_type=sa.String(100), nullable=False)

    # Add bilingual fields to subcategories table (nullable first)
    op.add_column('subcategories', sa.Column('name_en', sa.String(100), nullable=True))
    op.add_column('subcategories', sa.Column('name_ar', sa.String(100), nullable=True))

    # Populate name_en and name_ar from existing name field
    op.execute("UPDATE subcategories SET name_en = name, name_ar = name WHERE name_en IS NULL")

    # Make columns NOT NULL
    op.alter_column('subcategories', 'name_en', existing_type=sa.String(100), nullable=False)
    op.alter_column('subcategories', 'name_ar', existing_type=sa.String(100), nullable=False)

    # Add ip_address to chat_messages table
    op.add_column('chat_messages', sa.Column('ip_address', sa.String(45), nullable=True))

    # Create tags table
    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name_en', sa.String(100), nullable=False),
        sa.Column('name_ar', sa.String(100), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tags_category_id', 'tags', ['category_id'])
    op.create_index('ix_tags_is_active', 'tags', ['is_active'])
    op.create_index('ix_tags_is_deleted', 'tags', ['is_deleted'])

    # Add tag_id to service_requests table
    op.add_column('service_requests', sa.Column('tag_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_service_requests_tag_id', 'service_requests', 'tags', ['tag_id'], ['id'])
    op.create_index('ix_requests_tag_id', 'service_requests', ['tag_id'])

    # Drop old service_section_id constraint if it exists
    try:
        op.drop_index('ix_requests_service_section_id', table_name='service_requests')
    except:
        pass

    try:
        op.drop_constraint('fk_service_requests_service_section_id', 'service_requests', type_='foreignkey')
    except:
        pass

    # Drop service_section_id column
    try:
        op.drop_column('service_requests', 'service_section_id')
    except:
        pass


def downgrade() -> None:
    # Remove bilingual fields from categories
    op.drop_column('categories', 'name_ar')
    op.drop_column('categories', 'name_en')

    # Remove bilingual fields from subcategories
    op.drop_column('subcategories', 'name_ar')
    op.drop_column('subcategories', 'name_en')

    # Remove ip_address from chat_messages
    op.drop_column('chat_messages', 'ip_address')

    # Drop tags table
    op.drop_index('ix_tags_is_deleted', table_name='tags')
    op.drop_index('ix_tags_is_active', table_name='tags')
    op.drop_index('ix_tags_category_id', table_name='tags')
    op.drop_table('tags')

    # Drop tag_id
    op.drop_index('ix_requests_tag_id', table_name='service_requests')
    op.drop_constraint('fk_service_requests_tag_id', 'service_requests', type_='foreignkey')
    op.drop_column('service_requests', 'tag_id')

    # Add service_section_id back
    op.add_column('service_requests', sa.Column('service_section_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_service_requests_service_section_id', 'service_requests', 'service_sections', ['service_section_id'], ['id'])
    op.create_index('ix_requests_service_section_id', 'service_requests', ['service_section_id'])
