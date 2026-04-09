"""notification center: delivery time and indoor discord alerts

Revision ID: q1w2e3r4t5y6
Revises: p0q1r2s3t4u5
Create Date: 2026-04-07

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "q1w2e3r4t5y6"
down_revision = "p0q1r2s3t4u5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "discord_outlook_local_hour",
            sa.SmallInteger(),
            nullable=False,
            server_default="7",
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "discord_outlook_local_minute",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "discord_indoor_alerts_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "discord_indoor_last_alert_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column("discord_indoor_last_alert_hash", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_user_preferences_discord_outlook_local_hour",
        "user_preferences",
        "discord_outlook_local_hour >= 0 AND discord_outlook_local_hour <= 23",
    )
    op.create_check_constraint(
        "ck_user_preferences_discord_outlook_local_minute",
        "user_preferences",
        "discord_outlook_local_minute >= 0 AND discord_outlook_local_minute <= 59",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_user_preferences_discord_outlook_local_minute",
        "user_preferences",
        type_="check",
    )
    op.drop_constraint(
        "ck_user_preferences_discord_outlook_local_hour",
        "user_preferences",
        type_="check",
    )
    op.drop_column("user_preferences", "discord_indoor_last_alert_hash")
    op.drop_column("user_preferences", "discord_indoor_last_alert_at")
    op.drop_column("user_preferences", "discord_indoor_alerts_enabled")
    op.drop_column("user_preferences", "discord_outlook_local_minute")
    op.drop_column("user_preferences", "discord_outlook_local_hour")
