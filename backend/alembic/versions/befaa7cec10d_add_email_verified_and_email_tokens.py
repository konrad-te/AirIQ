"""add_email_verified_and_email_tokens

Revision ID: befaa7cec10d
Revises: c8f9e2a1b3d4
Create Date: 2026-03-29 21:21:06.550984

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'befaa7cec10d'
down_revision = 'c8f9e2a1b3d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('email_tokens',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('token_type', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'email_verified')
    op.drop_table('email_tokens')
