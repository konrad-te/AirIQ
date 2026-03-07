import hashlib
import json
import math
import os
import re
import time
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

# ---------------------------
# Config
# ---------------------------
load_dotenv()
AIRLY_PROVIDER_CODE = "airly"
OPENAQ_PROVIDER_CODE = "openaq"
OPENMETEO_PROVIDER_CODE = "open-meteo"
NOMINATIM_PROVIDER_CODE = "nominatim"

AIRLY_KEY = os.getenv("airly_api")
OPENAQ_KEY = os.getenv("open_aq")
CACHE_RAW = os.getenv("CACHE_RAW", "0") == "1"  # debug: cache raw provider payloads

# Airly headers only if key present
AIRLY_HEADERS = {"Accept": "application/json", "apikey": AIRLY_KEY} if AIRLY_KEY else {}

DEBUG = False  # prints debug messages if True

# TTLs (seconds)
TTL_CURRENT = 10 * 60  # 10 min (current data changes often)
TTL_STATION = 10 * 60  # 10 min for Airly/OpenAQ nearest station
TTL_MODEL = 20 * 60  # 20 min for model-based AQ
TTL_WEATHER = 30 * 60  # 30 min for weather enrichment
INSTALLATION_INDEX_TTL = 7 * 24 * 3600  # 7 days

# Distances
AIRLY_NEAREST_MAX_DISTANCE_KM = 5
OPENAQ_MAX_DISTANCE_KM = 50
INTERPOLATION_CLOSE_KM = 1.5

# Open-Meteo time window - how much of history/forecast is saved
OPENMETEO_PAST_HOURS = 24
OPENMETEO_FUTURE_HOURS = 24

# Airly endpoints
AIRLY_POINT_URL = "https://airapi.airly.eu/v2/measurements/point"  # interpolated
AIRLY_NEAREST_URL = "https://airapi.airly.eu/v2/measurements/nearest"  # nearest station <= 5km

# OpenAQ endpoint (v3)
OPENAQ_LATEST_URL = "https://api.openaq.org/v3/latest"  # up to 50km

# Open-Meteo Air Quality endpoint
OPENMETEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Open-Meteo Weather endpoint (for enrichment)
OPENMETEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

# Units (fixed encoding)
UNITS = {
    "pm": "µg/m³",
    "temperature": "°C",
    "pressure": "hPa",
    "humidity": "%",
    "wind_speed": "m/s",
    "wind_direction": "°",
}

