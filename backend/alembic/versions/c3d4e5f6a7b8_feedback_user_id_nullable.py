"""feedback user_id nullable with SET NULL

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-20 14:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("feedback", "user_id", nullable=True)
    op.drop_constraint("feedback_user_id_fkey", "feedback", type_="foreignkey")
    op.create_foreign_key(
        "feedback_user_id_fkey",
        "feedback",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("feedback_user_id_fkey", "feedback", type_="foreignkey")
    op.create_foreign_key(
        "feedback_user_id_fkey",
        "feedback",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("feedback", "user_id", nullable=False)
