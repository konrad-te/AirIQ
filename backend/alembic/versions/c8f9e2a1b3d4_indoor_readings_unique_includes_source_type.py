"""indoor_sensor_readings unique constraint includes source_type

Allows one real (indoor_sensor) and one mock (mock_indoor) row at the same timestamp.

Revision ID: c8f9e2a1b3d4
Revises: d8d106659fcc
Create Date: 2026-03-27 00:00:00.000000

"""

from __future__ import annotations

from alembic import op


revision = "c8f9e2a1b3d4"
down_revision = "d8d106659fcc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_indoor_sensor_readings_user_provider_device_time",
        "indoor_sensor_readings",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_indoor_sensor_readings_user_provider_device_time_source",
        "indoor_sensor_readings",
        ["user_id", "provider", "provider_device_key", "recorded_at", "source_type"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_indoor_sensor_readings_user_provider_device_time_source",
        "indoor_sensor_readings",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_indoor_sensor_readings_user_provider_device_time",
        "indoor_sensor_readings",
        ["user_id", "provider", "provider_device_key", "recorded_at"],
    )
