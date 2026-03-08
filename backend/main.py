from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
<<<<<<< HEAD
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from sqlalchemy import delete, select

from database import SessionLocal
from models import (
    DataProvider,
    ExternalStation,
    GeocodeCacheEntry,
    LocationStationCache,
    ProviderCacheEntry,
)
=======
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import SessionLocal
from models import DataProvider, GeocodeCacheEntry, ProviderCacheEntry
>>>>>>> database-implementation-2

# ---------------------------
# Configuration
# ---------------------------
<<<<<<< HEAD
load_dotenv()
AIRLY_PROVIDER_CODE = "airly"
OPENAQ_PROVIDER_CODE = "openaq"
OPENMETEO_PROVIDER_CODE = "open-meteo"
NOMINATIM_PROVIDER_CODE = "nominatim"
=======
>>>>>>> database-implementation-2

AIRLY_API_KEY = os.getenv("AIRLY_API_KEY") or os.getenv("airly_api")
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY") or os.getenv("open_aq")

CACHE_RAW = os.getenv("CACHE_RAW", "0") == "1"
DEBUG = os.getenv("DEBUG", "0") == "1"

NOMINATIM_USER_AGENT = (
    os.getenv("NOMINATIM_USER_AGENT")
    or os.getenv("nominatim_user_agent")
    or "AirIQ-Learning-Project/1.0 (contact: student@example.com)"
)
NOMINATIM_EMAIL = os.getenv("NOMINATIM_EMAIL") or os.getenv("nominatim_email")

AIRLY_HEADERS = (
    {"Accept": "application/json", "apikey": AIRLY_API_KEY}
    if AIRLY_API_KEY
    else {}
)

<<<<<<< HEAD
# Distances
=======
TTL_CURRENT = 10 * 60
TTL_STATION = 10 * 60
TTL_MODEL = 20 * 60
TTL_WEATHER = 30 * 60
TTL_GEOCODE = 30 * 24 * 3600

>>>>>>> database-implementation-2
AIRLY_NEAREST_MAX_DISTANCE_KM = 5
OPENAQ_MAX_DISTANCE_KM = 50
INTERPOLATION_CLOSE_KM = 1.5

OPENMETEO_PAST_HOURS = 24
OPENMETEO_FUTURE_HOURS = 24

AIRLY_POINT_URL = "https://airapi.airly.eu/v2/measurements/point"
AIRLY_NEAREST_URL = "https://airapi.airly.eu/v2/measurements/nearest"
OPENAQ_LATEST_URL = "https://api.openaq.org/v3/latest"
OPENMETEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPENMETEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

UNITS = {
    "pm": "µg/m³",
    "temperature": "°C",
    "pressure": "hPa",
    "humidity": "%",
    "wind_speed": "m/s",
    "wind_direction": "°",
}

# ---------------------------
# Session helpers
# ---------------------------

<<<<<<< HEAD
def _cache_path(cache_key: str) -> str:
    return cache_key


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _provider_id_for_code(session, provider_code: str) -> int | None:
    row = session.execute(
        select(DataProvider.id).where(DataProvider.provider_code == provider_code)
    ).scalar_one_or_none()
    return row


