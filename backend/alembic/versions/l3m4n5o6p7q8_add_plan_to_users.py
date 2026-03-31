"""add plan to users

Revision ID: l3m4n5o6p7q8
Revises: k2m3n4o5p6q7
Create Date: 2026-03-30 22:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "l3m4n5o6p7q8"
down_revision = "k2m3n4o5p6q7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan", sa.String(length=20), nullable=False, server_default=sa.text("'free'")),
    )
    op.create_check_constraint(
        "ck_users_plan",
        "users",
        "plan IN ('free','plus')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_plan", "users", type_="check")
    op.drop_column("users", "plan")
