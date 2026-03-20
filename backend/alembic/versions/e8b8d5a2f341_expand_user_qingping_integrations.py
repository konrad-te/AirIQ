"""expand user qingping integrations

Revision ID: e8b8d5a2f341
Revises: c1a9b7f54d20
Create Date: 2026-03-20 18:05:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "e8b8d5a2f341"
down_revision = "c1a9b7f54d20"
branch_labels = None
depends_on = None


def _column_names() -> set[str]:
    return {
        column["name"]
        for column in inspect(op.get_bind()).get_columns("user_qingping_integrations")
    }


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "user_qingping_integrations" not in inspector.get_table_names():
        return

    columns = _column_names()
    table = "user_qingping_integrations"

    if "selected_device_id" not in columns:
        op.add_column(table, sa.Column("selected_device_id", sa.String(length=255), nullable=True))
    if "selected_device_name" not in columns:
        op.add_column(table, sa.Column("selected_device_name", sa.String(length=255), nullable=True))
    if "selected_product_name" not in columns:
        op.add_column(table, sa.Column("selected_product_name", sa.String(length=255), nullable=True))
    if "selected_serial_number" not in columns:
        op.add_column(table, sa.Column("selected_serial_number", sa.String(length=255), nullable=True))
    if "selected_wifi_mac" not in columns:
        op.add_column(table, sa.Column("selected_wifi_mac", sa.String(length=64), nullable=True))
    if "last_synced_at" not in columns:
        op.add_column(table, sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    return
