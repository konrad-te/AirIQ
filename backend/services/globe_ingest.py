from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

<<<<<<< HEAD
from models import CityPoint, GlobeAqCache, IngestRun
from services.bootstrap import ensure_data_providers, get_provider_id

=======
from models import CityPoint, DataProvider, GlobeAqCache, IngestRun
>>>>>>> database-implementation-2

OPENMETEO_PROVIDER_CODE = "open-meteo"
OPENMETEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


@dataclass
class IngestSummary:
    total_points: int
    success_count: int
    fail_count: int
    run_id: int | None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


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


<<<<<<< HEAD
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
=======
def _safe_float(value: Any) -> float | None:
    numeric = float(value) if isinstance(value, (int, float)) else None
    if numeric is None:
        return None
    if numeric < 0:
        return None
    return numeric


def _safe_int(value: Any) -> int | None:
    numeric = int(value) if isinstance(value, (int, float)) else None
    if numeric is None:
        return None
    return numeric


def _normalize_us_aqi(value: Any) -> int | None:
    numeric = _safe_int(value)
    if numeric is None:
        return None
    if 0 <= numeric <= 500:
        return numeric
    return None


def _normalize_eu_aqi(value: Any) -> int | None:
    numeric = _safe_int(value)
    if numeric is None:
        return None
    if numeric < 0:
        return None
    return numeric


def _get_openmeteo_provider(db: Session) -> DataProvider:
    provider = db.execute(
        select(DataProvider).where(DataProvider.provider_code == OPENMETEO_PROVIDER_CODE)
    ).scalar_one_or_none()

    if provider is None:
        raise RuntimeError(
            "Missing data provider row for 'open-meteo'. "
            "Run Alembic migrations so the data_providers seed migration is applied."
        )

    return provider


def _fetch_openmeteo_batch(
    points: list[CityPoint],
    timeout_seconds: float,
) -> list[dict[str, Any]]:
>>>>>>> database-implementation-2
    if not points:
        return []

    latitudes = ",".join(str(point.lat) for point in points)
    longitudes = ",".join(str(point.lon) for point in points)

    params = {
        "latitude": latitudes,
        "longitude": longitudes,
        "current": "pm10,pm2_5,us_aqi,european_aqi",
        "timezone": "UTC",
    }

    response = requests.get(
        OPENMETEO_AQ_URL,
        params=params,
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    payload = response.json()

    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]

    if isinstance(payload, dict):
        return [payload]

    return []


