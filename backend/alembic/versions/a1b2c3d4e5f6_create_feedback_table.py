"""create feedback table

Revision ID: a1b2c3d4e5f6
Revises: 7ea56a0b63a5
Create Date: 2026-03-20 12:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "7ea56a0b63a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("feedback")
