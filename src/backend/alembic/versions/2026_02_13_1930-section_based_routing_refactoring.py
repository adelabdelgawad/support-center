"""section_based_routing_refactoring

Revision ID: i9j8k7l6m5n4
Revises: h3i4j5k6l7m1
Create Date: 2026-02-13 19:30:00.000000

This migration implements the section-based routing refactoring:
1. Drops tags table and all references
2. Drops technician_regions table
3. Renames service_sections → sections
4. Adds section_id to request_types
5. Populates section_id data

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "i9j8k7l6m5n4"
down_revision: Union[str, None] = "h3i4j5k6l7m1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop tag_id foreign key, column, and index from service_requests
    op.drop_index("ix_requests_tag_id", table_name="service_requests")
    op.drop_constraint(
        "fk_service_requests_tag_id",
        "service_requests",
        type_="foreignkey",
    )
    op.drop_column("service_requests", "tag_id")

    # 2. Drop tags table
    op.drop_table("tags")

    # 3. Drop technician_regions table
    op.drop_table("technician_regions")

    # 4. Rename service_sections → sections
    # First drop foreign key constraints on child tables
    op.drop_constraint(
        "categories_section_id_fkey",
        "categories",
        type_="foreignkey",
    )
    op.drop_constraint(
        "service_requests_assigned_to_section_id_fkey",
        "service_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        "technician_sections_section_id_fkey",
        "technician_sections",
        type_="foreignkey",
    )

    # Rename the table
    op.rename_table("service_sections", "sections")

    # Recreate foreign key constraints with new table name
    op.create_foreign_key(
        "categories_section_id_fkey",
        "categories",
        "sections",
        ["section_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "service_requests_assigned_to_section_id_fkey",
        "service_requests",
        "sections",
        ["assigned_to_section_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "technician_sections_section_id_fkey",
        "technician_sections",
        "sections",
        ["section_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Rename indexes
    op.drop_index("ix_service_sections_name", table_name="sections")
    op.create_index("ix_sections_name", "sections", ["name"], unique=True)
    op.drop_index("ix_service_sections_is_active", table_name="sections")
    op.create_index("ix_sections_is_active", "sections", ["is_active"])
    op.drop_index("ix_service_sections_is_deleted", table_name="sections")
    op.create_index("ix_sections_is_deleted", "sections", ["is_deleted"])
    op.drop_index("ix_service_sections_is_shown", table_name="sections")
    op.create_index("ix_sections_is_shown", "sections", ["is_shown"])

    # 5. Add section_id column to request_types
    op.add_column(
        "request_types",
        sa.Column(
            "section_id",
            sa.Integer(),
            sa.ForeignKey("sections.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # Create index for section_id
    op.create_index("ix_request_types_section_id", "request_types", ["section_id"])

    # 6. Data migration: populate section_id on request_types
    op.execute("""
        UPDATE request_types
        SET section_id = 1
        WHERE id = 1
    """)
    op.execute("""
        UPDATE request_types
        SET section_id = 3
        WHERE id = 2
    """)
    op.execute("""
        UPDATE request_types
        SET section_id = 2
        WHERE id = 3
    """)

    # 7. Data migration: populate section_id on categories
    op.execute("""
        UPDATE categories
        SET section_id = 3
        WHERE id IN (1, 2, 6)
    """)
    op.execute("""
        UPDATE categories
        SET section_id = 1
        WHERE id IN (3, 5, 9)
    """)
    op.execute("""
        UPDATE categories
        SET section_id = 2
        WHERE id IN (4, 7, 8)
    """)


def downgrade() -> None:
    # Reverse step 7: Clear section_id from categories
    op.execute("""
        UPDATE categories
        SET section_id = NULL
        WHERE section_id IS NOT NULL
    """)

    # Reverse step 6: Clear section_id from request_types
    op.execute("""
        UPDATE request_types
        SET section_id = NULL
        WHERE section_id IS NOT NULL
    """)

    # Reverse step 5: Drop section_id from request_types
    op.drop_index("ix_request_types_section_id", table_name="request_types")
    op.drop_column("request_types", "section_id")

    # Reverse step 4: Rename sections → service_sections
    # Drop foreign key constraints
    op.drop_constraint(
        "categories_section_id_fkey",
        "categories",
        type_="foreignkey",
    )
    op.drop_constraint(
        "service_requests_assigned_to_section_id_fkey",
        "service_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        "technician_sections_section_id_fkey",
        "technician_sections",
        type_="foreignkey",
    )

    # Rename the table back
    op.rename_table("sections", "service_sections")

    # Recreate foreign key constraints with old table name
    op.create_foreign_key(
        "categories_section_id_fkey",
        "categories",
        "service_sections",
        ["section_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "service_requests_assigned_to_section_id_fkey",
        "service_requests",
        "service_sections",
        ["assigned_to_section_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "technician_sections_section_id_fkey",
        "technician_sections",
        "service_sections",
        ["section_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Restore old indexes
    op.drop_index("ix_sections_name", table_name="service_sections")
    op.create_index(
        "ix_service_sections_name", "service_sections", ["name"], unique=True
    )
    op.drop_index("ix_sections_is_active", table_name="service_sections")
    op.create_index("ix_service_sections_is_active", "service_sections", ["is_active"])
    op.drop_index("ix_sections_is_deleted", table_name="service_sections")
    op.create_index(
        "ix_service_sections_is_deleted", "service_sections", ["is_deleted"]
    )
    op.drop_index("ix_sections_is_shown", table_name="service_sections")
    op.create_index("ix_service_sections_is_shown", "service_sections", ["is_shown"])

    # Reverse step 3: Recreate technician_regions table (if needed)
    # Note: technician_regions table structure was removed, so we won't recreate it in downgrade

    # Reverse step 2: Recreate tags table (if needed)
    # Note: tags table structure was removed, so we won't recreate it in downgrade

    # Reverse step 1: Add back tag_id to service_requests
    # Note: tags table structure was removed, so we won't recreate it in downgrade
