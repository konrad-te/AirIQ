"""add discord indoor medium-priority preference

Revision ID: r2s3t4u5v6w7
Revises: q1w2e3r4t5y6
Create Date: 2026-04-10

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "r2s3t4u5v6w7"
down_revision = "q1w2e3r4t5y6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "discord_indoor_include_medium_priority",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "discord_indoor_include_medium_priority")
