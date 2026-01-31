"""Rename tables for clarity - improve naming consistency.

Revision ID: 2025_12_06_2500_rename_tables
Revises: 2025_12_06_2400_remove_lookup_tables
Create Date: 2025-12-06 25:00:00.000000

This migration renames tables to improve clarity and consistency:

1. request_user_assigns → request_assignees (clearer purpose)
2. region_user_assigns → technician_regions (clarifies technicians only)
3. business_unit_user_assigns → technician_business_units (clarifies technicians only)
4. technician_section_assigns → technician_sections (shorter, clearer)
5. chat_read_monitors → chat_read_states (monitors implies active process, this is state)
6. resolutions → request_resolutions (clarifies relationship to requests)
7. service_request_notes → request_notes (shorter, context clear)

Column renames:
- request_user_assigns.user_id → request_assignees.assignee_id
- region_user_assigns.user_id → technician_regions.technician_id
- business_unit_user_assigns.user_id → technician_business_units.technician_id
- technician_section_assigns.user_id → technician_sections.technician_id
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '2025_12_06_2500_rename_tables'
down_revision = '2025_12_06_2400_remove_lookup_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename tables
    op.rename_table('request_user_assigns', 'request_assignees')
    op.rename_table('region_user_assigns', 'technician_regions')
    op.rename_table('business_unit_user_assigns', 'technician_business_units')
    op.rename_table('technician_section_assigns', 'technician_sections')
    op.rename_table('chat_read_monitors', 'chat_read_states')
    op.rename_table('resolutions', 'request_resolutions')
    op.rename_table('service_request_notes', 'request_notes')

    # Rename columns in request_assignees (was request_user_assigns)
    op.alter_column('request_assignees', 'user_id', new_column_name='assignee_id')

    # Rename columns in technician_regions (was region_user_assigns)
    op.alter_column('technician_regions', 'user_id', new_column_name='technician_id')

    # Rename columns in technician_business_units (was business_unit_user_assigns)
    op.alter_column('technician_business_units', 'user_id', new_column_name='technician_id')

    # Rename columns in technician_sections (was technician_section_assigns)
    op.alter_column('technician_sections', 'user_id', new_column_name='technician_id')

    # Rename indexes to match new table/column names
    # request_assignees indexes
    op.execute('ALTER INDEX IF EXISTS ix_request_user_assigns_request_id RENAME TO ix_request_assignees_request_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_user_assigns_user_id RENAME TO ix_request_assignees_assignee_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_user_assigns_assign_type_id RENAME TO ix_request_assignees_assign_type_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_user_assigns_unique RENAME TO ix_request_assignees_unique')
    op.execute('ALTER INDEX IF EXISTS ix_request_user_assigns_is_deleted RENAME TO ix_request_assignees_is_deleted')

    # technician_regions indexes
    op.execute('ALTER INDEX IF EXISTS ix_region_user_assigns_user_id RENAME TO ix_technician_regions_technician_id')
    op.execute('ALTER INDEX IF EXISTS ix_region_user_assigns_region_id RENAME TO ix_technician_regions_region_id')
    op.execute('ALTER INDEX IF EXISTS ix_region_user_assigns_unique RENAME TO ix_technician_regions_unique')
    op.execute('ALTER INDEX IF EXISTS ix_region_user_assigns_is_active RENAME TO ix_technician_regions_is_active')
    op.execute('ALTER INDEX IF EXISTS ix_region_user_assigns_is_deleted RENAME TO ix_technician_regions_is_deleted')

    # technician_business_units indexes
    op.execute('ALTER INDEX IF EXISTS ix_business_unit_user_assigns_user_id RENAME TO ix_technician_business_units_technician_id')
    op.execute('ALTER INDEX IF EXISTS ix_business_unit_user_assigns_business_unit_id RENAME TO ix_technician_business_units_business_unit_id')
    op.execute('ALTER INDEX IF EXISTS ix_business_unit_user_assigns_unique RENAME TO ix_technician_business_units_unique')
    op.execute('ALTER INDEX IF EXISTS ix_business_unit_user_assigns_is_active RENAME TO ix_technician_business_units_is_active')
    op.execute('ALTER INDEX IF EXISTS ix_business_unit_user_assigns_is_deleted RENAME TO ix_technician_business_units_is_deleted')

    # technician_sections indexes
    op.execute('ALTER INDEX IF EXISTS ix_technician_section_groups_user_id RENAME TO ix_technician_sections_technician_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_section_groups_section_id RENAME TO ix_technician_sections_section_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_section_groups_assigned_at RENAME TO ix_technician_sections_assigned_at')

    # chat_read_states indexes
    op.execute('ALTER INDEX IF EXISTS ix_chat_read_monitors_user_id RENAME TO ix_chat_read_states_user_id')
    op.execute('ALTER INDEX IF EXISTS ix_chat_read_monitors_request_id RENAME TO ix_chat_read_states_request_id')

    # request_resolutions indexes
    op.execute('ALTER INDEX IF EXISTS ix_resolutions_request_id RENAME TO ix_request_resolutions_request_id')
    op.execute('ALTER INDEX IF EXISTS ix_resolutions_created_at RENAME TO ix_request_resolutions_created_at')

    # request_notes indexes
    op.execute('ALTER INDEX IF EXISTS ix_service_request_notes_request_id RENAME TO ix_request_notes_request_id')
    op.execute('ALTER INDEX IF EXISTS ix_service_request_notes_created_by RENAME TO ix_request_notes_created_by')
    op.execute('ALTER INDEX IF EXISTS ix_service_request_notes_created_at RENAME TO ix_request_notes_created_at')

    # Rename constraints
    op.execute('ALTER CONSTRAINT ix_technician_section_groups_assigned_by_created_at ON technician_sections RENAME TO ix_technician_sections_assigned_by_created_at')


def downgrade() -> None:
    # Rename tables back
    op.rename_table('request_assignees', 'request_user_assigns')
    op.rename_table('technician_regions', 'region_user_assigns')
    op.rename_table('technician_business_units', 'business_unit_user_assigns')
    op.rename_table('technician_sections', 'technician_section_assigns')
    op.rename_table('chat_read_states', 'chat_read_monitors')
    op.rename_table('request_resolutions', 'resolutions')
    op.rename_table('request_notes', 'service_request_notes')

    # Rename columns back
    op.alter_column('request_user_assigns', 'assignee_id', new_column_name='user_id')
    op.alter_column('region_user_assigns', 'technician_id', new_column_name='user_id')
    op.alter_column('business_unit_user_assigns', 'technician_id', new_column_name='user_id')
    op.alter_column('technician_section_assigns', 'technician_id', new_column_name='user_id')

    # Rename indexes back (reverse order)
    op.execute('ALTER INDEX IF EXISTS ix_request_assignees_request_id RENAME TO ix_request_user_assigns_request_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_assignees_assignee_id RENAME TO ix_request_user_assigns_user_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_assignees_assign_type_id RENAME TO ix_request_user_assigns_assign_type_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_assignees_unique RENAME TO ix_request_user_assigns_unique')
    op.execute('ALTER INDEX IF EXISTS ix_request_assignees_is_deleted RENAME TO ix_request_user_assigns_is_deleted')

    op.execute('ALTER INDEX IF EXISTS ix_technician_regions_technician_id RENAME TO ix_region_user_assigns_user_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_regions_region_id RENAME TO ix_region_user_assigns_region_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_regions_unique RENAME TO ix_region_user_assigns_unique')
    op.execute('ALTER INDEX IF EXISTS ix_technician_regions_is_active RENAME TO ix_region_user_assigns_is_active')
    op.execute('ALTER INDEX IF EXISTS ix_technician_regions_is_deleted RENAME TO ix_region_user_assigns_is_deleted')

    op.execute('ALTER INDEX IF EXISTS ix_technician_business_units_technician_id RENAME TO ix_business_unit_user_assigns_user_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_business_units_business_unit_id RENAME TO ix_business_unit_user_assigns_business_unit_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_business_units_unique RENAME TO ix_business_unit_user_assigns_unique')
    op.execute('ALTER INDEX IF EXISTS ix_technician_business_units_is_active RENAME TO ix_business_unit_user_assigns_is_active')
    op.execute('ALTER INDEX IF EXISTS ix_technician_business_units_is_deleted RENAME TO ix_business_unit_user_assigns_is_deleted')

    op.execute('ALTER INDEX IF EXISTS ix_technician_sections_technician_id RENAME TO ix_technician_section_groups_user_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_sections_section_id RENAME TO ix_technician_section_groups_section_id')
    op.execute('ALTER INDEX IF EXISTS ix_technician_sections_assigned_at RENAME TO ix_technician_section_groups_assigned_at')

    op.execute('ALTER INDEX IF EXISTS ix_chat_read_states_user_id RENAME TO ix_chat_read_monitors_user_id')
    op.execute('ALTER INDEX IF EXISTS ix_chat_read_states_request_id RENAME TO ix_chat_read_monitors_request_id')

    op.execute('ALTER INDEX IF EXISTS ix_request_resolutions_request_id RENAME TO ix_resolutions_request_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_resolutions_created_at RENAME TO ix_resolutions_created_at')

    op.execute('ALTER INDEX IF EXISTS ix_request_notes_request_id RENAME TO ix_service_request_notes_request_id')
    op.execute('ALTER INDEX IF EXISTS ix_request_notes_created_by RENAME TO ix_service_request_notes_created_by')
    op.execute('ALTER INDEX IF EXISTS ix_request_notes_created_at RENAME TO ix_service_request_notes_created_at')
