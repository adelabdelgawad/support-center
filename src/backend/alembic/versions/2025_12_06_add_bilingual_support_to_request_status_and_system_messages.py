"""Add bilingual support to request_status and create system_messages table."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bilingual_support_v1'
down_revision = '7749c10dd26b'
branch_labels = None
depends_on = None


def upgrade():
    """Add bilingual fields to request_statuses and create system_messages table."""

    # 1. Add bilingual columns to request_statuses (nullable initially)
    op.add_column('request_statuses',
        sa.Column('name_en', sa.String(100), nullable=True))
    op.add_column('request_statuses',
        sa.Column('name_ar', sa.String(100), nullable=True))

    # 2. Data migration: Copy existing 'name' to both name_en and name_ar
    op.execute("""
        UPDATE request_statuses
        SET name_en = name,
            name_ar = name
        WHERE name_en IS NULL OR name_ar IS NULL
    """)

    # 3. Make columns non-nullable
    op.alter_column('request_statuses', 'name_en', nullable=False)
    op.alter_column('request_statuses', 'name_ar', nullable=False)

    # 4. Create system_messages table
    op.create_table('system_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message_type', sa.String(50), nullable=False),
        sa.Column('template_en', sa.String(500), nullable=False),
        sa.Column('template_ar', sa.String(500), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_type', name='uq_system_messages_message_type')
    )

    # 5. Create indexes
    op.create_index('ix_system_messages_message_type', 'system_messages', ['message_type'], unique=True)
    op.create_index('ix_system_messages_is_active', 'system_messages', ['is_active'])

    # 6. Seed system messages table with common templates
    op.execute("""
        INSERT INTO system_messages (message_type, template_en, template_ar, is_active) VALUES
        ('status_change',
         'Request status changed from ''{old_status}'' to ''{new_status}''',
         'تم تغيير حالة الطلب من ''{old_status}'' إلى ''{new_status}''',
         true),
        ('assignment_change',
         'Request assigned to {technician_name}',
         'تم تعيين الطلب إلى {technician_name}',
         true),
        ('resolution_added',
         'Resolution added',
         'تمت إضافة الحل',
         true)
    """)


def downgrade():
    """Reverse the migration."""

    # 1. Drop system_messages table
    op.drop_table('system_messages')

    # 2. Drop bilingual columns from request_statuses
    op.drop_column('request_statuses', 'name_ar')
    op.drop_column('request_statuses', 'name_en')
