"""Create Phase 1 schema.

Revision ID: 0001_phase1_schema
Revises:
Create Date: 2026-03-06
"""

from __future__ import annotations

from alembic import op

from models import Base


revision = "0001_phase1_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())