# ---------------------------
# Cache helpers
# ---------------------------

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
    try:
        if x is None:
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def _parse_iso_utc(ts: str) -> Optional[datetime]:
    if not ts or not isinstance(ts, str):
        return None
    try:
        if ts.endswith("Z"):
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        # if no offset, treat as UTC
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _time_to_key(ts: str) -> Optional[str]:
    """Hour-bucket key: YYYY-MM-DDTHH:00Z"""
    dt = _parse_iso_utc(ts)
    if not dt:
        return None
    dt = dt.replace(minute=0, second=0, microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:00Z")


# ---------------------------
# Airly fetchers
# ---------------------------


def fetch_airly_point(lat: float, lon: float) -> dict:
    """Interpolated method."""
    if not AIRLY_KEY:
        return {}
    params = {"lat": lat, "lng": lon}
    r = requests.get(AIRLY_POINT_URL, headers=AIRLY_HEADERS, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_airly_nearest(
    lat: float, lon: float, max_distance_km: int = AIRLY_NEAREST_MAX_DISTANCE_KM
) -> dict:
    if not AIRLY_KEY:
        return {}
    params = {
        "lat": lat,
        "lng": lon,
        "maxDistanceKM": max_distance_km,
        "indexType": "AIRLY_CAQI",
    }
    r = requests.get(AIRLY_NEAREST_URL, headers=AIRLY_HEADERS, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def _try_get_lat_lon_from_obj(obj: Any) -> Optional[Tuple[float, float]]:
    if not isinstance(obj, dict):
        return None
    lat = obj.get("latitude", obj.get("lat"))
    lon = obj.get("longitude", obj.get("lng", obj.get("lon")))
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        return float(lat), float(lon)
    return None


def get_airly_installation_coords(nearest_data: dict) -> Optional[Tuple[float, float]]:
    inst = nearest_data.get("installation")
    if isinstance(inst, dict):
        coords = _try_get_lat_lon_from_obj(inst.get("location"))
        if coords:
            return coords
        coords = _try_get_lat_lon_from_obj(inst)
        if coords:
            return coords
    coords = _try_get_lat_lon_from_obj(nearest_data.get("location"))
    if coords:
        return coords
    return None


def get_airly_installation_id(nearest_data: dict) -> Optional[int]:
    inst = nearest_data.get("installation")
    if isinstance(inst, dict):
        inst_id = inst.get("id")
        if isinstance(inst_id, int):
            return inst_id
    inst_id = nearest_data.get("installationId")
    if isinstance(inst_id, int):
        return inst_id
    return None


# ---------------------------
# Airly normalization
# ---------------------------


def _airly_values_to_dict(values_list: Any) -> Dict[str, Any]:
    if not isinstance(values_list, list):
        return {}
    out: Dict[str, Any] = {}
    for item in values_list:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name:
            continue
        out[str(name)] = item.get("value")
    return out


def _normalize_airly_timeseries(series: Any) -> List[Dict[str, Any]]:
    if not isinstance(series, list):
        return []
    rows: List[Dict[str, Any]] = []
    for slot in series:
        if not isinstance(slot, dict):
            continue
        values = _airly_values_to_dict(slot.get("values"))
        rows.append(
            {
                "time": slot.get("fromDateTime") or slot.get("tillDateTime"),
                "pm25": _to_float(values.get("PM25")),
                "pm10": _to_float(values.get("PM10")),
                "temperature_c": _to_float(values.get("TEMPERATURE")),
                "humidity_pct": _to_float(values.get("HUMIDITY")),
                "pressure_hpa": _to_float(values.get("PRESSURE")),
                "wind_speed_ms": None,
                "wind_direction_deg": None,
            }
        )
    return rows


def normalize_airly(raw: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
    current_section = raw.get("current", {}) or {}
    values = _airly_values_to_dict(current_section.get("values"))

    current = {
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

    normalized = {
        "current": current,
        "history": _normalize_airly_timeseries(raw.get("history")),
        "forecast": _normalize_airly_timeseries(raw.get("forecast")),
        "meta": {"timezone": "UTC", "units": dict(UNITS)},
        "measurement_window": {
            "from": current_section.get("fromDateTime"),
            "to": current_section.get("tillDateTime"),
        },
        "source": source,
        "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
    }

    if CACHE_RAW:
        normalized["raw"] = raw

    return normalized


def normalized_has_data(normalized: Dict[str, Any]) -> bool:
    cur = normalized.get("current") or {}
    return cur.get("pm25") is not None or cur.get("pm10") is not None


# ---------------------------
# OpenAQ fallback
# ---------------------------


def fetch_openaq_latest_nearby(
    lat: float, lon: float, radius_km: float
) -> Optional[Dict[str, Any]]:
    if not OPENAQ_KEY:
        return None

    headers = {"X-API-Key": OPENAQ_KEY}
    params = {
        "coordinates": f"{lat},{lon}",
        "radius": int(radius_km * 1000),
        "limit": 50,
        "sort": "distance",
    }

    r = requests.get(OPENAQ_LATEST_URL, headers=headers, params=params, timeout=12)
    if r.status_code == 401:
        raise RuntimeError("OpenAQ unauthorized: check open_aq in .env (X-API-Key).")
    r.raise_for_status()
    data = r.json()

    results = data.get("results") or []
    if not results:
        return None

    for loc in results:
        coords = loc.get("coordinates") or {}
        lat2 = coords.get("latitude")
        lon2 = coords.get("longitude")
        if lat2 is None or lon2 is None:
            continue

        measurements = loc.get("measurements") or []
        pm25 = None
        pm10 = None
        for m in measurements:
            if not isinstance(m, dict):
                continue
            param = (m.get("parameter") or "").lower()
            val = _to_float(m.get("value"))
            if param in ("pm25", "pm2.5"):
                pm25 = val
            elif param == "pm10":
                pm10 = val

        if pm25 is None and pm10 is None:
            continue

        dist = haversine_km(lat, lon, float(lat2), float(lon2))
        if dist > radius_km:
            return None

        source = {
            "provider": "openaq",
            "method": "nearest_station",
            "max_distance_km": radius_km,
            "distance_km": round(dist, 2),
            "location_name": loc.get("location") or loc.get("name"),
            "message": f"Used OpenAQ nearest station (~{dist:.1f} km).",
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
            "meta": {"timezone": "UTC", "units": dict(UNITS)},
            "measurement_window": {"from": None, "to": None},
            "source": source,
            "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
        }

        if CACHE_RAW:
            normalized["raw"] = data

        return normalized

    return None


# ---------------------------
# Open-Meteo Air Quality fallback (model)
# ---------------------------


def fetch_openmeteo_air_quality(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": "UTC",
        "current": "pm10,pm2_5",
        "hourly": "pm10,pm2_5",
        "past_days": 1,
        "forecast_days": 2,
    }

    r = requests.get(OPENMETEO_AQ_URL, params=params, timeout=12)
    r.raise_for_status()
    data = r.json()

    current = data.get("current") or {}
    cur_pm25 = _to_float(current.get("pm2_5"))
    cur_pm10 = _to_float(current.get("pm10"))
    cur_time = current.get("time")

    if cur_pm25 is None and cur_pm10 is None:
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    pm25_list = hourly.get("pm2_5") or []
    pm10_list = hourly.get("pm10") or []

    now_dt = _parse_iso_utc(cur_time) or datetime.now(timezone.utc)
    history: List[Dict[str, Any]] = []
    forecast: List[Dict[str, Any]] = []

    n = min(len(times), len(pm25_list), len(pm10_list))
    for i in range(n):
        t = times[i]
        dt = _parse_iso_utc(t)
        if not dt:
            continue

        row = {
            "time": t if t.endswith("Z") else f"{t}Z",
            "pm25": _to_float(pm25_list[i]),
            "pm10": _to_float(pm10_list[i]),
            "temperature_c": None,
            "humidity_pct": None,
            "pressure_hpa": None,
            "wind_speed_ms": None,
            "wind_direction_deg": None,
        }

        diff_hours = (dt - now_dt).total_seconds() / 3600.0
        if diff_hours <= 0 and abs(diff_hours) <= OPENMETEO_PAST_HOURS:
            history.append(row)
        elif diff_hours > 0 and diff_hours <= OPENMETEO_FUTURE_HOURS:
            forecast.append(row)

    source = {
        "provider": "open-meteo",
        "method": "model",
        "message": "Model-based estimate (not station-measured).",
    }

    normalized = {
        "current": {
            "pm25": cur_pm25,
            "pm10": cur_pm10,
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
        "meta": {"timezone": "UTC", "units": dict(UNITS)},
        "measurement_window": {"from": cur_time, "to": cur_time},
        "source": source,
        "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
    }

    if CACHE_RAW:
        normalized["raw"] = data

    return normalized


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


def fetch_openmeteo_weather(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": "UTC",
        "current": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m",
        "hourly": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m",
        "past_days": 1,
        "forecast_days": 2,
    }

    r = requests.get(OPENMETEO_WEATHER_URL, params=params, timeout=12)
    r.raise_for_status()
    data = r.json()

    if not (data.get("current") or data.get("hourly")):
        return None

    data["_source"] = {
        "provider": "open-meteo",
        "type": "weather_model",
        "message": "Weather values are model-based estimates (not local sensor).",
    }
    return data


def _build_openmeteo_weather_map(
    weather_data: Dict[str, Any],
) -> Dict[str, Dict[str, Optional[float]]]:
    hourly = weather_data.get("hourly") or {}
    times = hourly.get("time") or []

    t_list = hourly.get("temperature_2m") or []
    h_list = hourly.get("relative_humidity_2m") or []
    p_list = hourly.get("surface_pressure") or []
    ws_list = hourly.get("wind_speed_10m") or []
    wd_list = hourly.get("wind_direction_10m") or []

    n = min(len(times), len(t_list), len(h_list), len(p_list), len(ws_list), len(wd_list))
    out: Dict[str, Dict[str, Optional[float]]] = {}

    for i in range(n):
        key = _time_to_key(times[i])
        if not key:
            continue
        out[key] = {
            "temperature_c": _to_float(t_list[i]),
            "humidity_pct": _to_float(h_list[i]),
            "pressure_hpa": _to_float(p_list[i]),
            "wind_speed_ms": _to_float(ws_list[i]),
            "wind_direction_deg": _to_float(wd_list[i]),
        }
    return out


def enrich_with_weather_if_missing(lat: float, lon: float, norm: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(norm, dict) or not _normalized_needs_weather(norm):
        # still fix meta units + completeness
        return _finalize_normalized(norm)

    key = _index_key(lat, lon)
    weather_cache = _cache_path(f"wx_openmeteo_{key}.json")

    weather_data = _cache_read(weather_cache, TTL_WEATHER)
    if not weather_data or not isinstance(weather_data, dict):
        try:
            weather_data = fetch_openmeteo_weather(lat, lon)
            if weather_data:
                _cache_write(weather_cache, weather_data)
        except requests.RequestException as e:
            if DEBUG:
                print(f"DEBUG: Open-Meteo weather fetch failed: {e}")
            return _finalize_normalized(norm)

    if not weather_data:
        return _finalize_normalized(norm)

    wx_map = _build_openmeteo_weather_map(weather_data)

    # current time key selection
    mw = norm.get("measurement_window") or {}
    cur_key = _time_to_key(mw.get("from") or mw.get("to") or "")
    if not cur_key and isinstance(norm.get("history"), list) and norm["history"]:
        cur_key = _time_to_key(norm["history"][-1].get("time", ""))
    if not cur_key:
        cur_key = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0).strftime(
            "%Y-%m-%dT%H:00Z"
        )

    # merge into current
    cur = norm.get("current") or {}
    wx_cur = wx_map.get(cur_key)
    if wx_cur:
        if cur.get("temperature_c") is None:
            cur["temperature_c"] = wx_cur.get("temperature_c")
        if cur.get("humidity_pct") is None:
            cur["humidity_pct"] = wx_cur.get("humidity_pct")
        if cur.get("pressure_hpa") is None:
            cur["pressure_hpa"] = wx_cur.get("pressure_hpa")

        # extra helpful fields (wind)
        if cur.get("wind_speed_ms") is None:
            cur["wind_speed_ms"] = wx_cur.get("wind_speed_ms")
        if cur.get("wind_direction_deg") is None:
            cur["wind_direction_deg"] = wx_cur.get("wind_direction_deg")

        norm["current"] = cur

    # merge into history/forecast by time
    for series_name in ("history", "forecast"):
        series = norm.get(series_name)
        if not isinstance(series, list):
            continue
        for row in series:
            if not isinstance(row, dict):
                continue
            tkey = _time_to_key(row.get("time", ""))
            if not tkey:
                continue
            wx = wx_map.get(tkey)
            if not wx:
                continue

            if row.get("temperature_c") is None:
                row["temperature_c"] = wx.get("temperature_c")
            if row.get("humidity_pct") is None:
                row["humidity_pct"] = wx.get("humidity_pct")
            if row.get("pressure_hpa") is None:
                row["pressure_hpa"] = wx.get("pressure_hpa")

            if row.get("wind_speed_ms") is None:
                row["wind_speed_ms"] = wx.get("wind_speed_ms")
            if row.get("wind_direction_deg") is None:
                row["wind_direction_deg"] = wx.get("wind_direction_deg")

    meta = norm.get("meta") or {}
    meta["units"] = dict(UNITS)
    meta["weather_source"] = weather_data.get("_source") or {
        "provider": "open-meteo",
        "type": "weather_model",
        "message": "Weather values are model-based estimates (not local sensor).",
    }
    norm["meta"] = meta

    return _finalize_normalized(norm)


def _finalize_normalized(norm: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure stable meta units + add data completeness flags."""
    if not isinstance(norm, dict):
        return norm

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
    )
    cached_model = _cache_read(openmeteo_cache, TTL_MODEL)
    if cached_model and isinstance(cached_model, dict) and normalized_has_data(cached_model):
        return enrich_with_weather_if_missing(lat, lon, cached_model)

    norm_model = None
    try:
        norm_model = fetch_openmeteo_air_quality(lat, lon)
    except requests.RequestException as e:
        if DEBUG:
            print(f"DEBUG: Open-Meteo AQ failed: {e}")

    if norm_model and normalized_has_data(norm_model):
        norm_model["cache"]["ttl_sec"] = TTL_MODEL
        _cache_write(openmeteo_cache, norm_model)
        return enrich_with_weather_if_missing(lat, lon, norm_model)

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
        },
        "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
    }
    return _finalize_normalized(empty)


# ---------------------------
# Nominatim Geocode (cached)
# ---------------------------

nominatim_cache_limit = 2592000  # 30 days

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
    normalized_address = _normalize_address(address)
    if not normalized_address:
        print("Error: Address cannot be empty.")
        return None

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


# ---------------------------
# Test run
# ---------------------------

if __name__ == "__main__":
    if not AIRLY_KEY:
        print("Warning: Missing airly_api in .env. Airly will be skipped.")

    # Change to your test coordinate
    # lat, lon = 50.06181931884119, 19.944253822218883 # Krakow
    lat, lon = 59.292255694378156, 18.062688971478863 # Stockholm
    # lat, lon = 57.747265679833035, 14.148995929052834 # Jönköping
    # lat, lon = 35.36275362842963, -38.43789196824119 # Atlantic

    normalized = get_air_quality_data(lat, lon)
    print(json.dumps(normalized, indent=2, ensure_ascii=False))

    coords = get_lat_lon_nominatim_cached("Kungsgatan 4, Stockholm")
    print("Coords:", coords)