def _cache_key(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


def _provider_code_for_cache_key(cache_key: str) -> str | None:
    if cache_key.startswith("norm_airly_") or cache_key.startswith("airly_"):
        return AIRLY_PROVIDER_CODE
    if cache_key.startswith("norm_openaq_"):
        return OPENAQ_PROVIDER_CODE
    if cache_key.startswith("norm_openmeteo_") or cache_key.startswith("wx_openmeteo_"):
        return OPENMETEO_PROVIDER_CODE
    return None


def _method_for_cache_key(cache_key: str) -> str | None:
    if cache_key.startswith("norm_airly_point_"):
        return "point"
    if cache_key.startswith("norm_airly_station_") or cache_key.startswith("norm_airly_nearest_"):
        return "nearest_station"
    if cache_key.startswith("norm_openaq_nearest_"):
        return "nearest_station"
    if cache_key.startswith("norm_openmeteo_model_"):
        return "model"
    if cache_key.startswith("wx_openmeteo_"):
        return "point"
    return None


def _coord_key(cache_key: str) -> str:
    for prefix in (
        "norm_airly_point_",
        "norm_airly_station_",
        "norm_airly_nearest_",
        "norm_openaq_nearest_",
        "norm_openmeteo_model_",
        "wx_openmeteo_",
    ):
        if cache_key.startswith(prefix):
            return cache_key[len(prefix) :]
    return cache_key


def _cache_kind(cache_key: str) -> str:
    if cache_key.startswith("wx_openmeteo_"):
        return "weather"
    return "aq_normalized"


def _ttl_from_payload(cache_key: str, data: dict | None = None) -> int:
    if isinstance(data, dict):
        cache_block = data.get("cache")
        if isinstance(cache_block, dict):
            ttl = cache_block.get("ttl_sec")
            if isinstance(ttl, int) and ttl > 0:
                return ttl

    if cache_key.startswith("wx_openmeteo_"):
        return TTL_WEATHER
    if cache_key.startswith("norm_openmeteo_model_"):
        return TTL_MODEL
    if cache_key.startswith("norm_airly_point_"):
        return TTL_CURRENT
    if cache_key.startswith(("norm_airly_station_", "norm_airly_nearest_", "norm_openaq_nearest_")):
        return TTL_STATION
    return TTL_CURRENT


def _extract_airly_station_id(cache_key: str) -> int | None:
    m = re.match(r"norm_airly_station_(\\d+)_\\d+km", cache_key)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _ensure_external_station(
    session,
    provider_id: int,
    provider_station_id: int,
    station_name: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
) -> int:
    provider_station_key = str(provider_station_id)
    existing = session.execute(
        select(ExternalStation.id).where(
            ExternalStation.provider_id == provider_id,
            ExternalStation.provider_station_id == provider_station_key,
        )
    ).scalar_one_or_none()

    if existing is not None:
        return existing

    row = ExternalStation(
        provider_id=provider_id,
        provider_station_id=provider_station_key,
        station_name=station_name or f"Airly station {provider_station_id}",
        lat=lat,
        lon=lon,
        is_mobile=False,
        is_monitor=True,
    )
    session.add(row)
    session.flush()
    return row.id


def _parse_coord_key(coord_key: str) -> tuple[float | None, float | None]:
    try:
        lat_text, lon_text = coord_key.split("_", 1)
        return float(lat_text), float(lon_text)
    except (TypeError, ValueError):
        return None, None


def _cache_read(path: str, max_age_seconds: int | None = None) -> Optional[dict]:
    key = _cache_key(path)
    provider_code = _provider_code_for_cache_key(key)
    if not provider_code:
        return None

    now = _now_utc()
    with SessionLocal() as db:
        provider_id = _provider_id_for_code(db, provider_code)
        if provider_id is None:
            return None

        row = db.execute(
            select(ProviderCacheEntry)
            .where(ProviderCacheEntry.provider_id == provider_id)
            .where(ProviderCacheEntry.cache_key == key)
        ).scalar_one_or_none()
        if row is None:
            return None

        if row.expires_at is not None and row.expires_at <= now:
            db.delete(row)
            db.commit()
            return None
        if (
            max_age_seconds is not None
            and row.cached_at is not None
            and row.cached_at <= now - timedelta(seconds=max_age_seconds)
        ):
            return None
        row.hit_count = (row.hit_count or 0) + 1
        row.last_used_at = now
        db.commit()
        return row.payload_json if isinstance(row.payload_json, dict) else None


def _cache_write(path: str, data: dict, ttl_seconds: Optional[int] = None) -> None:
    key = _cache_key(path)
    provider_code = _provider_code_for_cache_key(key)
    if not provider_code:
        return

    ttl = ttl_seconds if isinstance(ttl_seconds, int) and ttl_seconds > 0 else _ttl_from_payload(key, data)
    if ttl <= 0:
        return

    now = _now_utc()
    expires_at = now + timedelta(seconds=ttl)
    method = _method_for_cache_key(key)
    station_id = _extract_airly_station_id(key)

    with SessionLocal() as db:
        provider_id = _provider_id_for_code(db, provider_code)
        if provider_id is None:
            return

        external_station_id = None
        if station_id is not None and provider_code == AIRLY_PROVIDER_CODE:
            external_station_id = _ensure_external_station(
                db=db,
                provider_id=provider_id,
                provider_station_id=station_id,
                station_name=f"Airly station {station_id}",
            )

        existing = db.execute(
            select(ProviderCacheEntry)
            .where(ProviderCacheEntry.provider_id == provider_id)
            .where(ProviderCacheEntry.cache_key == key)
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                ProviderCacheEntry(
                    provider_id=provider_id,
                    cache_key=key,
                    cache_kind=_cache_kind(key),
                    method=method,
                    coord_key=_coord_key(key),
                    external_station_id=external_station_id,
                    variant_key=None,
                    payload_json=data,
                    cached_at=now,
                    expires_at=expires_at,
                    hit_count=0,
                )
            )
        else:
            existing.cache_kind = _cache_kind(key)
            existing.method = method
            existing.coord_key = _coord_key(key)
            existing.external_station_id = external_station_id
            existing.payload_json = data
            existing.cached_at = now
            existing.expires_at = expires_at
            existing.hit_count = 0
            existing.last_used_at = None
        db.commit()


COORD_PRECISION = 3  # ~111m lat resolution


def _index_key(lat: float, lon: float) -> str:
    return f"{lat:.{COORD_PRECISION}f}_{lon:.{COORD_PRECISION}f}"


# ---------------------------
# Geo (Haversine)
# ---------------------------


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance (km) between two lat/lon."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ---------------------------
# Installation index cache (lat/lon -> installationId)
# ---------------------------


def _load_installation_index() -> dict:
    now = _now_utc()
    index: dict[str, int] = {}

    with SessionLocal() as db:
        provider_id = _provider_id_for_code(db, AIRLY_PROVIDER_CODE)
        if provider_id is None:
            return index

        rows = db.execute(
            select(LocationStationCache)
            .where(LocationStationCache.provider_id == provider_id)
            .where(LocationStationCache.expires_at > now)
        ).scalars().all()

        for row in rows:
            if not row.coord_key or row.external_station_id is None:
                continue

            station = db.get(ExternalStation, row.external_station_id)
            if station is None:
                continue
            try:
                station_id = int(station.provider_station_id)
            except (TypeError, ValueError):
                continue
            row.hit_count = (row.hit_count or 0) + 1
            row.last_used_at = now
            index[row.coord_key] = station_id

        db.commit()

    return index


def _save_installation_index(index: dict) -> None:
    now = _now_utc()
    expires_at = now + timedelta(seconds=INSTALLATION_INDEX_TTL)
    with SessionLocal() as db:
        provider_id = _provider_id_for_code(db, AIRLY_PROVIDER_CODE)
        if provider_id is None:
            return

        db.execute(
            delete(LocationStationCache).where(
                LocationStationCache.provider_id == provider_id,
                LocationStationCache.expires_at <= now,
            )
        )

        for coord_key, station_id in index.items():
            if not isinstance(station_id, int) or not coord_key:
                continue
            lat, lon = _parse_coord_key(coord_key)
            external_station_id = _ensure_external_station(
                db=db,
                provider_id=provider_id,
                provider_station_id=station_id,
                lat=lat,
                lon=lon,
            )

            existing = db.execute(
                select(LocationStationCache)
                .where(LocationStationCache.provider_id == provider_id)
                .where(LocationStationCache.coord_key == coord_key)
            ).scalar_one_or_none()
            if existing is None:
                db.add(
                    LocationStationCache(
                        provider_id=provider_id,
                        coord_key=coord_key,
                        lat_rounded=float(lat) if lat is not None else 0.0,
                        lon_rounded=float(lon) if lon is not None else 0.0,
                        external_station_id=external_station_id,
                        distance_km=None,
                        cached_at=now,
                        expires_at=expires_at,
                        hit_count=1,
                        last_used_at=now,
                    )
                )
            else:
                existing.lat_rounded = float(lat) if lat is not None else existing.lat_rounded
                existing.lon_rounded = float(lon) if lon is not None else existing.lon_rounded
                existing.external_station_id = external_station_id
                existing.cached_at = now
                existing.expires_at = expires_at
                existing.last_used_at = now
                existing.hit_count = (existing.hit_count or 0) + 1

        db.commit()


# ---------------------------
# Small normalization helpers
# ---------------------------


def _to_float(x: Any) -> Optional[float]:
=======

@contextmanager
def _db_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------
# Small utility helpers
# ---------------------------


def _to_float(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


def _parse_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None

>>>>>>> database-implementation-2
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))

        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _coord_key(lat: float, lon: float) -> str:
    return f"{lat:.3f}_{lon:.3f}"


def _normalize_address(address: str) -> str:
    return " ".join(address.strip().lower().split())


def _query_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _time_to_key(value: str | None) -> str | None:
    dt = _parse_iso_utc(value)
    if not dt:
        return None
    return dt.astimezone(timezone.utc).replace(
        minute=0,
        second=0,
        microsecond=0,
    ).strftime("%Y-%m-%dT%H:00Z")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------
# Provider / database helpers
# ---------------------------


def _get_provider(db: Session, provider_code: str) -> DataProvider:
    provider = db.execute(
        select(DataProvider).where(DataProvider.provider_code == provider_code)
    ).scalar_one_or_none()

    if provider is None:
        raise RuntimeError(
            f"Missing data_providers row for '{provider_code}'. "
            "Run Alembic migrations so the provider seed migration is applied."
        )

    return provider


