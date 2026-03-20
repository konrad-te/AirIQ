"""add user qingping integrations

Revision ID: c1a9b7f54d20
Revises: 474180cc1211
Create Date: 2026-03-19 15:20:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "c1a9b7f54d20"
down_revision = "474180cc1211"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "user_qingping_integrations" in inspector.get_table_names():
        return

    op.create_table(
        "user_qingping_integrations",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="qingping"),
        sa.Column("app_key", sa.String(length=255), nullable=False),
        sa.Column("app_secret", sa.String(length=255), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("selected_device_id", sa.String(length=255), nullable=True),
        sa.Column("selected_device_name", sa.String(length=255), nullable=True),
        sa.Column("selected_product_name", sa.String(length=255), nullable=True),
        sa.Column("selected_serial_number", sa.String(length=255), nullable=True),
        sa.Column("selected_wifi_mac", sa.String(length=64), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="connected"),
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_user_qingping_integrations_user_id"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "user_qingping_integrations" in inspector.get_table_names():
        op.drop_table("user_qingping_integrations")
