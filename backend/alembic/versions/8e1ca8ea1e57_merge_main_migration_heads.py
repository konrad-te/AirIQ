"""merge main migration heads

Revision ID: 8e1ca8ea1e57
Revises: b6b67c4ef129, c3d4e5f6a7b8
Create Date: 2026-03-20 21:34:28.688907

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '8e1ca8ea1e57'
down_revision = ('b6b67c4ef129', 'c3d4e5f6a7b8')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
