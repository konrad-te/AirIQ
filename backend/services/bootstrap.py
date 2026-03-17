from __future__ import annotations

from typing import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import DataProvider


_REQUIRED_PROVIDERS = [
    {
        "provider_code": "open-meteo",
        "display_name": "Open-Meteo",
        "base_url": "https://air-quality-api.open-meteo.com",
        "auth_type": "none",
        "default_timeout_ms": 10000,
    },
    {
        "provider_code": "airly",
        "display_name": "Airly",
        "base_url": "https://airapi.airly.eu",
        "auth_type": "api_key",
        "default_timeout_ms": 10000,
    },
    {
        "provider_code": "openaq",
        "display_name": "OpenAQ",
        "base_url": "https://api.openaq.org",
        "auth_type": "api_key",
        "default_timeout_ms": 10000,
    },
    {
        "provider_code": "nominatim",
        "display_name": "Nominatim",
        "base_url": "https://nominatim.openstreetmap.org",
        "auth_type": "none",
        "default_timeout_ms": 10000,
    },
]


def ensure_data_providers(session: Session) -> dict[str, int]:
    """Seed required providers idempotently and keep the expected keys stable."""

    rows = session.execute(
        select(DataProvider.provider_code, DataProvider.id)
    ).all()
    existing = {row[0]: row[1] for row in rows}

    for provider in _REQUIRED_PROVIDERS:
        provider_code = provider["provider_code"]
        provider_id = existing.get(provider_code)
        existing_row = session.get(DataProvider, provider_id) if provider_id is not None else None

        if existing_row is None:
            existing_row = DataProvider(
                provider_code=provider_code,
                display_name=provider["display_name"],
                base_url=provider["base_url"],
                auth_type=provider["auth_type"],
                default_timeout_ms=provider["default_timeout_ms"],
                is_active=True,
            )
            session.add(existing_row)
            session.flush()
            existing[provider["provider_code"]] = existing_row.id
        else:
            existing_row.display_name = provider["display_name"]
            existing_row.base_url = provider["base_url"]
            existing_row.auth_type = provider["auth_type"]
            existing_row.default_timeout_ms = provider["default_timeout_ms"]

    session.commit()

    return existing


def get_provider_id(session: Session, provider_code: str) -> int | None:
    return session.execute(
        select(DataProvider.id).where(DataProvider.provider_code == provider_code)
    ).scalar_one_or_none()


def ensure_default_providers_and_get_map(session: Session) -> Mapping[str, int]:
    return ensure_data_providers(session)
