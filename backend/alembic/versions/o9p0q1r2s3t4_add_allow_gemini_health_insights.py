"""add allow_gemini_health_insights to user_preferences

Revision ID: o9p0q1r2s3t4
Revises: n7o8p9q0r1s2
Create Date: 2026-04-07

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "o9p0q1r2s3t4"
down_revision = "n7o8p9q0r1s2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "allow_gemini_health_insights",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "allow_gemini_health_insights")
