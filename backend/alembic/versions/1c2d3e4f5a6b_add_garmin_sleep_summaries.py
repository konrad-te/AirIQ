"""add garmin sleep summaries

Revision ID: 1c2d3e4f5a6b
Revises: c8f9e2a1b3d4
Create Date: 2026-03-28 15:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "1c2d3e4f5a6b"
down_revision = "c8f9e2a1b3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "garmin_sleep_summaries" in inspector.get_table_names():
        return

    op.create_table(
        "garmin_sleep_summaries",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="garmin"),
        sa.Column("calendar_date", sa.Date(), nullable=False),
        sa.Column("external_uuid", sa.String(length=255), nullable=True),
        sa.Column("source_file_name", sa.String(length=255), nullable=True),
        sa.Column("wellness_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("wellness_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sleep_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sleep_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sleep_start_local_minutes", sa.Integer(), nullable=True),
        sa.Column("sleep_end_local_minutes", sa.Integer(), nullable=True),
        sa.Column("sleep_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("sleep_stress_avg", sa.Numeric(8, 2), nullable=True),
        sa.Column("sleep_stress_max", sa.Integer(), nullable=True),
        sa.Column("body_battery_start", sa.Integer(), nullable=True),
        sa.Column("body_battery_end", sa.Integer(), nullable=True),
        sa.Column("body_battery_gain", sa.Integer(), nullable=True),
        sa.Column("resting_heart_rate", sa.Integer(), nullable=True),
        sa.Column("min_heart_rate", sa.Integer(), nullable=True),
        sa.Column("max_heart_rate", sa.Integer(), nullable=True),
        sa.Column("avg_waking_respiration", sa.Numeric(8, 2), nullable=True),
        sa.Column("raw_payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "calendar_date", name="uq_garmin_sleep_summaries_user_calendar_date"),
    )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "garmin_sleep_summaries" in inspector.get_table_names():
        op.drop_table("garmin_sleep_summaries")