<<<<<<< HEAD
def run_globe_ingest(db: Session, batch_size: int = 40) -> IngestSummary:
    provider_id = get_provider_id(db, "open-meteo")
    if provider_id is None:
        ensure_data_providers(db)
        provider_id = get_provider_id(db, "open-meteo")
        if provider_id is None:
            raise RuntimeError("open-meteo provider is not configured.")

    run = IngestRun(
        provider_id=provider_id,
=======
def _get_or_create_cache(
    db: Session,
    city_point_id: int,
    provider_id: int,
) -> GlobeAqCache:
    cache = db.get(GlobeAqCache, city_point_id)
    if cache is None:
        cache = GlobeAqCache(
            city_point_id=city_point_id,
            provider_id=provider_id,
        )
        db.add(cache)
    else:
        cache.provider_id = provider_id

    return cache


def _mark_cache_failed(
    db: Session,
    city_point_id: int,
    provider_id: int,
    fetched_at: datetime,
    payload_json: dict[str, Any] | None = None,
) -> None:
    cache = _get_or_create_cache(
        db=db,
        city_point_id=city_point_id,
        provider_id=provider_id,
    )
    cache.stale = True
    cache.fetched_at = fetched_at
    if payload_json is not None:
        cache.payload_json = payload_json


def run_globe_ingest(
    db: Session,
    batch_size: int = 40,
    triggered_by: str = "scheduler",
) -> IngestSummary:
    provider = _get_openmeteo_provider(db)

    run = IngestRun(
        provider_id=provider.id,
        triggered_by=triggered_by,
>>>>>>> database-implementation-2
        status="running",
        total_points=0,
        success_count=0,
        fail_count=0,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    points = db.execute(
        select(CityPoint)
        .where(CityPoint.is_active.is_(True))
        .order_by(CityPoint.id.asc())
    ).scalars().all()

    total_points = len(points)
    success_count = 0
    fail_count = 0
    notes: list[str] = []

    try:
        run.total_points = total_points
        db.commit()

        timeout_seconds = max(provider.default_timeout_ms / 1000.0, 1.0)

        for start in range(0, total_points, batch_size):
            batch = points[start : start + batch_size]
            fetched_at = _utc_now()

            try:
                rows = _fetch_openmeteo_batch(
                    points=batch,
                    timeout_seconds=timeout_seconds,
                )
            except requests.RequestException as exc:
                for point in batch:
<<<<<<< HEAD
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
=======
                    _mark_cache_failed(
                        db=db,
                        city_point_id=point.id,
                        provider_id=provider.id,
                        fetched_at=fetched_at,
                    )
                    fail_count += 1

                notes.append(
                    f"Batch starting at index {start} failed: {type(exc).__name__}"
                )
                run.success_count = success_count
                run.fail_count = fail_count
                db.commit()
                continue

            for index, point in enumerate(batch):
                row = rows[index] if index < len(rows) else {}
                current = row.get("current") if isinstance(row, dict) else {}
                if not isinstance(current, dict):
                    current = {}

                pm25 = _safe_float(current.get("pm2_5"))
                pm10 = _safe_float(current.get("pm10"))
                us_aqi = _normalize_us_aqi(current.get("us_aqi"))
                eu_aqi = _normalize_eu_aqi(current.get("european_aqi"))
                observed_at = _parse_iso_datetime(current.get("time"))

                cache = _get_or_create_cache(
                    db=db,
                    city_point_id=point.id,
                    provider_id=provider.id,
                )

                cache.pm25 = pm25
                cache.pm10 = pm10
                cache.us_aqi = us_aqi
                cache.eu_aqi = eu_aqi
                cache.band = _pm25_to_band(pm25)
>>>>>>> database-implementation-2
                cache.observed_at = observed_at
                cache.fetched_at = fetched_at
                cache.payload_json = row if isinstance(row, dict) and row else None

                raw_us_aqi = _safe_int(current.get("us_aqi"))
                if raw_us_aqi is not None and us_aqi is None:
                    notes.append(
                        f"City point {point.id} returned out-of-range us_aqi={raw_us_aqi}; stored as NULL."
                    )

                has_any_measurement = any(
                    value is not None for value in (pm25, pm10, us_aqi, eu_aqi)
                )

                if has_any_measurement:
                    cache.stale = False
                    success_count += 1
                else:
                    cache.stale = True
                    fail_count += 1

            run.success_count = success_count
            run.fail_count = fail_count
            db.commit()

<<<<<<< HEAD
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
=======
        accounted_for = success_count + fail_count
        if accounted_for != total_points:
            notes.append(
                f"Outcome reconciliation adjusted counts: total={total_points}, "
                f"success={success_count}, fail={fail_count}, accounted={accounted_for}."
            )
            fail_count = max(total_points - success_count, 0)
>>>>>>> database-implementation-2

        run.finished_at = _utc_now()
        run.success_count = success_count
        run.fail_count = fail_count

        if fail_count == 0:
            run.status = "success"
        elif success_count == 0:
            run.status = "failed"
        else:
            run.status = "partial"

        if notes:
            run.notes = " ".join(notes)
        else:
            run.notes = (
                "Open-Meteo globe ingest completed successfully."
                if run.status == "success"
                else "Open-Meteo globe ingest completed with partial failures."
            )

        db.commit()

        return IngestSummary(
            total_points=total_points,
            success_count=success_count,
            fail_count=fail_count,
            run_id=run.id,
        )

    except Exception as exc:
        db.rollback()

        persisted_run = db.get(IngestRun, run.id)
        if persisted_run is None:
            raise

        accounted_for = success_count + fail_count
        if accounted_for != total_points:
            fail_count = max(total_points - success_count, fail_count)

        persisted_run.finished_at = _utc_now()
        persisted_run.total_points = total_points
        persisted_run.success_count = success_count
        persisted_run.fail_count = fail_count
        persisted_run.status = "failed" if success_count == 0 else "partial"
        persisted_run.notes = (
            f"Open-Meteo globe ingest crashed: {type(exc).__name__}: {exc}"
        )
        db.commit()

        return IngestSummary(
            total_points=total_points,
            success_count=success_count,
            fail_count=fail_count,
            run_id=persisted_run.id,
        )