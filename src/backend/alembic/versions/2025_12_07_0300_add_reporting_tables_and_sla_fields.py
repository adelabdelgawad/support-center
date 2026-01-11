"""Add reporting tables and SLA tracking fields.

Revision ID: 2025_12_07_0300_add_reporting_tables_and_sla_fields
Revises: 2025_12_07_0200_add_user_custom_views_table
Create Date: 2025-12-07 03:00:00.000000

This migration:
1. Adds SLA tracking fields to service_requests table:
   - sla_first_response_due: When first response SLA expires
   - sla_first_response_breached: Whether first response SLA was breached
   - sla_resolution_breached: Whether resolution SLA was breached
   - reopen_count: Number of times request was reopened

2. Creates sla_configs table for SLA configuration overrides

3. Creates technician_metrics_snapshots table for daily performance tracking

4. Creates report_configs table for saved/scheduled reports
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '2025_12_07_0300_add_reporting_tables_and_sla_fields'
down_revision = 'user_custom_views_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add SLA tracking fields to service_requests table
    op.add_column(
        'service_requests',
        sa.Column('sla_first_response_due', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        'service_requests',
        sa.Column('sla_first_response_breached', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column(
        'service_requests',
        sa.Column('sla_resolution_breached', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column(
        'service_requests',
        sa.Column('reopen_count', sa.Integer(), nullable=False, server_default='0')
    )

    # Create indexes for SLA breach filtering
    op.create_index(
        'ix_requests_sla_first_response_breached',
        'service_requests',
        ['sla_first_response_breached'],
        unique=False
    )
    op.create_index(
        'ix_requests_sla_resolution_breached',
        'service_requests',
        ['sla_resolution_breached'],
        unique=False
    )

    # 2. Create sla_configs table
    op.create_table(
        'sla_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('priority_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('business_unit_id', sa.Integer(), nullable=True),
        sa.Column('first_response_minutes', sa.Integer(), nullable=False),
        sa.Column('resolution_hours', sa.Integer(), nullable=False),
        sa.Column('business_hours_only', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['priority_id'], ['priorities.id'], ),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ),
        sa.ForeignKeyConstraint(['business_unit_id'], ['business_units.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('priority_id', 'category_id', 'business_unit_id', name='uq_sla_config_priority_category_bu')
    )
    op.create_index('ix_sla_configs_priority_id', 'sla_configs', ['priority_id'], unique=False)
    op.create_index('ix_sla_configs_category_id', 'sla_configs', ['category_id'], unique=False)
    op.create_index('ix_sla_configs_business_unit_id', 'sla_configs', ['business_unit_id'], unique=False)
    op.create_index('ix_sla_configs_is_active', 'sla_configs', ['is_active'], unique=False)

    # 3. Create technician_metrics_snapshots table
    op.create_table(
        'technician_metrics_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('technician_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('snapshot_date', sa.DateTime(), nullable=False),
        sa.Column('tickets_assigned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tickets_resolved', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tickets_reopened', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tickets_closed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('open_ticket_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_first_response_minutes', sa.Float(), nullable=True),
        sa.Column('min_first_response_minutes', sa.Float(), nullable=True),
        sa.Column('max_first_response_minutes', sa.Float(), nullable=True),
        sa.Column('avg_resolution_minutes', sa.Float(), nullable=True),
        sa.Column('min_resolution_minutes', sa.Float(), nullable=True),
        sa.Column('max_resolution_minutes', sa.Float(), nullable=True),
        sa.Column('sla_first_response_met', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sla_first_response_breached', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sla_resolution_met', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sla_resolution_breached', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sla_compliance_rate', sa.Float(), nullable=True),
        sa.Column('resolution_rate', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['technician_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('technician_id', 'snapshot_date', name='uq_technician_metrics_snapshot_date')
    )
    op.create_index('ix_tech_metrics_technician_id', 'technician_metrics_snapshots', ['technician_id'], unique=False)
    op.create_index('ix_tech_metrics_snapshot_date', 'technician_metrics_snapshots', ['snapshot_date'], unique=False)
    op.create_index('ix_tech_metrics_tech_date', 'technician_metrics_snapshots', ['technician_id', 'snapshot_date'], unique=False)

    # 4. Create report_configs table
    op.create_table(
        'report_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('report_type', sa.String(50), nullable=False),
        sa.Column('filters', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('display_config', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('schedule_cron', sa.String(100), nullable=True),
        sa.Column('recipients', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_report_configs_created_by_id', 'report_configs', ['created_by_id'], unique=False)
    op.create_index('ix_report_configs_report_type', 'report_configs', ['report_type'], unique=False)
    op.create_index('ix_report_configs_is_public', 'report_configs', ['is_public'], unique=False)
    op.create_index('ix_report_configs_is_active', 'report_configs', ['is_active'], unique=False)
    op.create_index('ix_report_configs_schedule', 'report_configs', ['schedule_cron'], unique=False)


def downgrade() -> None:
    # Drop report_configs table
    op.drop_index('ix_report_configs_schedule', table_name='report_configs')
    op.drop_index('ix_report_configs_is_active', table_name='report_configs')
    op.drop_index('ix_report_configs_is_public', table_name='report_configs')
    op.drop_index('ix_report_configs_report_type', table_name='report_configs')
    op.drop_index('ix_report_configs_created_by_id', table_name='report_configs')
    op.drop_table('report_configs')

    # Drop technician_metrics_snapshots table
    op.drop_index('ix_tech_metrics_tech_date', table_name='technician_metrics_snapshots')
    op.drop_index('ix_tech_metrics_snapshot_date', table_name='technician_metrics_snapshots')
    op.drop_index('ix_tech_metrics_technician_id', table_name='technician_metrics_snapshots')
    op.drop_table('technician_metrics_snapshots')

    # Drop sla_configs table
    op.drop_index('ix_sla_configs_is_active', table_name='sla_configs')
    op.drop_index('ix_sla_configs_business_unit_id', table_name='sla_configs')
    op.drop_index('ix_sla_configs_category_id', table_name='sla_configs')
    op.drop_index('ix_sla_configs_priority_id', table_name='sla_configs')
    op.drop_table('sla_configs')

    # Remove SLA tracking fields from service_requests
    op.drop_index('ix_requests_sla_resolution_breached', table_name='service_requests')
    op.drop_index('ix_requests_sla_first_response_breached', table_name='service_requests')
    op.drop_column('service_requests', 'reopen_count')
    op.drop_column('service_requests', 'sla_resolution_breached')
    op.drop_column('service_requests', 'sla_first_response_breached')
    op.drop_column('service_requests', 'sla_first_response_due')
