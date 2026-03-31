"""add profile image to users

Revision ID: m5n6o7p8q9r0
Revises: c44097583853
Create Date: 2026-03-31 11:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "m5n6o7p8q9r0"
down_revision = "c44097583853"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_image_data", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_image_data")
