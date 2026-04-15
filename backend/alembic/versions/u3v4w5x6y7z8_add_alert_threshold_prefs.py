"""add weather and indoor alert threshold preferences

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-04-14
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "u3v4w5x6y7z8"
down_revision = "t2u3v4w5x6y7"
branch_labels = None
depends_on = None

_COLUMNS = (
    "outdoor_temp_high_c",
    "uv_high_threshold",
    "indoor_co2_medium_ppm",
    "indoor_co2_high_ppm",
    "indoor_humidity_low_pct",
    "indoor_humidity_high_pct",
    "indoor_temp_hot_c",
    "indoor_temp_cold_c",
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
