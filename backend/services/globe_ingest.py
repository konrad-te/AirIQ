from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import CityPoint, GlobeAqCache, IngestRun
from services.bootstrap import ensure_data_providers, get_provider_id


OPENMETEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


@dataclass
class IngestSummary:
    total_points: int
    success_count: int
    fail_count: int
    run_id: int | None


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _pm25_to_band(pm25: float | None) -> str | None:
    if pm25 is None:
        return None
    if pm25 < 10:
        return "0-10"
    if pm25 < 20:
        return "10-20"
    if pm25 < 25:
        return "20-25"
    if pm25 < 50:
        return "25-50"
    if pm25 < 75:
        return "50-75"
    return "75+"


def _to_nullable_int(value: Any, *, min_value: int | None = None, max_value: int | None = None) -> int | None:
    if not isinstance(value, (int, float)):
        return None

    numeric = int(value)
    if min_value is not None and numeric < min_value:
        return min_value
    if max_value is not None and numeric > max_value:
        return max_value
    return numeric


def _to_nullable_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _fetch_openmeteo_batch(points: list[CityPoint], timeout: int = 30) -> list[dict[str, Any]]:
    if not points:
        return []

    latitudes = ",".join(str(p.lat) for p in points)
    longitudes = ",".join(str(p.lon) for p in points)
    params = {
        "latitude": latitudes,
        "longitude": longitudes,
        "current": "pm10,pm2_5,us_aqi,european_aqi",
        "timezone": "UTC",
    }
    res = requests.get(OPENMETEO_AQ_URL, params=params, timeout=timeout)
    res.raise_for_status()
    payload = res.json()
    return payload if isinstance(payload, list) else [payload]


def run_globe_ingest(db: Session, batch_size: int = 40) -> IngestSummary:
    provider_id = get_provider_id(db, "open-meteo")
    if provider_id is None:
        ensure_data_providers(db)
        provider_id = get_provider_id(db, "open-meteo")
        if provider_id is None:
            raise RuntimeError("open-meteo provider is not configured.")

    run = IngestRun(
        provider_id=provider_id,
        status="running",
        total_points=0,
        success_count=0,
        fail_count=0,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    points = db.execute(
        select(CityPoint).where(CityPoint.is_active.is_(True)).order_by(CityPoint.id.asc())
    ).scalars().all()

    total = len(points)
    success = 0
    fail = 0

    try:
        run.total_points = total
        db.commit()

        for i in range(0, total, batch_size):
            batch = points[i : i + batch_size]
            try:
                rows = _fetch_openmeteo_batch(batch)
            except Exception:
                for point in batch:
                    cache = db.get(GlobeAqCache, point.id)
                    if cache is None:
                        cache = GlobeAqCache(city_point_id=point.id, provider_id=provider_id)
                        db.add(cache)
                    else:
                        cache.provider_id = provider_id
                    cache.stale = True
                    cache.fetched_at = datetime.now(timezone.utc)
                    fail += 1
                db.commit()
                continue

            for idx, point in enumerate(batch):
                row = rows[idx] if idx < len(rows) else {}
                current = row.get("current") or {}
                if not isinstance(current, dict) or (
                    current.get("pm2_5") is None and current.get("pm10") is None
                ):
                    cache = db.get(GlobeAqCache, point.id)
                    if cache is None:
                        cache = GlobeAqCache(city_point_id=point.id, provider_id=provider_id)
                        db.add(cache)
                    else:
                        cache.provider_id = provider_id
                    cache.stale = True
                    cache.observed_at = _parse_iso_datetime(current.get("time"))
                    cache.fetched_at = datetime.now(timezone.utc)
                    fail += 1
                    continue

                current = row.get("current") or {}
                pm25 = current.get("pm2_5")
                pm10 = current.get("pm10")
                us_aqi = current.get("us_aqi")
                eu_aqi = current.get("european_aqi")
                observed_at = _parse_iso_datetime(current.get("time"))

                cache = db.get(GlobeAqCache, point.id)
                if cache is None:
                    cache = GlobeAqCache(city_point_id=point.id, provider_id=provider_id)
                    db.add(cache)
                else:
                    cache.provider_id = provider_id

                cache.pm25 = _to_nullable_float(pm25)
                cache.pm10 = _to_nullable_float(pm10)
                cache.us_aqi = _to_nullable_int(us_aqi, min_value=0, max_value=500)
                cache.eu_aqi = _to_nullable_int(eu_aqi, min_value=0)
                cache.band = _pm25_to_band(cache.pm25)
                cache.observed_at = observed_at
                cache.fetched_at = datetime.now(timezone.utc)
                cache.stale = False
                cache.payload_json = None
                success += 1

            db.commit()

        run.status = "partial" if fail > 0 else "success"
        run.success_count = success
        run.fail_count = fail
        run.finished_at = datetime.now(timezone.utc)
        run.notes = "Open-Meteo globe ingest completed."
        db.commit()
    except Exception as exc:
        run.status = "failed"
        run.success_count = success
        run.fail_count = max(fail, total - success)
        run.finished_at = datetime.now(timezone.utc)
        run.notes = f"Ingest aborted: {exc}"
        db.commit()
        raise

    return IngestSummary(
        total_points=total,
        success_count=success,
        fail_count=fail,
        run_id=run.id,
    )
