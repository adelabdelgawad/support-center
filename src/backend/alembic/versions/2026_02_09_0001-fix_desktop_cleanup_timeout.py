"""relax desktop session cleanup to 24h (Redis is authoritative for presence)

Revision ID: f1a2b3c4d5e9
Revises: a2b3c4d5e6f8
Create Date: 2026-02-09 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e9"
down_revision: Union[str, None] = "a2b3c4d5e6f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Phase 4: Redis TTL-based presence is authoritative for real-time online status.
    # DB cleanup is now DB hygiene only — clean up sessions inactive for 24h.
    op.execute("""
        UPDATE scheduled_jobs
        SET task_args = '{"timeout_minutes": 1440}'::jsonb
        WHERE id = '550e8400-e29b-41d4-a716-446655440003'
          AND name = 'Desktop Session Cleanup (Every Minute)'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE scheduled_jobs
        SET task_args = '{"timeout_minutes": 2}'::jsonb
        WHERE id = '550e8400-e29b-41d4-a716-446655440003'
          AND name = 'Desktop Session Cleanup (Every Minute)'
    """)