def _build_provider_cache_key(
    provider_code: str,
    cache_kind: str,
    method: str,
    coord_key: str,
    variant_key: str | None = None,
) -> str:
    parts = [cache_kind, provider_code, method, coord_key]
    if variant_key:
        parts.append(variant_key)
    return ":".join(parts)


# ---------------------------
# Cache helpers
# ---------------------------


def _read_provider_cache(
    db: Session,
    provider_code: str,
    cache_key: str,
) -> dict[str, Any] | None:
    provider = _get_provider(db, provider_code)
    entry = db.execute(
        select(ProviderCacheEntry).where(
            ProviderCacheEntry.provider_id == provider.id,
            ProviderCacheEntry.cache_key == cache_key,
        )
    ).scalar_one_or_none()

    if entry is None:
        return None

    now = _utc_now()
    if entry.expires_at <= now:
        return None

    entry.last_used_at = now
    entry.hit_count += 1
    db.commit()

    payload = entry.payload_json
    return payload if isinstance(payload, dict) else None


def _write_provider_cache(
    db: Session,
    provider_code: str,
    cache_key: str,
    cache_kind: str,
    method: str | None,
    coord_key: str | None,
    variant_key: str | None,
    payload_json: dict[str, Any],
    ttl_seconds: int,
) -> None:
    provider = _get_provider(db, provider_code)
    now = _utc_now()
    expires_at = now + timedelta(seconds=ttl_seconds)

    entry = db.execute(
        select(ProviderCacheEntry).where(
            ProviderCacheEntry.provider_id == provider.id,
            ProviderCacheEntry.cache_key == cache_key,
        )
    ).scalar_one_or_none()

    if entry is None:
        entry = ProviderCacheEntry(
            provider_id=provider.id,
            cache_key=cache_key,
            cache_kind=cache_kind,
            method=method,
            coord_key=coord_key,
            variant_key=variant_key,
            payload_json=payload_json,
            expires_at=expires_at,
            last_used_at=None,
            hit_count=0,
        )
        db.add(entry)
    else:
        entry.cache_kind = cache_kind
        entry.method = method
        entry.coord_key = coord_key
        entry.variant_key = variant_key
        entry.payload_json = payload_json
        entry.cached_at = now
        entry.expires_at = expires_at

    db.commit()


def _read_geocode_cache(
    db: Session,
    normalized_query: str,
) -> tuple[float, float] | None:
    provider = _get_provider(db, "nominatim")
    query_hash = _query_hash(normalized_query)

    entry = db.execute(
        select(GeocodeCacheEntry).where(
            GeocodeCacheEntry.provider_id == provider.id,
            GeocodeCacheEntry.query_hash == query_hash,
        )
    ).scalar_one_or_none()

    if entry is None:
        return None

    now = _utc_now()
    if entry.expires_at <= now:
        return None

    entry.last_used_at = now
    entry.use_count += 1
    db.commit()

    return float(entry.lat), float(entry.lon)


def _write_geocode_cache(
    db: Session,
    query_text: str,
    normalized_query: str,
    lat: float,
    lon: float,
    display_name: str | None,
    external_place_id: str | None,
) -> None:
    provider = _get_provider(db, "nominatim")
    query_hash = _query_hash(normalized_query)
    now = _utc_now()
    expires_at = now + timedelta(seconds=TTL_GEOCODE)

    entry = db.execute(
        select(GeocodeCacheEntry).where(
            GeocodeCacheEntry.provider_id == provider.id,
            GeocodeCacheEntry.query_hash == query_hash,
        )
    ).scalar_one_or_none()

    if entry is None:
        entry = GeocodeCacheEntry(
            provider_id=provider.id,
            query_hash=query_hash,
            query_text=query_text,
            normalized_query=normalized_query,
            lat=lat,
            lon=lon,
            display_name=display_name,
            external_place_id=external_place_id,
            expires_at=expires_at,
            last_used_at=now,
            use_count=1,
        )
        db.add(entry)
    else:
        entry.query_text = query_text
        entry.normalized_query = normalized_query
        entry.lat = lat
        entry.lon = lon
        entry.display_name = display_name
        entry.external_place_id = external_place_id
        entry.cached_at = now
        entry.expires_at = expires_at
        entry.last_used_at = now
        entry.use_count += 1

    db.commit()


# ---------------------------
# Normalization helpers
# ---------------------------


def _airly_values_to_dict(values: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}

    if not isinstance(values, list):
        return out

    for item in values:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if isinstance(name, str):
            out[name.upper()] = item.get("value")

    return out


