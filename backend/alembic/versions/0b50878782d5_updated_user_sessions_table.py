"""updated user sessions table

Revision ID: 0b50878782d5
Revises: 9fa7cd3657cb
Create Date: 2026-03-13 15:08:09.918197

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "0b50878782d5"
down_revision = "9fa7cd3657cb"
branch_labels = None
depends_on = None


def _column_set() -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns("user_sessions")}


def _index_names() -> set[str]:
    return {
        idx["name"] for idx in inspect(op.get_bind()).get_indexes("user_sessions")
    }


def _unique_constraint_names() -> set[str]:
    return {
        constraint["name"]
        for constraint in inspect(op.get_bind()).get_unique_constraints("user_sessions")
    }


def upgrade() -> None:
    table = "user_sessions"
    columns = _column_set()
    indexes = _index_names()
    unique_constraints = _unique_constraint_names()

    # Canonical runtime shape is token_hash-based; no-op if already at that shape.
    if "token_hash" in columns and "token" not in columns:
        return

    if "token_hash" not in columns:
        op.add_column(table, sa.Column("token_hash", sa.String(64), nullable=True))

    if "user_agent" not in columns:
        op.add_column(table, sa.Column("user_agent", sa.String(500), nullable=True))
    if "ip_address" not in columns:
        op.add_column(table, sa.Column("ip_address", sa.String(64), nullable=True))
    if "expires_at" not in columns:
        op.add_column(
            table,
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET expires_at = NOW()
                WHERE expires_at IS NULL
                """
            )
        )
    if "last_used_at" not in columns:
        op.add_column(
            table,
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "revoked_at" not in columns:
        op.add_column(
            table,
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        )

    op.execute(
        sa.text(
            f"""
            UPDATE {table}
            SET token_hash = COALESCE(token_hash, token)
            WHERE token_hash IS NULL
            """
        )
    )
    op.alter_column(table, "token_hash", nullable=False)

    if "ix_user_sessions_token_hash" not in indexes:
        op.create_index(
            "ix_user_sessions_token_hash",
            table,
            ["token_hash"],
            unique=False,
        )
    if "uq_user_sessions_token_hash" not in unique_constraints:
        op.create_unique_constraint("uq_user_sessions_token_hash", table, ["token_hash"])

    if "ix_user_sessions_token" in indexes:
        op.drop_index("ix_user_sessions_token", table_name=table)
    if "token" in columns:
        op.drop_column(table, "token")


def downgrade() -> None:
    return
