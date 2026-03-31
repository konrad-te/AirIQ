from __future__ import annotations

import hashlib
import json
import math
import os
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from backend.database import SessionLocal
from backend.models import DataProvider, GeocodeCacheEntry, ProviderCacheEntry
from sqlalchemy import select
from sqlalchemy.orm import Session

# ---------------------------
# Configuration
# ---------------------------

AIRLY_API_KEY = os.getenv("AIRLY_API_KEY") or os.getenv("airly_api")
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY") or os.getenv("open_aq")

CACHE_RAW = os.getenv("CACHE_RAW", "0") == "1"
DEBUG = os.getenv("DEBUG", "0") == "1"
USE_ENV_HTTP_PROXIES = os.getenv("USE_ENV_HTTP_PROXIES", "0") == "1"

NOMINATIM_USER_AGENT = (
    os.getenv("NOMINATIM_USER_AGENT")
    or os.getenv("nominatim_user_agent")
    or "AirIQ-Learning-Project/1.0 (contact: student@example.com)"
)
NOMINATIM_EMAIL = os.getenv("NOMINATIM_EMAIL") or os.getenv("nominatim_email")

AIRLY_HEADERS = (
    {"Accept": "application/json", "apikey": AIRLY_API_KEY} if AIRLY_API_KEY else {}
)

TTL_CURRENT = 10 * 60
TTL_STATION = 10 * 60
TTL_MODEL = 20 * 60
TTL_WEATHER = 30 * 60
TTL_GEOCODE = 30 * 24 * 3600

AIRLY_NEAREST_MAX_DISTANCE_KM = 15
OPENAQ_MAX_DISTANCE_KM = 50
INTERPOLATION_CLOSE_KM = 1.5

OPENMETEO_PAST_HOURS = 24
OPENMETEO_FUTURE_HOURS = 24

AIRLY_POINT_URL = "https://airapi.airly.eu/v2/measurements/point"
AIRLY_NEAREST_URL = "https://airapi.airly.eu/v2/measurements/nearest"
OPENAQ_LOCATIONS_URL = "https://api.openaq.org/v3/locations"
OPENAQ_CACHE_VARIANT = "v2"
OPENMETEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPENMETEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

UNITS = {
    "pm": "µg/m³",
    "temperature": "°C",
    "pressure": "hPa",
    "humidity": "%",
    "cloud_cover": "%",
    "rain": "mm",
    "wind_speed": "m/s",
    "wind_direction": "°",
    "uv_index": "index",
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
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _http_get(url: str, **kwargs: Any) -> requests.Response:
    if USE_ENV_HTTP_PROXIES:
        return requests.get(url, **kwargs)

    with requests.Session() as session:
        session.trust_env = False
        return session.get(url, **kwargs)


def _extract_error_detail(response: requests.Response | None) -> str | None:
    if response is None:
        return None

    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        for key in ("message", "detail", "error", "description"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    body = response.text.strip()
    return body[:160] if body else None


def _describe_request_error(provider_label: str, exc: Exception) -> str:
    if isinstance(exc, RuntimeError):
        return str(exc)

    if isinstance(exc, requests.HTTPError):
        response = exc.response
        status_code = response.status_code if response is not None else None
        detail = _extract_error_detail(response)
        if status_code == 429:
            return (
                f"{provider_label} rate limited"
                + (f": {detail}" if detail else "")
            )
        if status_code == 401:
            return (
                f"{provider_label} unauthorized"
                + (f": {detail}" if detail else "")
            )
        if status_code is not None:
            return (
                f"{provider_label} HTTP {status_code}"
                + (f": {detail}" if detail else "")
            )

    return f"{provider_label} request failed: {exc}"


def _attach_upstream_failures(
    norm: dict[str, Any],
    failures: list[str],
) -> dict[str, Any]:
    if not failures or not isinstance(norm, dict):
        return norm

    unique_failures = list(dict.fromkeys(item.strip() for item in failures if item))
    if not unique_failures:
        return norm

    source = dict(norm.get("source") or {})
    base_message = source.get("message") or "Fallback source used."
    base_user_message = (
        source.get("user_message")
        or source.get("message")
        or "Using fallback air quality data."
    )
    source["message"] = f"{base_message} Upstream issues: {'; '.join(unique_failures)}."
    source["user_message"] = (
        f"{base_user_message} Airly is temporarily unavailable, so fallback data is shown."
    )
    source["upstream_failures"] = unique_failures
    norm["source"] = source
    return norm


def _parse_iso_utc(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None

    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))

        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
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
    return (
        dt.astimezone(timezone.utc)
        .replace(
            minute=0,
            second=0,
            microsecond=0,
        )
        .strftime("%Y-%m-%dT%H:00Z")
    )


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


def _value_from_aliases(values: dict[str, Any], *aliases: str) -> Any:
    if not isinstance(values, dict):
        return None

    for alias in aliases:
        if alias in values and values.get(alias) is not None:
            return values.get(alias)

    return None


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
            "pm25": _to_float(_value_from_aliases(values, "PM25", "PM2.5", "PM_25")),
            "pm10": _to_float(_value_from_aliases(values, "PM10", "PM_10")),
            "temperature_c": _to_float(values.get("TEMPERATURE")),
            "apparent_temperature_c": None,
            "humidity_pct": _to_float(values.get("HUMIDITY")),
            "cloud_cover_pct": None,
            "pressure_hpa": _to_float(values.get("PRESSURE")),
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "weather_code": None,
            "is_day": None,
            "uv_index": None,
            "rain_mm": None,
            "no2": _to_float(values.get("NO2")),
            "co": _to_float(values.get("CO")),
            "o3": _to_float(values.get("O3")),
            "so2": _to_float(values.get("SO2")),
        }
        rows.append(row)

    return rows


