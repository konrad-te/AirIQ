"""add per-user PM threshold preferences

Revision ID: t2u3v4w5x6y7
Revises: s1t2r3a4v5a6
Create Date: 2026-04-14
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "t2u3v4w5x6y7"
down_revision = "s1t2r3a4v5a6"
branch_labels = None
depends_on = None

_COLUMNS = (
    "pm25_medium_threshold",
    "pm25_high_threshold",
    "pm25_critical_threshold",
    "pm10_medium_threshold",
    "pm10_high_threshold",
    "pm10_critical_threshold",
)


def upgrade() -> None:
    for col in _COLUMNS:
        op.add_column(
            "user_preferences",
            sa.Column(col, sa.Float(), nullable=True),
        )


def downgrade() -> None:
    for col in reversed(_COLUMNS):
        op.drop_column("user_preferences", col)
