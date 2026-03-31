"""add feedback_text to suggestion_feedback

Revision ID: k2m3n4o5p6q7
Revises: j1k2l3m4n5o6
Create Date: 2026-03-30 19:15:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "k2m3n4o5p6q7"
down_revision = "j1k2l3m4n5o6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suggestion_feedback", sa.Column("feedback_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("suggestion_feedback", "feedback_text")