def _eu_aqi_level_pm25(value: float | None) -> int | None:
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


def _eu_aqi_level_pm10(value: float | None) -> int | None:
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


def _build_eu_aqi(current: dict[str, Any]) -> dict[str, Any] | None:
    pm25 = _to_float(current.get("pm25"))
    pm10 = _to_float(current.get("pm10"))

    candidates: list[tuple[str, int]] = []
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
    provider: str | None,
    method: str | None,
    *,
    is_forecast: bool,
    distance_km: float | None = None,
    is_fallback: bool = False,
) -> dict[str, Any]:
    if provider == "open-meteo":
        confidence = "low"
        label = "Lower confidence"
        detail = (
            "Open-Meteo fallback."
            if is_fallback
            else (
                "Open-Meteo model forecast for this area."
                if is_forecast
                else "Open-Meteo model estimate for this area."
            )
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
            else (
                f"Airly nearby station {distance_km:.1f} km away."
                if distance_km is not None
                else ("Airly forecast." if is_forecast else "Airly nearby station.")
            )
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


def _annotate_normalized_provenance(norm: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(norm, dict):
        return norm

    source = norm.get("source") or {}
    provider = source.get("provider")
    method = source.get("method")
    distance_km = _to_float(source.get("distance_km"))

    current = norm.get("current")
    if isinstance(current, dict) and "provenance" not in current:
        current["provenance"] = _build_provenance(
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


def normalize_airly(raw: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    current_section = raw.get("current") or {}
    values = _airly_values_to_dict(current_section.get("values"))

    normalized = {
        "current": {
            "pm25": _to_float(_value_from_aliases(values, "PM25", "PM2.5", "PM_25")),
            "pm10": _to_float(_value_from_aliases(values, "PM10", "PM_10")),
            "temperature_c": _to_float(values.get("TEMPERATURE")),
            "apparent_temperature_c": None,
            "humidity_pct": _to_float(values.get("HUMIDITY")),
            "cloud_cover_pct": None,
            "pressure_hpa": _to_float(values.get("PRESSURE")),
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "weather_code": None,
            "is_day": None,
            "uv_index": None,
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
        or current.get("apparent_temperature_c") is None
        or current.get("humidity_pct") is None
        or current.get("cloud_cover_pct") is None
        or current.get("pressure_hpa") is None
        or current.get("wind_speed_ms") is None
        or current.get("wind_direction_deg") is None
        or current.get("weather_code") is None
        or current.get("is_day") is None
        or current.get("uv_index") is None
        or current.get("rain_mm") is None
    )


def _merge_series_with_model_fallback(
    primary_series: Any,
    model_series: Any,
) -> tuple[list[dict[str, Any]], int]:
    primary_list = primary_series if isinstance(primary_series, list) else []
    model_list = model_series if isinstance(model_series, list) else []

    by_key: dict[str, dict[str, Any]] = {}
    fallback_count = 0

    for row in primary_list:
        if not isinstance(row, dict):
            continue
        key = _time_to_key(row.get("time"))
        if not key:
            continue
        cloned = dict(row)
        cloned["provenance"] = dict(row.get("provenance") or {})
        by_key[key] = cloned

    for model_row in model_list:
        if not isinstance(model_row, dict):
            continue
        key = _time_to_key(model_row.get("time"))
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
            if (
                primary_row.get(pollutant) is None
                and model_row.get(pollutant) is not None
            ):
                primary_row[pollutant] = model_row.get(pollutant)
                used_fallback = True

        if used_fallback:
            primary_row["fallback_provenance"] = dict(model_row.get("provenance") or {})
            fallback_count += 1

    merged = list(by_key.values())
    merged.sort(key=lambda row: row.get("time") or "")
    return merged, fallback_count


def _finalize_normalized(norm: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(norm, dict):
        return norm

    _annotate_normalized_provenance(norm)

    meta = norm.get("meta") or {}
    current = norm.get("current") or {}

    meta["timezone"] = meta.get("timezone") or "UTC"
    meta["units"] = dict(UNITS)
    norm["aqi"] = _build_eu_aqi(current)
    meta["data_completeness"] = {
        "has_pm": current.get("pm25") is not None or current.get("pm10") is not None,
        "has_weather": any(
            current.get(key) is not None
            for key in (
                "temperature_c",
                "humidity_pct",
                "pressure_hpa",
                "wind_speed_ms",
            )
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

    response = _http_get(
        AIRLY_POINT_URL,
        headers=AIRLY_HEADERS,
        params={"lat": lat, "lng": lon},
        timeout=12,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def fetch_airly_nearest(
    lat: float, lon: float, max_distance_km: float
) -> dict[str, Any]:
    if not AIRLY_API_KEY:
        return {}

    response = _http_get(
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

    def _normalize_openaq_parameter_name(value: Any) -> str | None:
        if isinstance(value, dict):
            value = value.get("name") or value.get("displayName")
        if not value:
            return None

        normalized = str(value).strip().lower().replace(".", "").replace("_", "")
        if normalized == "pm25":
            return "pm25"
        if normalized == "pm10":
            return "pm10"
        return None

    def _extract_sensor_parameter_map(location: dict[str, Any]) -> dict[int, str]:
        sensor_parameter_map: dict[int, str] = {}
        sensor_groups: list[Any] = [location.get("sensors")]

        instruments = location.get("instruments")
        if isinstance(instruments, list):
            for instrument in instruments:
                if isinstance(instrument, dict):
                    sensor_groups.append(instrument.get("sensors"))

        for sensors in sensor_groups:
            if not isinstance(sensors, list):
                continue

            for sensor in sensors:
                if not isinstance(sensor, dict):
                    continue

                sensor_id = sensor.get("id")
                if sensor_id is None:
                    continue

                parameter_name = _normalize_openaq_parameter_name(
                    sensor.get("parameter")
                )
                if parameter_name is None:
                    continue

                try:
                    sensor_parameter_map[int(sensor_id)] = parameter_name
                except (TypeError, ValueError):
                    continue

        return sensor_parameter_map

    def _extract_measurement_time(value: Any) -> datetime | None:
        if isinstance(value, dict):
            return _parse_iso_utc(value.get("utc") or value.get("local"))
        if isinstance(value, str):
            return _parse_iso_utc(value)
        return None

    def _format_iso_utc(value: datetime | None) -> str | None:
        if value is None:
            return None
        return (
            value.astimezone(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )

    headers = {"X-API-Key": OPENAQ_API_KEY}
    search_radius_m = max(1, min(int(radius_km * 1000), 25_000))
    response = _http_get(
        OPENAQ_LOCATIONS_URL,
        headers=headers,
        params={
            "coordinates": f"{lat},{lon}",
            "radius": search_radius_m,
            "limit": 25,
        },
        timeout=12,
    )
    if response.status_code == 401:
        raise RuntimeError(
            "OpenAQ unauthorized: check OPENAQ_API_KEY in .env (or old open_aq fallback)."
        )
    response.raise_for_status()

    payload = response.json()
    results = payload.get("results") or []
    if not isinstance(results, list) or not results:
        return None

    candidates: list[dict[str, Any]] = []

    for location in results:
        if not isinstance(location, dict):
            continue

        coords = location.get("coordinates") or {}
        lat2 = _to_float(coords.get("latitude"))
        lon2 = _to_float(coords.get("longitude"))
        if lat2 is None or lon2 is None:
            continue

        distance_km = haversine_km(lat, lon, lat2, lon2)
        if distance_km > radius_km:
            continue

        sensor_parameter_map = _extract_sensor_parameter_map(location)
        if not sensor_parameter_map:
            continue

        location_id = location.get("id")
        if location_id is None:
            continue

        candidates.append(
            {
                "distance_km": distance_km,
                "lat": lat2,
                "lon": lon2,
                "location": location,
                "location_id": location_id,
                "sensor_parameter_map": sensor_parameter_map,
            }
        )

    for candidate in sorted(candidates, key=lambda item: item["distance_km"]):
        latest_response = _http_get(
            f"{OPENAQ_LOCATIONS_URL}/{candidate['location_id']}/latest",
            headers=headers,
            params={"limit": 100},
            timeout=12,
        )
        if latest_response.status_code == 401:
            raise RuntimeError(
                "OpenAQ unauthorized: check OPENAQ_API_KEY in .env (or old open_aq fallback)."
            )
        latest_response.raise_for_status()

        latest_payload = latest_response.json()
        latest_results = latest_payload.get("results") or []
        if not isinstance(latest_results, list) or not latest_results:
            continue

        pm25 = None
        pm10 = None
        matched_times: list[datetime] = []

        for measurement in latest_results:
            if not isinstance(measurement, dict):
                continue

            parameter_name = _normalize_openaq_parameter_name(
                measurement.get("parameter")
            )
            if parameter_name is None:
                sensor_id = measurement.get("sensorsId")
                try:
                    sensor_id_int = int(sensor_id) if sensor_id is not None else None
                except (TypeError, ValueError):
                    sensor_id_int = None
                if sensor_id_int is not None:
                    parameter_name = candidate["sensor_parameter_map"].get(sensor_id_int)

            if parameter_name not in {"pm25", "pm10"}:
                continue

            value = _to_float(measurement.get("value"))
            if value is None:
                continue

            if parameter_name == "pm25":
                pm25 = value
            elif parameter_name == "pm10":
                pm10 = value

            measurement_time = _extract_measurement_time(measurement.get("datetime"))
            if measurement_time is not None:
                matched_times.append(measurement_time)

        if pm25 is None and pm10 is None:
            continue

        location = candidate["location"]
        distance_km = candidate["distance_km"]
        window_from = _format_iso_utc(min(matched_times) if matched_times else None)
        window_to = _format_iso_utc(max(matched_times) if matched_times else None)

        normalized = {
            "current": {
                "pm25": pm25,
                "pm10": pm10,
                "temperature_c": None,
                "apparent_temperature_c": None,
                "humidity_pct": None,
                "cloud_cover_pct": None,
                "pressure_hpa": None,
                "wind_speed_ms": None,
                "wind_direction_deg": None,
                "weather_code": None,
                "is_day": None,
                "uv_index": None,
                "rain_mm": None,
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
            "measurement_window": {"from": window_from, "to": window_to},
            "source": {
                "provider": "openaq",
                "method": "nearest_station",
                "max_distance_km": radius_km,
                "distance_km": round(distance_km, 2),
                "location_name": location.get("location") or location.get("name"),
                "message": f"Used OpenAQ nearest station (~{distance_km:.1f} km).",
                "user_message": f"Based on measurements from a nearby station {distance_km:.1f} km away.",
            },
            "cache": {
                "created_at": _utc_now().isoformat(),
            },
        }

        if CACHE_RAW:
            normalized["raw"] = {
                "locations": payload,
                "latest": latest_payload,
            }

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

    response = _http_get(OPENMETEO_AQ_URL, params=params, timeout=12)
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
            "apparent_temperature_c": None,
            "humidity_pct": None,
            "cloud_cover_pct": None,
            "pressure_hpa": None,
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "weather_code": None,
            "is_day": None,
            "uv_index": None,
            "rain_mm": None,
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
            "apparent_temperature_c": None,
            "humidity_pct": None,
            "cloud_cover_pct": None,
            "pressure_hpa": None,
            "wind_speed_ms": None,
            "wind_direction_deg": None,
            "weather_code": None,
            "is_day": None,
            "uv_index": None,
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
            "user_message": "Estimated from air quality models for your area.",
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
            "temperature_2m,apparent_temperature,relative_humidity_2m,cloud_cover,pressure_msl,"
            "weather_code,is_day,uv_index,rain,"
            "wind_speed_10m,wind_direction_10m"
        ),
        "hourly": (
            "temperature_2m,apparent_temperature,relative_humidity_2m,cloud_cover,pressure_msl,"
            "weather_code,is_day,uv_index,rain,"
            "wind_speed_10m,wind_direction_10m"
        ),
        "past_days": 1,
        "forecast_days": 2,
    }

    response = _http_get(OPENMETEO_WEATHER_URL, params=params, timeout=12)
    response.raise_for_status()
    data = response.json()

    current = data.get("current") or {}
    hourly = data.get("hourly") or {}

    times = hourly.get("time") or []
    temp_values = hourly.get("temperature_2m") or []
    apparent_temp_values = hourly.get("apparent_temperature") or []
    humidity_values = hourly.get("relative_humidity_2m") or []
    cloud_cover_values = hourly.get("cloud_cover") or []
    pressure_values = hourly.get("pressure_msl") or []
    weather_code_values = hourly.get("weather_code") or []
    is_day_values = hourly.get("is_day") or []
    uv_index_values = hourly.get("uv_index") or []
    rain_values = hourly.get("rain") or []
    wind_speed_values = hourly.get("wind_speed_10m") or []
    wind_direction_values = hourly.get("wind_direction_10m") or []

    rows: list[dict[str, Any]] = []
    total = min(
        len(times),
        len(temp_values),
        len(apparent_temp_values),
        len(humidity_values),
        len(cloud_cover_values),
        len(pressure_values),
        len(weather_code_values),
        len(is_day_values),
        len(uv_index_values),
        len(rain_values),
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
                "apparent_temperature_c": _to_float(apparent_temp_values[index]),
                "humidity_pct": _to_float(humidity_values[index]),
                "cloud_cover_pct": _to_float(cloud_cover_values[index]),
                "pressure_hpa": _to_float(pressure_values[index]),
                "weather_code": weather_code_values[index],
                "is_day": is_day_values[index],
                "uv_index": _to_float(uv_index_values[index]),
                "rain_mm": _to_float(rain_values[index]),
                "wind_speed_ms": _to_float(wind_speed_values[index]),
                "wind_direction_deg": _to_float(wind_direction_values[index]),
            }
        )

    weather = {
        "current": {
            "time": current.get("time"),
            "temperature_c": _to_float(current.get("temperature_2m")),
            "apparent_temperature_c": _to_float(current.get("apparent_temperature")),
            "humidity_pct": _to_float(current.get("relative_humidity_2m")),
            "cloud_cover_pct": _to_float(current.get("cloud_cover")),
            "pressure_hpa": _to_float(current.get("pressure_msl")),
            "weather_code": current.get("weather_code"),
            "is_day": current.get("is_day"),
            "uv_index": _to_float(current.get("uv_index")),
            "rain_mm": _to_float(current.get("rain")),
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


def _get_openmeteo_model_cached(
    db: Session,
    lat: float,
    lon: float,
) -> dict[str, Any] | None:
    coord_key = _coord_key(lat, lon)
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
        return cached_model

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
        return normalized_model

    return None


# ---------------------------
# Weather enrichment helpers
# ---------------------------


def _merge_weather_into_normalized(
    norm: dict[str, Any],
    weather_data: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(norm, dict) or not isinstance(weather_data, dict):
        return _finalize_normalized(norm)

    def _fill_missing_weather_fields(
        target: dict[str, Any],
        source: dict[str, Any] | None,
    ) -> None:
        if not isinstance(target, dict) or not isinstance(source, dict):
            return

        if target.get("temperature_c") is None:
            target["temperature_c"] = source.get("temperature_c")
        if target.get("apparent_temperature_c") is None:
            target["apparent_temperature_c"] = source.get("apparent_temperature_c")
        if target.get("humidity_pct") is None:
            target["humidity_pct"] = source.get("humidity_pct")
        if target.get("cloud_cover_pct") is None:
            target["cloud_cover_pct"] = source.get("cloud_cover_pct")
        if target.get("pressure_hpa") is None:
            target["pressure_hpa"] = source.get("pressure_hpa")
        if target.get("wind_speed_ms") is None:
            target["wind_speed_ms"] = source.get("wind_speed_ms")
        if target.get("wind_direction_deg") is None:
            target["wind_direction_deg"] = source.get("wind_direction_deg")
        if target.get("weather_code") is None:
            target["weather_code"] = source.get("weather_code")
        if target.get("is_day") is None:
            target["is_day"] = source.get("is_day")
        if target.get("uv_index") is None:
            target["uv_index"] = source.get("uv_index")
        if target.get("rain_mm") is None:
            target["rain_mm"] = source.get("rain_mm")

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
        if isinstance(norm.get("history"), list) and norm["history"]:
            current_key = _time_to_key(norm["history"][-1].get("time"))
    if current_key is None:
        current_key = (
            _utc_now()
            .astimezone(timezone.utc)
            .replace(
                minute=0,
                second=0,
                microsecond=0,
            )
            .strftime("%Y-%m-%dT%H:00Z")
        )

    current = norm.get("current") or {}
    weather_current = weather_map.get(current_key)
    if weather_current:
        _fill_missing_weather_fields(current, weather_current)

    _fill_missing_weather_fields(current, weather_data.get("current"))
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

            _fill_missing_weather_fields(row, weather_row)

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

    coord_key = _coord_key(lat, lon)
    variant_key = f"{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h"
    cache_key = _build_provider_cache_key(
        provider_code="open-meteo",
        cache_kind="weather",
        method="model",
        coord_key=coord_key,
        variant_key=variant_key,
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


def fill_missing_timeseries_with_model(
    db: Session,
    lat: float,
    lon: float,
    norm: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(norm, dict):
        return norm

    source = norm.get("source") or {}
    if source.get("provider") == "open-meteo":
        return norm

    model_norm = _get_openmeteo_model_cached(db, lat, lon)
    if not model_norm:
        return norm

    _annotate_normalized_provenance(model_norm)
    _annotate_normalized_provenance(norm)

    history, history_fallback_count = _merge_series_with_model_fallback(
        norm.get("history"),
        model_norm.get("history"),
    )
    forecast, forecast_fallback_count = _merge_series_with_model_fallback(
        norm.get("forecast"),
        model_norm.get("forecast"),
    )
    norm["history"] = history
    norm["forecast"] = forecast

    current = norm.get("current") or {}
    model_current = model_norm.get("current") or {}

    if current.get("pm25") is None and model_current.get("pm25") is not None:
        current["pm25"] = model_current.get("pm25")
        current["fallback_provenance"] = dict(model_current.get("provenance") or {})
    if current.get("pm10") is None and model_current.get("pm10") is not None:
        current["pm10"] = model_current.get("pm10")
        current["fallback_provenance"] = dict(model_current.get("provenance") or {})

    norm["current"] = current

    meta = norm.get("meta") or {}
    meta["aq_fallback"] = {
        "provider": "open-meteo",
        "history_points": history_fallback_count,
        "forecast_points": forecast_fallback_count,
        "used": (history_fallback_count + forecast_fallback_count) > 0,
    }
    norm["meta"] = meta

    source = norm.get("source") or {}
    norm["source"] = source
    if meta["aq_fallback"]["used"]:
        base_message = (
            source.get("user_message")
            or source.get("message")
            or "Based on air quality data for your location."
        )
        source["user_message"] = (
            f"{base_message} Missing timeline hours were filled with lower-confidence "
            "Open-Meteo model data."
        )

    return norm


def prepare_normalized_response(
    db: Session,
    lat: float,
    lon: float,
    norm: dict[str, Any],
) -> dict[str, Any]:
    norm = fill_missing_timeseries_with_model(db, lat, lon, norm)
    return enrich_with_weather_if_missing(db, lat, lon, norm)


# ---------------------------
# Public functions
# ---------------------------


def get_lat_lon_nominatim_cached(address: str) -> tuple[float, float] | None:
    normalized_address = _normalize_address(address)
    if not normalized_address:
        print("Error: Address cannot be empty.")
        return None

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
            response = _http_get(
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


def suggest_addresses_nominatim(address: str, limit: int = 5) -> list[dict[str, Any]]:
    normalized_address = _normalize_address(address)
    if len(normalized_address) < 2:
        return []

    headers = {"User-Agent": NOMINATIM_USER_AGENT}
    params = {
        "q": address,
        "format": "jsonv2",
        "limit": max(1, min(limit, 10)),
        "addressdetails": 1,
    }
    if NOMINATIM_EMAIL:
        params["email"] = NOMINATIM_EMAIL

    try:
        time.sleep(0.35)
        response = _http_get(
            NOMINATIM_URL,
            params=params,
            headers=headers,
            timeout=10,
        )
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError):
        return []

    suggestions: list[dict[str, Any]] = []
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


def reverse_geocode_nominatim(lat: float, lon: float) -> dict[str, Any] | None:
    headers = {"User-Agent": NOMINATIM_USER_AGENT}
    params = {
        "lat": lat,
        "lon": lon,
        "format": "jsonv2",
        "zoom": 18,
        "addressdetails": 1,
    }
    if NOMINATIM_EMAIL:
        params["email"] = NOMINATIM_EMAIL

    try:
        time.sleep(0.35)
        response = _http_get(
            NOMINATIM_REVERSE_URL,
            params=params,
            headers=headers,
            timeout=10,
        )
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError):
        return None

    display_name = result.get("display_name")
    if not isinstance(display_name, str) or not display_name.strip():
        return None

    return {
        "address": display_name.strip(),
        "lat": lat,
        "lon": lon,
        "place_id": result.get("place_id"),
    }


def get_air_quality_data(lat: float, lon: float) -> dict[str, Any]:
    coord_key = _coord_key(lat, lon)

    with _db_session() as db:
        upstream_failures: list[str] = []

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
                return prepare_normalized_response(db, lat, lon, cached_point)

            try:
                raw_point = fetch_airly_point(lat, lon)
            except requests.RequestException as exc:
                upstream_failures.append(_describe_request_error("Airly point", exc))
                if DEBUG:
                    print(f"DEBUG: Airly /point failed: {exc}")
                raw_point = {}

            point_source = {
                "provider": "airly",
                "method": "point",
                "message": "Used interpolated point measurements (if available).",
                "user_message": "Based on air quality data near your location.",
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
                return prepare_normalized_response(db, lat, lon, normalized_point)

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
                return prepare_normalized_response(db, lat, lon, cached_nearest)

            raw_nearest: dict[str, Any] = {}
            try:
                raw_nearest = fetch_airly_nearest(
                    lat=lat,
                    lon=lon,
                    max_distance_km=AIRLY_NEAREST_MAX_DISTANCE_KM,
                )
            except requests.RequestException as exc:
                upstream_failures.append(_describe_request_error("Airly nearest", exc))
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
                    "distance_km": round(distance_km, 2)
                    if distance_km is not None
                    else None,
                    "message": message,
                    "user_message": (
                        f"Based on measurements from a nearby station {distance_km:.1f} km away."
                        if distance_km is not None
                        else "Based on measurements from a nearby station."
                    ),
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
                    return prepare_normalized_response(db, lat, lon, normalized_nearest)

        openaq_variant = f"{OPENAQ_MAX_DISTANCE_KM}km-{OPENAQ_CACHE_VARIANT}"
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
                if isinstance(cached_normalized, dict) and normalized_has_data(
                    cached_normalized
                ):
                    return prepare_normalized_response(db, lat, lon, cached_normalized)

        normalized_openaq = None
        try:
            normalized_openaq = fetch_openaq_latest_nearby(
                lat=lat,
                lon=lon,
                radius_km=OPENAQ_MAX_DISTANCE_KM,
            )
        except (requests.RequestException, RuntimeError) as exc:
            upstream_failures.append(_describe_request_error("OpenAQ", exc))
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
            normalized_openaq = _attach_upstream_failures(
                normalized_openaq,
                upstream_failures,
            )
            return prepare_normalized_response(db, lat, lon, normalized_openaq)

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

        normalized_model = _get_openmeteo_model_cached(db, lat, lon)
        if normalized_model and normalized_has_data(normalized_model):
            normalized_model = _attach_upstream_failures(
                normalized_model,
                upstream_failures,
            )
            return prepare_normalized_response(db, lat, lon, normalized_model)

        empty = {
            "current": {
                "pm25": None,
                "pm10": None,
                "temperature_c": None,
                "apparent_temperature_c": None,
                "humidity_pct": None,
                "cloud_cover_pct": None,
                "pressure_hpa": None,
                "wind_speed_ms": None,
                "wind_direction_deg": None,
                "weather_code": None,
                "is_day": None,
                "uv_index": None,
                "rain_mm": None,
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
                "user_message": "Air quality data is currently unavailable for this location.",
            },
            "cache": {
                "created_at": _utc_now().isoformat(),
            },
        }
        empty = _attach_upstream_failures(empty, upstream_failures)
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
