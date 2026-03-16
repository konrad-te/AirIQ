from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import SessionLocal
from models import DataProvider, GeocodeCacheEntry, ProviderCacheEntry

# ---------------------------
# Configuration
# ---------------------------

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

TTL_CURRENT = 10 * 60
TTL_STATION = 10 * 60
TTL_MODEL = 20 * 60
TTL_WEATHER = 30 * 60
TTL_GEOCODE = 30 * 24 * 3600

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

EU_AQI_LABELS = {
    1: "Very good",
    2: "Good",
    3: "Medium",
    4: "Poor",
    5: "Very poor",
    6: "Extremely poor",
}

# ---------------------------
# Session helpers
# ---------------------------


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

        source = {
            "provider": "openaq",
            "method": "nearest_station",
            "max_distance_km": radius_km,
            "distance_km": round(dist, 2),
            "location_name": loc.get("location") or loc.get("name"),
            "message": f"Used OpenAQ nearest station (~{dist:.1f} km).",
            "user_message": f"Based on measurements from a nearby station {dist:.1f} km away.",
        }

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

    source = {
        "provider": "open-meteo",
        "method": "model",
        "message": "Model-based estimate (not station-measured).",
        "user_message": "Estimated from air quality models for your area.",
    }

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

    return normalized


def get_openmeteo_air_quality_cached(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    key = _index_key(lat, lon)
    openmeteo_cache = _cache_path(
        f"norm_openmeteo_model_{key}_{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h.json"
    )
    cached = _cache_read(openmeteo_cache, TTL_MODEL)
    if cached and isinstance(cached, dict) and normalized_has_data(cached):
        return cached

    norm_model = fetch_openmeteo_air_quality(lat, lon)
    if norm_model and normalized_has_data(norm_model):
        norm_model["cache"]["ttl_sec"] = TTL_MODEL
        _cache_write(openmeteo_cache, norm_model)
        return norm_model

    return None


# ---------------------------
# Open-Meteo Weather enrichment
# ---------------------------


def _normalized_needs_weather(norm: Dict[str, Any]) -> bool:
    cur = norm.get("current") or {}
    return (
        cur.get("temperature_c") is None
        and cur.get("humidity_pct") is None
        and cur.get("pressure_hpa") is None
    )


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


def _eu_aqi_level_pm25(value: Optional[float]) -> Optional[int]:
    if value is None or value < 0:
        return None
    if value <= 10:
        return 1
    if value <= 20:
        return 2
    if value <= 25:
        return 3
    if value <= 50:
        return 4
    if value <= 75:
        return 5
    return 6


def _eu_aqi_level_pm10(value: Optional[float]) -> Optional[int]:
    if value is None or value < 0:
        return None
    if value <= 20:
        return 1
    if value <= 40:
        return 2
    if value <= 50:
        return 3
    if value <= 100:
        return 4
    if value <= 150:
        return 5
    return 6


def _build_eu_aqi(current: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    pm25 = _to_float(current.get("pm25"))
    pm10 = _to_float(current.get("pm10"))

    candidates: List[Tuple[str, int]] = []
    pm25_level = _eu_aqi_level_pm25(pm25)
    pm10_level = _eu_aqi_level_pm10(pm10)

    if pm25_level is not None:
        candidates.append(("pm25", pm25_level))
    if pm10_level is not None:
        candidates.append(("pm10", pm10_level))

    if not candidates:
        return None

    dominant_pollutant, value = max(candidates, key=lambda item: item[1])
    return {
        "scheme": "eu",
        "value": value,
        "label": EU_AQI_LABELS[value],
        "dominant_pollutant": dominant_pollutant,
    }


def _build_provenance(
    provider: Optional[str],
    method: Optional[str],
    *,
    is_forecast: bool,
    distance_km: Optional[float] = None,
    is_fallback: bool = False,
) -> Dict[str, Any]:
    if provider == "open-meteo":
        confidence = "low"
        label = "Lower confidence"
        detail = "Open-Meteo fallback." if is_fallback else (
            "Open-Meteo model forecast for this area." if is_forecast else "Open-Meteo model estimate for this area."
        )
    elif provider == "openaq":
        confidence = "medium"
        label = "Medium confidence"
        detail = (
            f"OpenAQ nearby station {distance_km:.1f} km away."
            if distance_km is not None
            else "OpenAQ nearby station."
        )
    elif provider == "airly" and method == "nearest_station":
        confidence = "high"
        label = "High confidence"
        detail = (
            f"Airly forecast from station {distance_km:.1f} km away."
            if is_forecast and distance_km is not None
            else f"Airly nearby station {distance_km:.1f} km away."
            if distance_km is not None
            else ("Airly forecast." if is_forecast else "Airly nearby station.")
        )
    elif provider == "airly" and method == "point":
        confidence = "high"
        label = "High confidence"
        detail = "Airly forecast." if is_forecast else "Airly local data."
    else:
        confidence = "unknown"
        label = "Unknown confidence"
        detail = "Source quality unavailable."

    return {
        "provider": provider,
        "method": method,
        "distance_km": round(distance_km, 2) if distance_km is not None else None,
        "confidence": confidence,
        "confidence_label": label,
        "detail": detail,
        "is_fallback": is_fallback,
    }


def _annotate_normalized_provenance(norm: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(norm, dict):
        return norm

    source = norm.get("source") or {}
    provider = source.get("provider")
    method = source.get("method")
    distance_km = _to_float(source.get("distance_km"))

    cur = norm.get("current")
    if isinstance(cur, dict) and "provenance" not in cur:
        cur["provenance"] = _build_provenance(
            provider,
            method,
            is_forecast=False,
            distance_km=distance_km,
            is_fallback=False,
        )

    for series_name in ("history", "forecast"):
        series = norm.get(series_name)
        if not isinstance(series, list):
            continue
        for row in series:
            if not isinstance(row, dict):
                continue
            if "provenance" not in row:
                row["provenance"] = _build_provenance(
                    provider,
                    method,
                    is_forecast=(series_name == "forecast"),
                    distance_km=distance_km,
                    is_fallback=False,
                )

    return norm


def _merge_series_with_model_fallback(
    primary_series: Any,
    model_series: Any,
    *,
    is_forecast: bool,
) -> Tuple[List[Dict[str, Any]], int]:
    primary_list = primary_series if isinstance(primary_series, list) else []
    model_list = model_series if isinstance(model_series, list) else []

    by_key: Dict[str, Dict[str, Any]] = {}
    fallback_count = 0

    for row in primary_list:
        if not isinstance(row, dict):
            continue
        key = _time_to_key(row.get("time", ""))
        if not key:
            continue
        cloned = dict(row)
        cloned["provenance"] = dict(row.get("provenance") or {})
        by_key[key] = cloned

    for model_row in model_list:
        if not isinstance(model_row, dict):
            continue
        key = _time_to_key(model_row.get("time", ""))
        if not key:
            continue

        primary_row = by_key.get(key)
        if primary_row is None:
            cloned = dict(model_row)
            cloned["provenance"] = dict(model_row.get("provenance") or {})
            by_key[key] = cloned
            fallback_count += 1
            continue

        used_fallback = False
        for pollutant in ("pm25", "pm10"):
            if primary_row.get(pollutant) is None and model_row.get(pollutant) is not None:
                primary_row[pollutant] = model_row.get(pollutant)
                used_fallback = True

        if used_fallback:
            primary_row["fallback_provenance"] = dict(model_row.get("provenance") or {})
            fallback_count += 1

    merged = list(by_key.values())
    merged.sort(key=lambda row: row.get("time") or "")
    return merged, fallback_count


def fill_missing_timeseries_with_model(lat: float, lon: float, norm: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(norm, dict):
        return norm

    source = norm.get("source") or {}
    if source.get("provider") == "open-meteo":
        return norm

    model_norm = get_openmeteo_air_quality_cached(lat, lon)
    if not model_norm:
        return norm

    _annotate_normalized_provenance(model_norm)
    _annotate_normalized_provenance(norm)

    history, history_fallback_count = _merge_series_with_model_fallback(
        norm.get("history"),
        model_norm.get("history"),
        is_forecast=False,
    )
    forecast, forecast_fallback_count = _merge_series_with_model_fallback(
        norm.get("forecast"),
        model_norm.get("forecast"),
        is_forecast=True,
    )
    norm["history"] = history
    norm["forecast"] = forecast

    if (norm.get("current") or {}).get("pm25") is None and (model_norm.get("current") or {}).get("pm25") is not None:
        norm["current"]["pm25"] = model_norm["current"]["pm25"]
        norm["current"]["fallback_provenance"] = dict(model_norm["current"].get("provenance") or {})
    if (norm.get("current") or {}).get("pm10") is None and (model_norm.get("current") or {}).get("pm10") is not None:
        norm["current"]["pm10"] = model_norm["current"]["pm10"]
        norm["current"]["fallback_provenance"] = dict(model_norm["current"].get("provenance") or {})

    meta = norm.get("meta") or {}
    meta["aq_fallback"] = {
        "provider": "open-meteo",
        "history_points": history_fallback_count,
        "forecast_points": forecast_fallback_count,
        "used": (history_fallback_count + forecast_fallback_count) > 0,
    }
    norm["meta"] = meta

    if meta["aq_fallback"]["used"]:
        base_message = source.get("user_message") or source.get("message") or "Based on air quality data for your location."
        norm["source"]["user_message"] = (
            f"{base_message} Missing timeline hours were filled with lower-confidence Open-Meteo model data."
        )

    return norm


def prepare_normalized_response(lat: float, lon: float, norm: Dict[str, Any]) -> Dict[str, Any]:
    norm = fill_missing_timeseries_with_model(lat, lon, norm)
    return enrich_with_weather_if_missing(lat, lon, norm)


def _finalize_normalized(norm: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure stable meta units + add data completeness flags."""
    if not isinstance(norm, dict):
        return norm

    _annotate_normalized_provenance(norm)
    meta = norm.get("meta") or {}
    meta["timezone"] = meta.get("timezone") or "UTC"
    meta["units"] = dict(UNITS)

    cur = norm.get("current") or {}
    norm["aqi"] = _build_eu_aqi(cur)
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
# Public functions
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
    _ensure_cache_dir()
    _cleanup_cache_dir()
    key = _index_key(lat, lon)

    # ---------- 1) Airly point ----------
    airly_point_cache = _cache_path(f"norm_airly_point_{key}.json")
    cached = _cache_read(airly_point_cache, TTL_CURRENT)
    if cached and isinstance(cached, dict) and normalized_has_data(cached):
        return prepare_normalized_response(lat, lon, cached)

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
        "user_message": "Based on air quality data near your location.",
    }
    norm_point = normalize_airly(raw_point, point_source)

    if normalized_has_data(norm_point):
        norm_point["cache"]["ttl_sec"] = TTL_CURRENT
        _cache_write(airly_point_cache, norm_point)
        return prepare_normalized_response(lat, lon, norm_point)

            airly_nearest_variant = f"{AIRLY_NEAREST_MAX_DISTANCE_KM}km"
            airly_nearest_cache_key = _build_provider_cache_key(
                provider_code="airly",
                cache_kind="aq_normalized",
                method="nearest_station",
                coord_key=coord_key,
                variant_key=airly_nearest_variant,
            )
            cached_station = _cache_read(airly_station_cache, TTL_STATION)
            if cached_station and isinstance(cached_station, dict) and normalized_has_data(cached_station):
                return prepare_normalized_response(lat, lon, cached_station)

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
                "installation_id": inst_id2,
                "distance_km": round(distance_km, 2) if distance_km is not None else None,
                "message": msg,
                "user_message": (
                    f"Based on measurements from a nearby station {distance_km:.1f} km away."
                    if distance_km is not None
                    else "Based on measurements from a nearby station."
                ),
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

                return prepare_normalized_response(lat, lon, norm_nearest)

    # ---------- 3) OpenAQ nearest ----------
    openaq_cache = _cache_path(f"norm_openaq_nearest_{key}_{OPENAQ_MAX_DISTANCE_KM}km.json")
    cached_openaq = _cache_read(openaq_cache, TTL_STATION)
    if cached_openaq and isinstance(cached_openaq, dict) and normalized_has_data(cached_openaq):
        return prepare_normalized_response(lat, lon, cached_openaq)

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

    if norm_openaq and normalized_has_data(norm_openaq):
        norm_openaq["cache"]["ttl_sec"] = TTL_STATION
        _cache_write(openaq_cache, norm_openaq)
        return prepare_normalized_response(lat, lon, norm_openaq)

    # ---------- 4) Open-Meteo AQ model ----------
    openmeteo_cache = _cache_path(
        f"norm_openmeteo_model_{key}_{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h.json"
    )
    cached_model = _cache_read(openmeteo_cache, TTL_MODEL)
    if cached_model and isinstance(cached_model, dict) and normalized_has_data(cached_model):
        return prepare_normalized_response(lat, lon, cached_model)

    norm_model = None
    try:
        norm_model = get_openmeteo_air_quality_cached(lat, lon)
    except requests.RequestException as e:
        if DEBUG:
            print(f"DEBUG: Open-Meteo AQ failed: {e}")

    if norm_model and normalized_has_data(norm_model):
        return prepare_normalized_response(lat, lon, norm_model)

    # ---------- Final fallback: empty normalized ----------
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
        "meta": {"timezone": "UTC", "units": dict(UNITS)},
        "measurement_window": {"from": None, "to": None},
        "source": {
            "provider": "none",
            "method": "none",
            "message": (
                f"No values from Airly (/point, /nearest {AIRLY_NEAREST_MAX_DISTANCE_KM}km), "
                f"OpenAQ ({OPENAQ_MAX_DISTANCE_KM}km), or Open-Meteo."
            ),
            "user_message": "Air quality data is currently unavailable for this location.",
        },
        "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
    }
    return _finalize_normalized(empty)


# ---------------------------
# Nominatim Geocode (cached)
# ---------------------------

nominatim_cache_limit = 2592000  # 30 days


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
    normalized_address = _normalize_address(address)
    if not normalized_address:
        print("Error: Address cannot be empty.")
        return None

    os.makedirs(cache_folder, exist_ok=True)
    cache_key = hashlib.sha256(normalized_address.encode("utf-8")).hexdigest()[:16]
    cache_file = os.path.join(cache_folder, "nominatim_cache.json")

    cache_data: Dict[str, Any] = {}
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
            if not isinstance(cache_data, dict):
                cache_data = {}
        except (json.JSONDecodeError, OSError):
            print("Geocode cache file is empty/invalid. Rebuilding cache file.")
            cache_data = {}
    else:
        print("No geocode cache file found. A new one will be created.")

    cache_entries = cache_data["entries"] if isinstance(cache_data.get("entries"), dict) else cache_data

    cached_entry = cache_entries.get(cache_key)
    if isinstance(cached_entry, dict):
        try:
            cached_at = float(cached_entry.get("cached_at", 0))
            if cached_at and (time.time() - cached_at) < nominatim_cache_limit:
                lat = float(cached_entry["lat"])
                lon = float(cached_entry["lon"])
                print("Using cached Nominatim geocode data.")
                return lat, lon
            print("Cached geocode entry is too old. Fetching fresh Nominatim data.")
        except (KeyError, TypeError, ValueError):
            print("Geocode cache entry is invalid. Fetching fresh Nominatim data.")
    else:
        print("No cached geocode entry found. Fetching from Nominatim.")

    nominatim_url = "https://nominatim.openstreetmap.org/search"
    user_agent = os.getenv(
        "nominatim_user_agent",
        "AirIQ-Learning-Project/1.0 (contact: student@example.com)",
    )
    nominatim_email = os.getenv("nominatim_email")
    headers = {"User-Agent": user_agent}
    params = {"q": address, "format": "jsonv2", "limit": 1, "addressdetails": 1}
    if nominatim_email:
        params["email"] = nominatim_email

    try:
        # Nominatim politeness
        time.sleep(1.2)
        response = requests.get(nominatim_url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        results = response.json()

        if not results:
            print(f"Address '{address}' not found in Nominatim.")
            return None

        first_result = results[0]
        lat = float(first_result["lat"])
        lon = float(first_result["lon"])

        cached_payload = {
            "query": address,
            "normalized_query": normalized_address,
            "lat": lat,
            "lon": lon,
            "display_name": first_result.get("display_name"),
            "place_id": first_result.get("place_id"),
            "cached_at": time.time(),
        }
        cache_entries[cache_key] = cached_payload
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump({"entries": cache_entries}, f, indent=2, ensure_ascii=False)

        return lat, lon

    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 403:
            print(
                "Nominatim blocked the request (403). Set a unique "
                "nominatim_user_agent and nominatim_email in .env."
            )
        print(f"Nominatim request error: {e}")
        return None
    except requests.RequestException as e:
        print(f"Nominatim request error: {e}")
        return None
    except (KeyError, TypeError, ValueError) as e:
        print(f"Unexpected Nominatim response format: {e}")
        return None


def suggest_addresses_nominatim(address: str, limit: int = 5) -> List[Dict[str, Any]]:
    normalized_address = _normalize_address(address)
    if len(normalized_address) < 2:
        return []

    nominatim_url = "https://nominatim.openstreetmap.org/search"
    user_agent = os.getenv(
        "nominatim_user_agent",
        "AirIQ-Learning-Project/1.0 (contact: student@example.com)",
    )
    nominatim_email = os.getenv("nominatim_email")
    headers = {"User-Agent": user_agent}
    params = {
        "q": address,
        "format": "jsonv2",
        "limit": max(1, min(limit, 10)),
        "addressdetails": 1,
    }
    if nominatim_email:
        params["email"] = nominatim_email

    try:
        time.sleep(0.35)
        response = requests.get(nominatim_url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError):
        return []

    suggestions: List[Dict[str, Any]] = []
    for item in results:
        try:
            suggestions.append(
                {
                    "label": item.get("display_name") or address,
                    "lat": float(item["lat"]),
                    "lon": float(item["lon"]),
                    "place_id": item.get("place_id"),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue

    return suggestions


# ---------------------------
# Test run
# ---------------------------

if __name__ == "__main__":
    if not AIRLY_API_KEY:
        print("Warning: Missing AIRLY_API_KEY in .env. Airly will be skipped.")

    lat, lon = 59.292255694378156, 18.062688971478863

    normalized = get_air_quality_data(lat, lon)
    print(json.dumps(normalized, indent=2, ensure_ascii=False))

    coords = get_lat_lon_nominatim_cached("Kungsgatan 4, Stockholm")
    print("Coords:", coords)