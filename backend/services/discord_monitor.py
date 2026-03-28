from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta

import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import (
    CityPoint,
    DataProvider,
    GeocodeCacheEntry,
    GlobeAqCache,
    IngestRun,
    LocationStationCache,
    ProviderCacheEntry,
    User,
    UserSession,
)

logger = logging.getLogger(__name__)

WEBHOOK_URL = os.getenv(
    "DISCORD_WEBHOOK_URL",
)


def _status_color(ok: bool) -> int:
    return 0x2ECC71 if ok else 0xE74C3C  # green / red


def build_status_embed(db: Session) -> dict:
    now = datetime.now(UTC)
    online_threshold = now - timedelta(minutes=15)

    # Users
    total_users = db.execute(select(func.count(User.id))).scalar_one()
    online_users = db.execute(
        select(func.count(func.distinct(UserSession.user_id))).where(
            UserSession.revoked_at.is_(None),
            UserSession.expires_at >= now,
            UserSession.last_used_at >= online_threshold,
        )
    ).scalar_one()

    # AQ coverage
    total_cities = db.execute(
        select(func.count(CityPoint.id)).where(CityPoint.is_active.is_(True))
    ).scalar_one()
    globe_fresh = db.execute(
        select(func.count(GlobeAqCache.city_point_id)).where(
            GlobeAqCache.stale.is_(False)
        )
    ).scalar_one()
    globe_stale = db.execute(
        select(func.count(GlobeAqCache.city_point_id)).where(
            GlobeAqCache.stale.is_(True)
        )
    ).scalar_one()
    coverage_pct = round(globe_fresh / total_cities * 100, 1) if total_cities else 0

    # Cache health
    provider_active = db.execute(
        select(func.count(ProviderCacheEntry.id)).where(
            ProviderCacheEntry.expires_at >= now
        )
    ).scalar_one()
    provider_expired = db.execute(
        select(func.count(ProviderCacheEntry.id)).where(
            ProviderCacheEntry.expires_at < now
        )
    ).scalar_one()
    geocode_active = db.execute(
        select(func.count(GeocodeCacheEntry.id)).where(
            GeocodeCacheEntry.expires_at >= now
        )
    ).scalar_one()
    location_active = db.execute(
        select(func.count(LocationStationCache.id)).where(
            LocationStationCache.expires_at >= now
        )
    ).scalar_one()

    # Latest ingest run
    latest_ingest = db.execute(
        select(IngestRun, DataProvider)
        .join(DataProvider, DataProvider.id == IngestRun.provider_id)
        .order_by(IngestRun.id.desc())
        .limit(1)
    ).first()

    ingest_status = "No runs yet"
    if latest_ingest:
        run, provider = latest_ingest
        age_min = int((now - run.started_at.replace(tzinfo=UTC)).total_seconds() / 60)
        ingest_status = (
            f"`{run.status}` via {provider.provider_code} "
            f"— {run.success_count}/{run.total_points} cities "
            f"({age_min}m ago)"
        )

    overall_ok = globe_stale == 0 or coverage_pct >= 80

    return {
        "title": "AirIQ — Hourly Status",
        "color": _status_color(overall_ok),
        "timestamp": now.isoformat(),
        "fields": [
            {
                "name": "Users",
                "value": f"Total: **{total_users}** | Online (15m): **{online_users}**",
                "inline": False,
            },
            {
                "name": "AQ Globe Coverage",
                "value": (
                    f"Fresh: **{globe_fresh}** | Stale: **{globe_stale}** "
                    f"| Total: {total_cities} ({coverage_pct}%)"
                ),
                "inline": False,
            },
            {
                "name": "Cache Health",
                "value": (
                    f"Provider active: **{provider_active}** expired: {provider_expired}\n"
                    f"Geocode active: **{geocode_active}** | Location active: **{location_active}**"
                ),
                "inline": False,
            },
            {
                "name": "Latest Ingest",
                "value": ingest_status,
                "inline": False,
            },
        ],
        "footer": {"text": "AirIQ Monitor"},
    }


def send_discord_status() -> None:
    if not WEBHOOK_URL:
        logger.warning("DISCORD_WEBHOOK_URL not set — skipping status report")
        return

    db = SessionLocal()
    try:
        embed = build_status_embed(db)
        payload = {"embeds": [embed]}
        resp = requests.post(WEBHOOK_URL, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info("Discord status report sent (HTTP %s)", resp.status_code)
    except Exception:
        logger.exception("Failed to send Discord status report")
    finally:
        db.close()
