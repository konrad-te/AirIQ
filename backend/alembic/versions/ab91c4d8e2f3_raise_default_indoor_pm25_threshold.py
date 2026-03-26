"""raise default indoor pm25 threshold

Revision ID: ab91c4d8e2f3
Revises: 92b7c4d1e8f0
Create Date: 2026-03-25 20:40:00.000000
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import inspect, text


revision = "ab91c4d8e2f3"
down_revision = "92b7c4d1e8f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "app_settings" not in inspector.get_table_names():
        return

    op.execute(
        text(
            """
            UPDATE app_settings
            SET value_numeric = 40.00
            WHERE key = 'indoor_pm25_high_threshold'
              AND value_numeric = 25.00
            """
        )
    )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "app_settings" not in inspector.get_table_names():
        return

    op.execute(
        text(
            """
            UPDATE app_settings
            SET value_numeric = 25.00
            WHERE key = 'indoor_pm25_high_threshold'
              AND value_numeric = 40.00
            """
        )
    )
