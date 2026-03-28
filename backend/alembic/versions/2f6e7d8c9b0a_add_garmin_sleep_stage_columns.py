"""add garmin sleep stage columns

Revision ID: 2f6e7d8c9b0a
Revises: 1c2d3e4f5a6b
Create Date: 2026-03-28 18:05:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "2f6e7d8c9b0a"
down_revision = "1c2d3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("garmin_sleep_summaries")}

    if "sleep_deep_minutes" not in columns:
        op.add_column("garmin_sleep_summaries", sa.Column("sleep_deep_minutes", sa.Integer(), nullable=True))
    if "sleep_light_minutes" not in columns:
        op.add_column("garmin_sleep_summaries", sa.Column("sleep_light_minutes", sa.Integer(), nullable=True))
    if "sleep_rem_minutes" not in columns:
        op.add_column("garmin_sleep_summaries", sa.Column("sleep_rem_minutes", sa.Integer(), nullable=True))
    if "sleep_awake_minutes" not in columns:
        op.add_column("garmin_sleep_summaries", sa.Column("sleep_awake_minutes", sa.Integer(), nullable=True))
    if "sleep_unmeasurable_minutes" not in columns:
        op.add_column("garmin_sleep_summaries", sa.Column("sleep_unmeasurable_minutes", sa.Integer(), nullable=True))
    if "sleep_window_confirmation_type" not in columns:
        op.add_column(
            "garmin_sleep_summaries",
            sa.Column("sleep_window_confirmation_type", sa.String(length=64), nullable=True),
        )
    if "avg_sleep_respiration" not in columns:
        op.add_column(
            "garmin_sleep_summaries",
            sa.Column("avg_sleep_respiration", sa.Numeric(8, 2), nullable=True),
        )
    if "lowest_sleep_respiration" not in columns:
        op.add_column(
            "garmin_sleep_summaries",
            sa.Column("lowest_sleep_respiration", sa.Numeric(8, 2), nullable=True),
        )
    if "highest_sleep_respiration" not in columns:
        op.add_column(
            "garmin_sleep_summaries",
            sa.Column("highest_sleep_respiration", sa.Numeric(8, 2), nullable=True),
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("garmin_sleep_summaries")}

    if "highest_sleep_respiration" in columns:
        op.drop_column("garmin_sleep_summaries", "highest_sleep_respiration")
    if "lowest_sleep_respiration" in columns:
        op.drop_column("garmin_sleep_summaries", "lowest_sleep_respiration")
    if "avg_sleep_respiration" in columns:
        op.drop_column("garmin_sleep_summaries", "avg_sleep_respiration")
    if "sleep_window_confirmation_type" in columns:
        op.drop_column("garmin_sleep_summaries", "sleep_window_confirmation_type")
    if "sleep_unmeasurable_minutes" in columns:
        op.drop_column("garmin_sleep_summaries", "sleep_unmeasurable_minutes")
    if "sleep_awake_minutes" in columns:
        op.drop_column("garmin_sleep_summaries", "sleep_awake_minutes")
    if "sleep_rem_minutes" in columns:
        op.drop_column("garmin_sleep_summaries", "sleep_rem_minutes")
    if "sleep_light_minutes" in columns:
        op.drop_column("garmin_sleep_summaries", "sleep_light_minutes")
    if "sleep_deep_minutes" in columns:
        op.drop_column("garmin_sleep_summaries", "sleep_deep_minutes")
