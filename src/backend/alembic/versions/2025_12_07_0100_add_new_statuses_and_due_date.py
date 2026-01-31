"""Add new ticket statuses and due_date field to service_requests.

Revision ID: 2025_12_07_0100_add_new_statuses_and_due_date
Revises: 2025_12_06_2700_add_composite_indexes
Create Date: 2025-12-07 01:00:00.000000

This migration:
1. Adds 3 new ticket statuses for improved workflow:
   - pending-subtask (ID 6): Waiting for a sub-task to be completed
   - pending-requester-response (ID 7): Waiting for requester to respond
   - in-progress (ID 8): Being actively worked on by a technician

2. Adds due_date column to service_requests table for SLA tracking
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '2025_12_07_0100_add_new_statuses_and_due_date'
down_revision = '2025_12_06_2700_add_composite_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new statuses to request_statuses table
    # Using raw SQL for data insertion
    request_statuses = sa.table(
        'request_statuses',
        sa.column('id', sa.Integer),
        sa.column('name', sa.String),
        sa.column('name_en', sa.String),
        sa.column('name_ar', sa.String),
        sa.column('description', sa.String),
        sa.column('color', sa.String),
        sa.column('readonly', sa.Boolean),
        sa.column('is_active', sa.Boolean),
        sa.column('count_as_solved', sa.Boolean),
        sa.column('created_at', sa.DateTime),
        sa.column('updated_at', sa.DateTime),
    )

    # Get current timestamp for created_at and updated_at
    now = datetime.utcnow()

    # Insert new statuses (checking for existence is handled by unique constraint)
    new_statuses = [
        {
            'id': 6,
            'name': 'pending-subtask',
            'name_en': 'Pending Sub-Task',
            'name_ar': 'في انتظار مهمة فرعية',
            'description': 'Request is waiting for a sub-task to be completed',
            'color': 'orange',
            'readonly': True,
            'is_active': True,
            'count_as_solved': False,
            'created_at': now,
            'updated_at': now,
        },
        {
            'id': 7,
            'name': 'pending-requester-response',
            'name_en': 'Pending Requester Response',
            'name_ar': 'في انتظار رد مقدم الطلب',
            'description': 'Request is waiting for requester to respond',
            'color': 'purple',
            'readonly': True,
            'is_active': True,
            'count_as_solved': False,
            'created_at': now,
            'updated_at': now,
        },
        {
            'id': 8,
            'name': 'in-progress',
            'name_en': 'In Progress',
            'name_ar': 'قيد التنفيذ',
            'description': 'Request is being actively worked on by a technician',
            'color': 'cyan',
            'readonly': True,
            'is_active': True,
            'count_as_solved': False,
            'created_at': now,
            'updated_at': now,
        },
    ]

    # Insert statuses one by one, checking for existence
    conn = op.get_bind()
    for status in new_statuses:
        # Check if status already exists
        result = conn.execute(
            sa.text("SELECT id FROM request_statuses WHERE id = :id"),
            {'id': status['id']}
        )
        if result.fetchone() is None:
            op.execute(
                request_statuses.insert().values(**status)
            )

    # 2. Add due_date column to service_requests table
    op.add_column(
        'service_requests',
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True)
    )

    # 3. Create index on due_date for filtering overdue requests
    op.create_index(
        'ix_service_requests_due_date',
        'service_requests',
        ['due_date'],
        unique=False
    )

    # 4. Create composite index for SLA views (due_date with status)
    op.create_index(
        'ix_requests_due_date_status',
        'service_requests',
        ['due_date', 'status_id'],
        unique=False
    )


def downgrade() -> None:
    # Remove indexes
    op.drop_index('ix_requests_due_date_status', table_name='service_requests')
    op.drop_index('ix_service_requests_due_date', table_name='service_requests')

    # Remove due_date column
    op.drop_column('service_requests', 'due_date')

    # Remove new statuses (IDs 6, 7, 8)
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM request_statuses WHERE id IN (6, 7, 8)")
    )
