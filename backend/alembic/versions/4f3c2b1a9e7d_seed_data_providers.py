"""seed data providers

Revision ID: 4f3c2b1a9e7d
Revises: d4d0914ae15a
Create Date: 2026-03-08 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "4f3c2b1a9e7d"
down_revision = "d4d0914ae15a"
branch_labels = None
depends_on = None


data_providers_table = sa.table(
    "data_providers",
    sa.column("provider_code", sa.String(length=32)),
    sa.column("display_name", sa.String(length=80)),
    sa.column("base_url", sa.Text()),
    sa.column("auth_type", sa.String(length=16)),
    sa.column("is_active", sa.Boolean()),
    sa.column("default_timeout_ms", sa.Integer()),
)


def upgrade() -> None:
    op.bulk_insert(
        data_providers_table,
        [
            {
                "provider_code": "airly",
                "display_name": "Airly",
                "base_url": "https://airapi.airly.eu/v2",
                "auth_type": "api_key",
                "is_active": True,
                "default_timeout_ms": 10000,
            },
            {
                "provider_code": "openaq",
                "display_name": "OpenAQ",
                "base_url": "https://api.openaq.org/v3",
                "auth_type": "none",
                "is_active": True,
                "default_timeout_ms": 10000,
            },
            {
                "provider_code": "open-meteo",
                "display_name": "Open-Meteo",
                "base_url": "https://air-quality-api.open-meteo.com/v1",
                "auth_type": "none",
                "is_active": True,
                "default_timeout_ms": 10000,
            },
            {
                "provider_code": "nominatim",
                "display_name": "Nominatim",
                "base_url": "https://nominatim.openstreetmap.org",
                "auth_type": "none",
                "is_active": True,
                "default_timeout_ms": 10000,
            },
        ],
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM data_providers
            WHERE provider_code IN ('airly', 'openaq', 'open-meteo', 'nominatim')
            """
        )
    )