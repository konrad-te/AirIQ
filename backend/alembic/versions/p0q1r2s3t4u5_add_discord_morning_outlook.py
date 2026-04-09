"""add discord morning outlook preferences

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-04-07

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p0q1r2s3t4u5"
down_revision = "o9p0q1r2s3t4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "discord_morning_outlook_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column("discord_outlook_webhook_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("discord_outlook_last_sent_on", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "discord_outlook_last_sent_on")
    op.drop_column("user_preferences", "discord_outlook_webhook_encrypted")
    op.drop_column("user_preferences", "discord_morning_outlook_enabled")
