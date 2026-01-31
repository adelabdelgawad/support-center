"""update_request_types_bilingual_fields

Revision ID: 50b1e04ee3f7
Revises: 0d75041e2e23
Create Date: 2025-12-26 05:38:58.573985+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "50b1e04ee3f7"
down_revision = "0d75041e2e23"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Add new columns as NULLABLE first
    op.add_column(
        "request_types", sa.Column("name_en", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "request_types", sa.Column("name_ar", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "request_types", sa.Column("brief_en", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "request_types", sa.Column("brief_ar", sa.String(length=500), nullable=True)
    )

    # Step 2: Migrate existing data - copy name to name_en, description to brief_en
    # Set default Arabic names and briefs
    op.execute("""
        UPDATE request_types
        SET name_en = name,
            name_ar = CASE
                WHEN name = 'Incident' THEN 'حادث'
                WHEN name = 'Service Request' THEN 'طلب خدمة'
                WHEN name = 'Problem' THEN 'مشكلة'
                WHEN name = 'Change Request' THEN 'طلب تغيير'
                WHEN name = 'Access Request' THEN 'طلب وصول'
                ELSE name
            END,
            brief_en = description,
            brief_ar = CASE
                WHEN name = 'Incident' THEN 'انقطاع أو تراجع غير مخطط له في جودة خدمة تقنية المعلومات'
                WHEN name = 'Service Request' THEN 'طلب رسمي من المستخدم لتقديم أو تنفيذ شيء ما'
                WHEN name = 'Problem' THEN 'سبب لحادث واحد أو أكثر، يتطلب تحقيقاً'
                WHEN name = 'Change Request' THEN 'طلب لتعديل البنية التحتية أو الخدمات التقنية'
                WHEN name = 'Access Request' THEN 'طلب للوصول إلى الأنظمة أو التطبيقات أو الموارد'
                ELSE NULL
            END
    """)

    # Step 3: Make name_en and name_ar NOT NULL after data migration
    op.alter_column("request_types", "name_en", nullable=False)
    op.alter_column("request_types", "name_ar", nullable=False)

    # Step 4: Drop old indexes and constraints
    op.drop_index(op.f("ix_request_types_name"), table_name="request_types")
    op.drop_constraint("request_types_name_key", "request_types", type_="unique")

    # Step 5: Create new indexes
    op.create_index(
        "ix_request_types_name_ar", "request_types", ["name_ar"], unique=False
    )
    op.create_index(
        "ix_request_types_name_en", "request_types", ["name_en"], unique=False
    )

    # Step 6: Drop old columns
    op.drop_column("request_types", "name")
    op.drop_column("request_types", "description")


def downgrade() -> None:
    # Add back old columns
    op.add_column(
        "request_types",
        sa.Column(
            "description", sa.VARCHAR(length=500), autoincrement=False, nullable=True
        ),
    )
    op.add_column(
        "request_types",
        sa.Column("name", sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    )

    # Migrate data back
    op.execute("""
        UPDATE request_types
        SET name = name_en,
            description = brief_en
    """)

    # Make name NOT NULL
    op.alter_column("request_types", "name", nullable=False)

    # Restore indexes
    op.drop_index("ix_request_types_name_en", table_name="request_types")
    op.drop_index("ix_request_types_name_ar", table_name="request_types")
    op.create_unique_constraint(
        "request_types_name_key",
        "request_types",
        ["name"],
    )
    op.create_index(
        op.f("ix_request_types_name"), "request_types", ["name"], unique=True
    )

    # Drop new columns
    op.drop_column("request_types", "brief_ar")
    op.drop_column("request_types", "brief_en")
    op.drop_column("request_types", "name_ar")
    op.drop_column("request_types", "name_en")
