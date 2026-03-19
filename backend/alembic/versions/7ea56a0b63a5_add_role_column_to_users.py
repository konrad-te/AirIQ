"""add_role_column_to_users

Revision ID: 7ea56a0b63a5
Revises: 474180cc1211
Create Date: 2026-03-19 21:20:30.110993

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7ea56a0b63a5'
down_revision = '474180cc1211'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(length=20), server_default=sa.text("'user'"), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'role')
