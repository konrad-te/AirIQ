"""add app settings table

Revision ID: 6f4d2b8c9a10
Revises: 474180cc1211
Create Date: 2026-03-25 19:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "6f4d2b8c9a10"
down_revision = "474180cc1211"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if "app_settings" in inspector.get_table_names():
        return

    op.create_table(
        "app_settings",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            primary_key=True,
        ),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value_numeric", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("key", name="uq_app_settings_key"),
    )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "app_settings" in inspector.get_table_names():
        op.drop_table("app_settings")
