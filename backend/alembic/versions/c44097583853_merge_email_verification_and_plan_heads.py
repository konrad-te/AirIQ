"""merge email verification and plan heads

Revision ID: c44097583853
Revises: befaa7cec10d, l3m4n5o6p7q8
Create Date: 2026-03-31 17:27:48.890269

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = 'c44097583853'
down_revision = ('befaa7cec10d', 'l3m4n5o6p7q8')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