def _normalize_airly_timeseries(series: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    if not isinstance(series, list):
        return rows

    for item in series:
        if not isinstance(item, dict):
            continue

        values = _airly_values_to_dict(item.get("values"))
        row = {
            "time": item.get("fromDateTime") or item.get("tillDateTime"),
            "pm25": _to_float(values.get("PM25")),
            "pm10": _to_float(values.get("PM10")),
            "temperature_c": _to_float(values.get("TEMPERATURE")),
            "humidity_pct": _to_float(values.get("HUMIDITY")),
            "pressure_hpa": _to_float(values.get("PRESSURE")),
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "no2": _to_float(values.get("NO2")),
            "co": _to_float(values.get("CO")),
            "o3": _to_float(values.get("O3")),
            "so2": _to_float(values.get("SO2")),
        }
        rows.append(row)

    return rows


def normalize_airly(raw: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    current_section = raw.get("current") or {}
    values = _airly_values_to_dict(current_section.get("values"))

    normalized = {
        "current": {
            "pm25": _to_float(values.get("PM25")),
            "pm10": _to_float(values.get("PM10")),
            "temperature_c": _to_float(values.get("TEMPERATURE")),
            "humidity_pct": _to_float(values.get("HUMIDITY")),
            "pressure_hpa": _to_float(values.get("PRESSURE")),
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "no2": _to_float(values.get("NO2")),
            "co": _to_float(values.get("CO")),
            "o3": _to_float(values.get("O3")),
            "so2": _to_float(values.get("SO2")),
        },
        "history": _normalize_airly_timeseries(raw.get("history")),
        "forecast": _normalize_airly_timeseries(raw.get("forecast")),
        "meta": {
            "timezone": "UTC",
            "units": dict(UNITS),
        },
        "measurement_window": {
            "from": current_section.get("fromDateTime"),
            "to": current_section.get("tillDateTime"),
        },
        "source": source,
        "cache": {
            "created_at": _utc_now().isoformat(),
        },
    }

    if CACHE_RAW:
        normalized["raw"] = raw

    return _finalize_normalized(normalized)


def normalized_has_data(normalized: dict[str, Any]) -> bool:
    current = normalized.get("current") or {}
    return current.get("pm25") is not None or current.get("pm10") is not None


def _normalized_needs_weather(norm: dict[str, Any]) -> bool:
    current = norm.get("current") or {}
    return (
        current.get("temperature_c") is None
        and current.get("humidity_pct") is None
        and current.get("pressure_hpa") is None
    )


def _finalize_normalized(norm: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(norm, dict):
        return norm

    meta = norm.get("meta") or {}
    current = norm.get("current") or {}

    meta["timezone"] = meta.get("timezone") or "UTC"
    meta["units"] = dict(UNITS)
    meta["data_completeness"] = {
        "has_pm": current.get("pm25") is not None or current.get("pm10") is not None,
        "has_weather": any(
            current.get(key) is not None
            for key in ("temperature_c", "humidity_pct", "pressure_hpa", "wind_speed_ms")
        ),
        "has_gases": any(
            current.get(key) is not None for key in ("no2", "co", "o3", "so2")
        ),
    }

    norm["meta"] = meta
    return norm


# ---------------------------
# Provider fetchers
# ---------------------------


def fetch_airly_point(lat: float, lon: float) -> dict[str, Any]:
    if not AIRLY_API_KEY:
        return {}

    response = requests.get(
        AIRLY_POINT_URL,
        headers=AIRLY_HEADERS,
        params={"lat": lat, "lng": lon},
        timeout=12,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def fetch_airly_nearest(lat: float, lon: float, max_distance_km: float) -> dict[str, Any]:
    if not AIRLY_API_KEY:
        return {}

    response = requests.get(
        AIRLY_NEAREST_URL,
        headers=AIRLY_HEADERS,
        params={"lat": lat, "lng": lon, "maxDistanceKM": max_distance_km},
        timeout=12,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def fetch_openaq_latest_nearby(
    lat: float,
    lon: float,
    radius_km: float,
) -> dict[str, Any] | None:
    if not OPENAQ_API_KEY:
        return None

    headers = {"X-API-Key": OPENAQ_API_KEY}
    params = {
        "coordinates": f"{lat},{lon}",
        "radius": int(radius_km * 1000),
        "limit": 50,
        "sort": "distance",
    }

    response = requests.get(OPENAQ_LATEST_URL, headers=headers, params=params, timeout=12)
    if response.status_code == 401:
        raise RuntimeError(
            "OpenAQ unauthorized: check OPENAQ_API_KEY in .env (or old open_aq fallback)."
        )
    response.raise_for_status()

    payload = response.json()
    results = payload.get("results") or []
    if not isinstance(results, list) or not results:
        return None

    for location in results:
        if not isinstance(location, dict):
            continue

        coords = location.get("coordinates") or {}
        lat2 = coords.get("latitude")
        lon2 = coords.get("longitude")
        if lat2 is None or lon2 is None:
            continue

        measurements = location.get("measurements") or []
        pm25 = None
        pm10 = None

        for measurement in measurements:
            if not isinstance(measurement, dict):
                continue
            parameter = (measurement.get("parameter") or "").lower()
            value = _to_float(measurement.get("value"))
            if parameter in ("pm25", "pm2.5"):
                pm25 = value
            elif parameter == "pm10":
                pm10 = value

        if pm25 is None and pm10 is None:
            continue

        distance_km = haversine_km(lat, lon, float(lat2), float(lon2))
        if distance_km > radius_km:
            return None

        normalized = {
            "current": {
                "pm25": pm25,
                "pm10": pm10,
                "temperature_c": None,
                "humidity_pct": None,
                "pressure_hpa": None,
                "wind_speed_ms": None,
                "wind_direction_deg": None,
                "no2": None,
                "co": None,
                "o3": None,
                "so2": None,
            },
            "history": [],
            "forecast": [],
            "meta": {
                "timezone": "UTC",
                "units": dict(UNITS),
            },
            "measurement_window": {"from": None, "to": None},
            "source": {
                "provider": "openaq",
                "method": "nearest_station",
                "max_distance_km": radius_km,
                "distance_km": round(distance_km, 2),
                "location_name": location.get("location") or location.get("name"),
                "message": f"Used OpenAQ nearest station (~{distance_km:.1f} km).",
            },
            "cache": {
                "created_at": _utc_now().isoformat(),
            },
        }

        if CACHE_RAW:
            normalized["raw"] = payload

        return _finalize_normalized(normalized)

    return None


def fetch_openmeteo_air_quality(lat: float, lon: float) -> dict[str, Any] | None:
    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": "UTC",
        "current": "pm10,pm2_5",
        "hourly": "pm10,pm2_5",
        "past_days": 1,
        "forecast_days": 2,
    }

    response = requests.get(OPENMETEO_AQ_URL, params=params, timeout=12)
    response.raise_for_status()
    data = response.json()

    current = data.get("current") or {}
    current_pm25 = _to_float(current.get("pm2_5"))
    current_pm10 = _to_float(current.get("pm10"))
    current_time = current.get("time")

    if current_pm25 is None and current_pm10 is None:
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    pm25_values = hourly.get("pm2_5") or []
    pm10_values = hourly.get("pm10") or []

    now_dt = _parse_iso_utc(current_time) or _utc_now()
    history: list[dict[str, Any]] = []
    forecast: list[dict[str, Any]] = []

    total = min(len(times), len(pm25_values), len(pm10_values))
    for index in range(total):
        item_time = times[index]
        item_dt = _parse_iso_utc(item_time)
        if not item_dt:
            continue

        row = {
            "time": item_time if item_time.endswith("Z") else f"{item_time}Z",
            "pm25": _to_float(pm25_values[index]),
            "pm10": _to_float(pm10_values[index]),
            "temperature_c": None,
            "humidity_pct": None,
            "pressure_hpa": None,
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "no2": None,
            "co": None,
            "o3": None,
            "so2": None,
        }

        diff_hours = (item_dt - now_dt).total_seconds() / 3600.0
        if diff_hours <= 0 and abs(diff_hours) <= OPENMETEO_PAST_HOURS:
            history.append(row)
        elif diff_hours > 0 and diff_hours <= OPENMETEO_FUTURE_HOURS:
            forecast.append(row)

    normalized = {
        "current": {
            "pm25": current_pm25,
            "pm10": current_pm10,
            "temperature_c": None,
            "humidity_pct": None,
            "pressure_hpa": None,
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "no2": None,
            "co": None,
            "o3": None,
            "so2": None,
        },
        "history": history,
        "forecast": forecast,
        "meta": {
            "timezone": "UTC",
            "units": dict(UNITS),
        },
        "measurement_window": {
            "from": current_time,
            "to": current_time,
        },
        "source": {
            "provider": "open-meteo",
            "method": "model",
            "message": "Model-based estimate (not station-measured).",
        },
        "cache": {
            "created_at": _utc_now().isoformat(),
        },
    }

    if CACHE_RAW:
        normalized["raw"] = data

    return _finalize_normalized(normalized)


def fetch_openmeteo_weather(lat: float, lon: float) -> dict[str, Any] | None:
    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": "UTC",
        "current": (
            "temperature_2m,relative_humidity_2m,pressure_msl,"
            "wind_speed_10m,wind_direction_10m"
        ),
        "hourly": (
            "temperature_2m,relative_humidity_2m,pressure_msl,"
            "wind_speed_10m,wind_direction_10m"
        ),
        "past_days": 1,
        "forecast_days": 2,
    }

    response = requests.get(OPENMETEO_WEATHER_URL, params=params, timeout=12)
    response.raise_for_status()
    data = response.json()

    current = data.get("current") or {}
    hourly = data.get("hourly") or {}

    times = hourly.get("time") or []
    temp_values = hourly.get("temperature_2m") or []
    humidity_values = hourly.get("relative_humidity_2m") or []
    pressure_values = hourly.get("pressure_msl") or []
    wind_speed_values = hourly.get("wind_speed_10m") or []
    wind_direction_values = hourly.get("wind_direction_10m") or []

    rows: list[dict[str, Any]] = []
    total = min(
        len(times),
        len(temp_values),
        len(humidity_values),
        len(pressure_values),
        len(wind_speed_values),
        len(wind_direction_values),
    )

    for index in range(total):
        item_time = times[index]
        rows.append(
            {
                "time": (
                    item_time
                    if isinstance(item_time, str) and item_time.endswith("Z")
                    else f"{item_time}Z"
                ),
                "temperature_c": _to_float(temp_values[index]),
                "humidity_pct": _to_float(humidity_values[index]),
                "pressure_hpa": _to_float(pressure_values[index]),
                "wind_speed_ms": _to_float(wind_speed_values[index]),
                "wind_direction_deg": _to_float(wind_direction_values[index]),
            }
        )

    weather = {
        "current": {
            "time": current.get("time"),
            "temperature_c": _to_float(current.get("temperature_2m")),
            "humidity_pct": _to_float(current.get("relative_humidity_2m")),
            "pressure_hpa": _to_float(current.get("pressure_msl")),
            "wind_speed_ms": _to_float(current.get("wind_speed_10m")),
            "wind_direction_deg": _to_float(current.get("wind_direction_10m")),
        },
        "hourly": rows,
        "_source": {
            "provider": "open-meteo",
            "type": "weather_model",
            "message": "Weather values are model-based estimates (not local sensor).",
        },
    }

    if CACHE_RAW:
        weather["raw"] = data

    return weather


# ---------------------------
# Weather enrichment helpers
# ---------------------------


def _merge_weather_into_normalized(
    norm: dict[str, Any],
    weather_data: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(norm, dict) or not isinstance(weather_data, dict):
        return _finalize_normalized(norm)

    weather_rows = weather_data.get("hourly") or []
    weather_map: dict[str, dict[str, Any]] = {}

    if isinstance(weather_rows, list):
        for row in weather_rows:
            if not isinstance(row, dict):
                continue
            key = _time_to_key(row.get("time"))
            if key:
                weather_map[key] = row

    current_key = _time_to_key((norm.get("measurement_window") or {}).get("from"))
    if current_key is None:
        current_key = _utc_now().astimezone(timezone.utc).replace(
            minute=0,
            second=0,
            microsecond=0,
        ).strftime("%Y-%m-%dT%H:00Z")

    current = norm.get("current") or {}
    weather_current = weather_map.get(current_key)
    if weather_current:
        if current.get("temperature_c") is None:
            current["temperature_c"] = weather_current.get("temperature_c")
        if current.get("humidity_pct") is None:
            current["humidity_pct"] = weather_current.get("humidity_pct")
        if current.get("pressure_hpa") is None:
            current["pressure_hpa"] = weather_current.get("pressure_hpa")
        if current.get("wind_speed_ms") is None:
            current["wind_speed_ms"] = weather_current.get("wind_speed_ms")
        if current.get("wind_direction_deg") is None:
            current["wind_direction_deg"] = weather_current.get("wind_direction_deg")
        norm["current"] = current

    for series_name in ("history", "forecast"):
        series = norm.get(series_name)
        if not isinstance(series, list):
            continue

        for row in series:
            if not isinstance(row, dict):
                continue

            key = _time_to_key(row.get("time"))
            if not key:
                continue

            weather_row = weather_map.get(key)
            if not weather_row:
                continue

            if row.get("temperature_c") is None:
                row["temperature_c"] = weather_row.get("temperature_c")
            if row.get("humidity_pct") is None:
                row["humidity_pct"] = weather_row.get("humidity_pct")
            if row.get("pressure_hpa") is None:
                row["pressure_hpa"] = weather_row.get("pressure_hpa")
            if row.get("wind_speed_ms") is None:
                row["wind_speed_ms"] = weather_row.get("wind_speed_ms")
            if row.get("wind_direction_deg") is None:
                row["wind_direction_deg"] = weather_row.get("wind_direction_deg")

    meta = norm.get("meta") or {}
    meta["units"] = dict(UNITS)
    meta["weather_source"] = weather_data.get("_source") or {
        "provider": "open-meteo",
        "type": "weather_model",
        "message": "Weather values are model-based estimates (not local sensor).",
    }
    norm["meta"] = meta

    return _finalize_normalized(norm)


def enrich_with_weather_if_missing(
    db: Session,
    lat: float,
    lon: float,
    normalized: dict[str, Any],
) -> dict[str, Any]:
    if not _normalized_needs_weather(normalized):
        return _finalize_normalized(normalized)

<<<<<<< HEAD
    meta = norm.get("meta") or {}
    meta["timezone"] = meta.get("timezone") or "UTC"
    meta["units"] = dict(UNITS)

    cur = norm.get("current") or {}
    meta["data_completeness"] = {
        "has_pm": (cur.get("pm25") is not None) or (cur.get("pm10") is not None),
        "has_weather": any(
            cur.get(k) is not None
            for k in ("temperature_c", "humidity_pct", "pressure_hpa", "wind_speed_ms")
        ),
        "has_gases": any(cur.get(k) is not None for k in ("no2", "co", "o3", "so2")),
    }
    norm["meta"] = meta
    return norm


# ---------------------------
# Main retrieval (normalized + caching)
# ---------------------------


def get_air_quality_data(lat: float, lon: float) -> Dict[str, Any]:
    """
    Returns NORMALIZED data (not raw), with fallbacks:
      1) Airly /point
      2) Airly /nearest (<= AIRLY_NEAREST_MAX_DISTANCE_KM)
      3) OpenAQ nearest (<= OPENAQ_MAX_DISTANCE_KM)
      4) Open-Meteo AQ model (always available)
    Then: weather enrichment (Open-Meteo weather) if temp/humidity/pressure missing.
    """
    key = _index_key(lat, lon)

    # ---------- 1) Airly point ----------
    airly_point_cache = _cache_path(f"norm_airly_point_{key}.json")
    cached = _cache_read(airly_point_cache, TTL_CURRENT)
    if cached and isinstance(cached, dict) and normalized_has_data(cached):
        return enrich_with_weather_if_missing(lat, lon, cached)

    raw_point = {}
    if AIRLY_KEY:
        try:
            raw_point = fetch_airly_point(lat, lon)
        except requests.RequestException as e:
            if DEBUG:
                print(f"DEBUG: Airly /point failed: {e}")

    point_source = {
        "provider": "airly" if AIRLY_KEY else "airly",
        "method": "point",
        "message": "Used interpolated point measurements (if available).",
    }
    norm_point = normalize_airly(raw_point, point_source)

    if normalized_has_data(norm_point):
        norm_point["cache"]["ttl_sec"] = TTL_CURRENT
        _cache_write(airly_point_cache, norm_point)
        return enrich_with_weather_if_missing(lat, lon, norm_point)

    # ---------- 2) Airly nearest ----------
    if AIRLY_KEY:
        index = _load_installation_index()
        inst_id = index.get(key)

        if isinstance(inst_id, int):
            airly_station_cache = _cache_path(
                f"norm_airly_station_{inst_id}_{AIRLY_NEAREST_MAX_DISTANCE_KM}km.json"
            )
            cached_station = _cache_read(airly_station_cache, TTL_STATION)
            if cached_station and isinstance(cached_station, dict) and normalized_has_data(cached_station):
                return enrich_with_weather_if_missing(lat, lon, cached_station)

        raw_nearest = {}
        try:
            raw_nearest = fetch_airly_nearest(lat, lon, max_distance_km=AIRLY_NEAREST_MAX_DISTANCE_KM)
        except requests.RequestException as e:
            if DEBUG:
                print(f"DEBUG: Airly /nearest failed: {e}")

        if raw_nearest:
            inst_id2 = get_airly_installation_id(raw_nearest)
            coords = get_airly_installation_coords(raw_nearest)
            distance_km = None
            if coords:
                distance_km = haversine_km(lat, lon, coords[0], coords[1])

            msg = f"/point had no values, so used Airly nearest (<= {AIRLY_NEAREST_MAX_DISTANCE_KM} km)."
            if distance_km is not None:
                if distance_km <= INTERPOLATION_CLOSE_KM:
                    msg = (
                        f"/point had no values, but nearest station is very close (~{distance_km:.1f} km). "
                        f"Using nearest station."
                    )
                else:
                    msg += f" Nearest station is ~{distance_km:.1f} km away."
            else:
                msg += " (Distance unknown.)"

            nearest_source = {
                "provider": "airly",
                "method": "nearest_station",
                "max_distance_km": AIRLY_NEAREST_MAX_DISTANCE_KM,
                "installation_id": inst_id2,
                "distance_km": round(distance_km, 2) if distance_km is not None else None,
                "message": msg,
            }

            norm_nearest = normalize_airly(raw_nearest, nearest_source)

            if normalized_has_data(norm_nearest):
                norm_nearest["cache"]["ttl_sec"] = TTL_STATION

                if isinstance(inst_id2, int):
                    airly_station_cache = _cache_path(
                        f"norm_airly_station_{inst_id2}_{AIRLY_NEAREST_MAX_DISTANCE_KM}km.json"
                    )
                    _cache_write(airly_station_cache, norm_nearest)
                    index[key] = inst_id2
                    _save_installation_index(index)
                else:
                    airly_nearest_cache = _cache_path(
                        f"norm_airly_nearest_{key}_{AIRLY_NEAREST_MAX_DISTANCE_KM}km.json"
                    )
                    _cache_write(airly_nearest_cache, norm_nearest)

                return enrich_with_weather_if_missing(lat, lon, norm_nearest)

    # ---------- 3) OpenAQ nearest ----------
    openaq_cache = _cache_path(f"norm_openaq_nearest_{key}_{OPENAQ_MAX_DISTANCE_KM}km.json")
    cached_openaq = _cache_read(openaq_cache, TTL_STATION)
    if cached_openaq and isinstance(cached_openaq, dict) and normalized_has_data(cached_openaq):
        return enrich_with_weather_if_missing(lat, lon, cached_openaq)

    norm_openaq = None
    try:
        norm_openaq = fetch_openaq_latest_nearby(lat, lon, radius_km=OPENAQ_MAX_DISTANCE_KM)
    except (requests.RequestException, RuntimeError) as e:
        if DEBUG:
            print(f"DEBUG: OpenAQ failed: {e}")

    if norm_openaq and normalized_has_data(norm_openaq):
        norm_openaq["cache"]["ttl_sec"] = TTL_STATION
        _cache_write(openaq_cache, norm_openaq)
        return enrich_with_weather_if_missing(lat, lon, norm_openaq)

    # ---------- 4) Open-Meteo AQ model ----------
    openmeteo_cache = _cache_path(
        f"norm_openmeteo_model_{key}_{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h.json"
=======
    coord_key = _coord_key(lat, lon)
    variant_key = f"{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h"
    cache_key = _build_provider_cache_key(
        provider_code="open-meteo",
        cache_kind="weather",
        method="model",
        coord_key=coord_key,
        variant_key=variant_key,
>>>>>>> database-implementation-2
    )

    weather_data = _read_provider_cache(
        db=db,
        provider_code="open-meteo",
        cache_key=cache_key,
    )

    if weather_data is None:
        try:
            weather_data = fetch_openmeteo_weather(lat, lon)
        except requests.RequestException as exc:
            if DEBUG:
                print(f"DEBUG: Open-Meteo weather failed: {exc}")
            weather_data = None

        if weather_data:
            _write_provider_cache(
                db=db,
                provider_code="open-meteo",
                cache_key=cache_key,
                cache_kind="weather",
                method="model",
                coord_key=coord_key,
                variant_key=variant_key,
                payload_json=weather_data,
                ttl_seconds=TTL_WEATHER,
            )

    if weather_data:
        return _merge_weather_into_normalized(normalized, weather_data)

    return _finalize_normalized(normalized)


# ---------------------------
# Public functions
# ---------------------------


<<<<<<< HEAD
def _geocode_cache_key(normalized_address: str) -> str:
    return hashlib.sha256(normalized_address.encode("utf-8")).hexdigest()[:16]


def _normalize_address(address: str) -> str:
    """Normalize address input so equivalent strings map to the same cache key."""
    return " ".join(address.strip().lower().split())


def get_lat_lon_nominatim_cached(address: str) -> Optional[Tuple[float, float]]:
    """
    Translate an address into (lat, lon) using Nominatim with local caching.
    Cache-first flow:
      1) Normalize + lookup cache key
      2) If fresh, return cached coordinates
      3) Else query Nominatim and update cache
    """
=======
def get_lat_lon_nominatim_cached(address: str) -> tuple[float, float] | None:
>>>>>>> database-implementation-2
    normalized_address = _normalize_address(address)
    if not normalized_address:
        print("Error: Address cannot be empty.")
        return None

<<<<<<< HEAD
    query_hash = _geocode_cache_key(normalized_address)
    now = _now_utc()

    with SessionLocal() as db:
        provider_id = _provider_id_for_code(db, NOMINATIM_PROVIDER_CODE)
        if provider_id is None:
            print("Nominatim provider is not configured in data_providers.")
            return None

        cached_entry = db.execute(
            select(GeocodeCacheEntry).where(
                GeocodeCacheEntry.provider_id == provider_id,
                GeocodeCacheEntry.query_hash == query_hash,
            )
        ).scalar_one_or_none()

        if cached_entry is not None:
            if cached_entry.expires_at is not None and cached_entry.expires_at > now:
                cached_entry.use_count = (cached_entry.use_count or 0) + 1
                cached_entry.last_used_at = now
                db.commit()
                print("Using cached Nominatim geocode data.")
                return float(cached_entry.lat), float(cached_entry.lon)

            db.delete(cached_entry)
            db.commit()
            print("Cached geocode entry is too old. Fetching fresh Nominatim data.")
        else:
            print("No cached Nominatim entry found. Fetching from Nominatim.")
=======
    with _db_session() as db:
        cached = _read_geocode_cache(db, normalized_address)
        if cached is not None:
            return cached

        headers = {"User-Agent": NOMINATIM_USER_AGENT}
        params = {
            "q": address,
            "format": "jsonv2",
            "limit": 1,
            "addressdetails": 1,
        }
        if NOMINATIM_EMAIL:
            params["email"] = NOMINATIM_EMAIL

        try:
            time.sleep(1.2)
            response = requests.get(
                NOMINATIM_URL,
                params=params,
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()

            results = response.json()
            if not results:
                print(f"Address '{address}' not found in Nominatim.")
                return None

            first = results[0]
            lat = float(first["lat"])
            lon = float(first["lon"])
>>>>>>> database-implementation-2

            _write_geocode_cache(
                db=db,
                query_text=address,
                normalized_query=normalized_address,
                lat=lat,
                lon=lon,
                display_name=first.get("display_name"),
                external_place_id=(
                    str(first.get("place_id"))
                    if first.get("place_id") is not None
                    else None
                ),
            )

            return lat, lon

        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 403:
                print(
                    "Nominatim blocked the request (403). "
                    "Set NOMINATIM_USER_AGENT and optionally NOMINATIM_EMAIL in .env."
                )
            print(f"Nominatim request error: {exc}")
            return None
        except requests.RequestException as exc:
            print(f"Nominatim request error: {exc}")
            return None
        except (KeyError, TypeError, ValueError) as exc:
            print(f"Unexpected Nominatim response format: {exc}")
            return None

<<<<<<< HEAD
        first_result = results[0]
        lat = float(first_result["lat"])
        lon = float(first_result["lon"])
        place_id = first_result.get("place_id")
        place_id_text = str(place_id) if place_id is not None else None

        with SessionLocal() as db:
            provider_id = _provider_id_for_code(db, NOMINATIM_PROVIDER_CODE)
            if provider_id is None:
                return lat, lon

            cached_entry = db.execute(
                select(GeocodeCacheEntry).where(
                    GeocodeCacheEntry.provider_id == provider_id,
                    GeocodeCacheEntry.query_hash == query_hash,
                )
            ).scalar_one_or_none()

            expires_at = now + timedelta(seconds=nominatim_cache_limit)
            if cached_entry is None:
                db.add(
                    GeocodeCacheEntry(
                        provider_id=provider_id,
                        query_hash=query_hash,
                        query_text=address,
                        normalized_query=normalized_address,
                        lat=lat,
                        lon=lon,
                        display_name=first_result.get("display_name"),
                        external_place_id=place_id_text,
                        cached_at=now,
                        expires_at=expires_at,
                        last_used_at=now,
                        use_count=1,
                    )
                )
            else:
                cached_entry.query_text = address
                cached_entry.normalized_query = normalized_address
                cached_entry.lat = lat
                cached_entry.lon = lon
                cached_entry.display_name = first_result.get("display_name")
                cached_entry.external_place_id = place_id_text
                cached_entry.cached_at = now
                cached_entry.expires_at = expires_at
                cached_entry.last_used_at = now
                cached_entry.use_count = (cached_entry.use_count or 0) + 1

            db.commit()

        print("Cached Nominatim geocode result in DB.")
=======

def get_air_quality_data(lat: float, lon: float) -> dict[str, Any]:
    coord_key = _coord_key(lat, lon)
>>>>>>> database-implementation-2

    with _db_session() as db:
        if AIRLY_API_KEY:
            airly_point_variant = "default"
            airly_point_cache_key = _build_provider_cache_key(
                provider_code="airly",
                cache_kind="aq_normalized",
                method="point",
                coord_key=coord_key,
                variant_key=airly_point_variant,
            )

            cached_point = _read_provider_cache(
                db=db,
                provider_code="airly",
                cache_key=airly_point_cache_key,
            )
            if cached_point and normalized_has_data(cached_point):
                return enrich_with_weather_if_missing(db, lat, lon, cached_point)

            try:
                raw_point = fetch_airly_point(lat, lon)
            except requests.RequestException as exc:
                if DEBUG:
                    print(f"DEBUG: Airly /point failed: {exc}")
                raw_point = {}

            point_source = {
                "provider": "airly",
                "method": "point",
                "message": "Used interpolated point measurements (if available).",
            }
            normalized_point = normalize_airly(raw_point, point_source)

            if normalized_has_data(normalized_point):
                _write_provider_cache(
                    db=db,
                    provider_code="airly",
                    cache_key=airly_point_cache_key,
                    cache_kind="aq_normalized",
                    method="point",
                    coord_key=coord_key,
                    variant_key=airly_point_variant,
                    payload_json=normalized_point,
                    ttl_seconds=TTL_CURRENT,
                )
                return enrich_with_weather_if_missing(db, lat, lon, normalized_point)

            airly_nearest_variant = f"{AIRLY_NEAREST_MAX_DISTANCE_KM}km"
            airly_nearest_cache_key = _build_provider_cache_key(
                provider_code="airly",
                cache_kind="aq_normalized",
                method="nearest_station",
                coord_key=coord_key,
                variant_key=airly_nearest_variant,
            )

            cached_nearest = _read_provider_cache(
                db=db,
                provider_code="airly",
                cache_key=airly_nearest_cache_key,
            )
            if cached_nearest and normalized_has_data(cached_nearest):
                return enrich_with_weather_if_missing(db, lat, lon, cached_nearest)

            raw_nearest: dict[str, Any] = {}
            try:
                raw_nearest = fetch_airly_nearest(
                    lat=lat,
                    lon=lon,
                    max_distance_km=AIRLY_NEAREST_MAX_DISTANCE_KM,
                )
            except requests.RequestException as exc:
                if DEBUG:
                    print(f"DEBUG: Airly /nearest failed: {exc}")

            if raw_nearest:
                installation = raw_nearest.get("installation") or {}
                location = installation.get("location") or {}

                station_lat = _to_float(location.get("latitude"))
                station_lon = _to_float(location.get("longitude"))
                distance_km = None
                if station_lat is not None and station_lon is not None:
                    distance_km = haversine_km(lat, lon, station_lat, station_lon)

                message = (
                    f"/point had no values, so used Airly nearest "
                    f"(<= {AIRLY_NEAREST_MAX_DISTANCE_KM} km)."
                )
                if distance_km is not None:
                    if distance_km <= INTERPOLATION_CLOSE_KM:
                        message = (
                            "/point had no values, but nearest station is very close "
                            f"(~{distance_km:.1f} km). Using nearest station."
                        )
                    else:
                        message += f" Nearest station is ~{distance_km:.1f} km away."

                nearest_source = {
                    "provider": "airly",
                    "method": "nearest_station",
                    "max_distance_km": AIRLY_NEAREST_MAX_DISTANCE_KM,
                    "installation_id": installation.get("id"),
                    "distance_km": round(distance_km, 2) if distance_km is not None else None,
                    "message": message,
                }

                normalized_nearest = normalize_airly(raw_nearest, nearest_source)
                if normalized_has_data(normalized_nearest):
                    _write_provider_cache(
                        db=db,
                        provider_code="airly",
                        cache_key=airly_nearest_cache_key,
                        cache_kind="aq_normalized",
                        method="nearest_station",
                        coord_key=coord_key,
                        variant_key=airly_nearest_variant,
                        payload_json=normalized_nearest,
                        ttl_seconds=TTL_STATION,
                    )
                    return enrich_with_weather_if_missing(db, lat, lon, normalized_nearest)

        openaq_variant = f"{OPENAQ_MAX_DISTANCE_KM}km"
        openaq_station_lookup_key = _build_provider_cache_key(
            provider_code="openaq",
            cache_kind="station_lookup",
            method="nearest_station",
            coord_key=coord_key,
            variant_key=openaq_variant,
        )

        cached_station_lookup = _read_provider_cache(
            db=db,
            provider_code="openaq",
            cache_key=openaq_station_lookup_key,
        )
        if cached_station_lookup is not None:
            if cached_station_lookup.get("found") is True:
                cached_normalized = cached_station_lookup.get("normalized")
                if (
                    isinstance(cached_normalized, dict)
                    and normalized_has_data(cached_normalized)
                ):
                    return enrich_with_weather_if_missing(db, lat, lon, cached_normalized)

        normalized_openaq = None
        try:
            normalized_openaq = fetch_openaq_latest_nearby(
                lat=lat,
                lon=lon,
                radius_km=OPENAQ_MAX_DISTANCE_KM,
            )
        except (requests.RequestException, RuntimeError) as exc:
            if DEBUG:
                print(f"DEBUG: OpenAQ failed: {exc}")

        if normalized_openaq and normalized_has_data(normalized_openaq):
            station_payload = {
                "found": True,
                "normalized": normalized_openaq,
            }
            _write_provider_cache(
                db=db,
                provider_code="openaq",
                cache_key=openaq_station_lookup_key,
                cache_kind="station_lookup",
                method="nearest_station",
                coord_key=coord_key,
                variant_key=openaq_variant,
                payload_json=station_payload,
                ttl_seconds=TTL_STATION,
            )
            return enrich_with_weather_if_missing(db, lat, lon, normalized_openaq)

        _write_provider_cache(
            db=db,
            provider_code="openaq",
            cache_key=openaq_station_lookup_key,
            cache_kind="station_lookup",
            method="nearest_station",
            coord_key=coord_key,
            variant_key=openaq_variant,
            payload_json={
                "found": False,
                "reason": "No OpenAQ station with PM2.5/PM10 was found within radius.",
            },
            ttl_seconds=TTL_STATION,
        )

        openmeteo_variant = f"{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h"
        openmeteo_cache_key = _build_provider_cache_key(
            provider_code="open-meteo",
            cache_kind="aq_normalized",
            method="model",
            coord_key=coord_key,
            variant_key=openmeteo_variant,
        )

        cached_model = _read_provider_cache(
            db=db,
            provider_code="open-meteo",
            cache_key=openmeteo_cache_key,
        )
        if cached_model and normalized_has_data(cached_model):
            return enrich_with_weather_if_missing(db, lat, lon, cached_model)

        normalized_model = None
        try:
            normalized_model = fetch_openmeteo_air_quality(lat, lon)
        except requests.RequestException as exc:
            if DEBUG:
                print(f"DEBUG: Open-Meteo AQ failed: {exc}")

        if normalized_model and normalized_has_data(normalized_model):
            _write_provider_cache(
                db=db,
                provider_code="open-meteo",
                cache_key=openmeteo_cache_key,
                cache_kind="aq_normalized",
                method="model",
                coord_key=coord_key,
                variant_key=openmeteo_variant,
                payload_json=normalized_model,
                ttl_seconds=TTL_MODEL,
            )
            return enrich_with_weather_if_missing(db, lat, lon, normalized_model)

        empty = {
            "current": {
                "pm25": None,
                "pm10": None,
                "temperature_c": None,
                "humidity_pct": None,
                "pressure_hpa": None,
                "wind_speed_ms": None,
                "wind_direction_deg": None,
                "no2": None,
                "co": None,
                "o3": None,
                "so2": None,
            },
            "history": [],
            "forecast": [],
            "meta": {
                "timezone": "UTC",
                "units": dict(UNITS),
            },
            "measurement_window": {
                "from": None,
                "to": None,
            },
            "source": {
                "provider": "none",
                "method": "none",
                "message": (
                    f"No values from Airly (/point, /nearest {AIRLY_NEAREST_MAX_DISTANCE_KM}km), "
                    f"OpenAQ ({OPENAQ_MAX_DISTANCE_KM}km), or Open-Meteo."
                ),
            },
            "cache": {
                "created_at": _utc_now().isoformat(),
            },
        }
        return _finalize_normalized(empty)


# ---------------------------
# CLI smoke test
# ---------------------------

if __name__ == "__main__":
    if not AIRLY_API_KEY:
        print("Warning: Missing AIRLY_API_KEY in .env. Airly will be skipped.")

    lat, lon = 59.292255694378156, 18.062688971478863

    normalized = get_air_quality_data(lat, lon)
    print(json.dumps(normalized, indent=2, ensure_ascii=False))

    coords = get_lat_lon_nominatim_cached("Kungsgatan 4, Stockholm")
    print("Coords:", coords)