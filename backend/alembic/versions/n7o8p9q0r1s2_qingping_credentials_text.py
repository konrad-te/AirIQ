"""widen qingping app_key and app_secret for encrypted storage

Revision ID: n7o8p9q0r1s2
Revises: m5n6o7p8q9r0
Create Date: 2026-04-07

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "n7o8p9q0r1s2"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "user_qingping_integrations",
        "app_key",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "user_qingping_integrations",
        "app_secret",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "user_qingping_integrations",
        "app_key",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.alter_column(
        "user_qingping_integrations",
        "app_secret",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
