"""updated user sessions table

Revision ID: 0b50878782d5
Revises: 9fa7cd3657cb
Create Date: 2026-03-13 15:08:09.918197

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0b50878782d5"
down_revision = "9fa7cd3657cb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("token", sa.String(length=255), nullable=True),
    )

    op.execute(
        sa.text("UPDATE user_sessions SET token = token_hash WHERE token IS NULL")
    )

    op.alter_column("user_sessions", "token", nullable=False)

    op.create_index("ix_user_sessions_token", "user_sessions", ["token"], unique=True)

    op.drop_index("ix_user_sessions_token_hash", table_name="user_sessions")
    op.drop_constraint("uq_user_sessions_token_hash", "user_sessions", type_="unique")

    op.drop_column("user_sessions", "token_hash")
    op.drop_column("user_sessions", "user_agent")
    op.drop_column("user_sessions", "ip_address")
    op.drop_column("user_sessions", "expires_at")
    op.drop_column("user_sessions", "last_used_at")
    op.drop_column("user_sessions", "revoked_at")


def downgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=True),
    )
    op.execute(
        sa.text("UPDATE user_sessions SET token_hash = token WHERE token_hash IS NULL")
    )
    op.alter_column("user_sessions", "token_hash", nullable=False)

    op.add_column(
        "user_sessions",
        sa.Column("user_agent", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "user_sessions",
        sa.Column("ip_address", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "user_sessions",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user_sessions",
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user_sessions",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_user_sessions_token_hash",
        "user_sessions",
        ["token_hash"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_user_sessions_token_hash",
        "user_sessions",
        ["token_hash"],
    )

    op.drop_index("ix_user_sessions_token", table_name="user_sessions")
    op.drop_column("user_sessions", "token")
