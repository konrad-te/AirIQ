"""add indoor sensor readings

Revision ID: b6b67c4ef129
Revises: e8b8d5a2f341
Create Date: 2026-03-21 00:15:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "b6b67c4ef129"
down_revision = "e8b8d5a2f341"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "indoor_sensor_readings" in inspector.get_table_names():
        return

    op.create_table(
        "indoor_sensor_readings",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_device_key", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="indoor_sensor"),
        sa.Column("device_name", sa.String(length=255), nullable=True),
        sa.Column("product_name", sa.String(length=255), nullable=True),
        sa.Column("serial_number", sa.String(length=255), nullable=True),
        sa.Column("wifi_mac", sa.String(length=64), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("temperature_c", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("humidity_pct", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("pm25_ug_m3", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("pm10_ug_m3", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("co2_ppm", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("battery_pct", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("raw_payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            "provider_device_key",
            "recorded_at",
            name="uq_indoor_sensor_readings_user_provider_device_time",
        ),
    )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "indoor_sensor_readings" in inspector.get_table_names():
        op.drop_table("indoor_sensor_readings")
