import os
import json
import time
import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple, List

import requests
from dotenv import load_dotenv


# ---------------------------
# Config
# ---------------------------

cache_folder = r"C:\Users\konra\Desktop\Air\data\cache"
load_dotenv()

AIRLY_KEY = os.getenv("airly_api")
OPENAQ_KEY = os.getenv("open_aq")
CACHE_RAW = os.getenv("CACHE_RAW", "0") == "1"  # will cache raw data if cache_raw is set to 1 in .env (debugging tool)


if not AIRLY_KEY:
    raise RuntimeError("Missing airly_api in your .env")

AIRLY_HEADERS = {"Accept": "application/json", "apikey": AIRLY_KEY}

DEBUG = False # will print debugg messages if set to True

# TTLs (seconds) - How long is cached data considered valid
TTL_CURRENT = 10 * 60          # 10 min (current data changes often)
TTL_STATION = 10 * 60          # 10 min for Airly/OpenAQ nearest station
TTL_MODEL = 20 * 60            # 20 min for model-based data
INSTALLATION_INDEX_TTL = 7 * 24 * 3600  # 7 days
CACHE_CLEANUP_ENABLED = True
CACHE_MAX_FILES = 2000                 # cap total files
CACHE_MAX_AGE_SEC = 2 * 24 * 3600      # delete cache files older than 2 days

# Distances
AIRLY_NEAREST_MAX_DISTANCE_KM = 5
OPENAQ_MAX_DISTANCE_KM = 50
INTERPOLATION_CLOSE_KM = 1.5

# Open-Meteo time window - how much of history/forecast is saved 
OPENMETEO_PAST_HOURS = 24
OPENMETEO_FUTURE_HOURS = 24

# Airly endpoints
AIRLY_POINT_URL = "https://airapi.airly.eu/v2/measurements/point" # interpolated
AIRLY_NEAREST_URL = "https://airapi.airly.eu/v2/measurements/nearest" # nearest station up to 5km

# OpenAQ endpoint (v3)
OPENAQ_LATEST_URL = "https://api.openaq.org/v3/latest" # up to 50km 

# Open-Meteo Air Quality endpoint
OPENMETEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality" # >50km


# ---------------------------
# Cache helpers
# ---------------------------

def _ensure_cache_dir() -> None: 
    """Skapar cache folder om den inte finns""" 
    os.makedirs(cache_folder, exist_ok=True)


def _cache_read(path: str, max_age_seconds: int) -> Optional[dict]: 
    """
    Reads cached JSON data from a file if it exists and is still valid.

    The function checks:
    - if the cache file exists
    - how old the file is based on its last modified time
    - whether the file age is within the allowed TTL (max_age_seconds)

    If the cache is missing, too old, or contains invalid JSON,
    the function returns None so fresh data can be fetched instead.
    """
    if not os.path.exists(path):
        return None
    age = time.time() - os.path.getmtime(path)
    if age >= max_age_seconds:
        return None
    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return None


def _cache_write(path: str, data: dict) -> None:
    """
    Writes data to a cache file as formatted JSON.

    The function first ensures that the cache directory exists,
    then saves the provided dictionary to the given file path.
    The JSON is written with indentation for readability and
    UTF-8 encoding so special characters are preserved (for example Polish letters).
    """
    _ensure_cache_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _cleanup_cache_dir(
    max_files: int = CACHE_MAX_FILES,
    max_age_sec: int = CACHE_MAX_AGE_SEC,
    ) -> None:
    """
    Deletes old cache files to prevent disk spam.
    - removes files older than max_age_sec
    - then enforces max_files by deleting oldest remaining files
    Keeps installation_index.json (long-lived mapping) unless it's very old.
    """
    if not CACHE_CLEANUP_ENABLED:
        return

    _ensure_cache_dir()

    now = time.time()
    keep_names = {"installation_index.json"}  # special case: keep longer

    files: List[str] = []
    for name in os.listdir(cache_folder):
        path = os.path.join(cache_folder, name)
        if not os.path.isfile(path):
            continue
        files.append(path)

    # 1) delete by age (except installation_index.json uses its own TTL)
    for path in files:
        name = os.path.basename(path)
        age = now - os.path.getmtime(path)

        # keep installation index unless it's older than its own TTL
        if name in keep_names:
            if age > INSTALLATION_INDEX_TTL:
                try:
                    os.remove(path)
                except OSError:
                    pass
            continue

        if age > max_age_sec:
            try:
                os.remove(path)
            except OSError:
                pass

    # refresh file list after deletions
    files = []
    for name in os.listdir(cache_folder):
        path = os.path.join(cache_folder, name)
        if os.path.isfile(path):
            files.append(path)

    # 2) enforce max file count (delete oldest first), still prefer keeping index
    if len(files) <= max_files:
        return

    def sort_key(p: str) -> float:
        return os.path.getmtime(p)

    # Separate protected file(s)
    protected = []
    deletable = []
    for p in files:
        if os.path.basename(p) in keep_names:
            protected.append(p)
        else:
            deletable.append(p)

    deletable.sort(key=sort_key)  # oldest first

    # delete oldest until within limit
    while len(deletable) + len(protected) > max_files and deletable:
        p = deletable.pop(0)
        try:
            os.remove(p)
        except OSError:
            pass



COORD_PRECISION = 3  # 3 decimals ~ 111m lat resolution (roughly)

def _index_key(lat: float, lon: float) -> str:
    return f"{lat:.{COORD_PRECISION}f}_{lon:.{COORD_PRECISION}f}"


def _cache_path(name: str) -> str:
    return os.path.join(cache_folder, name)


# ---------------------------
# Geo (Haversine)
# ---------------------------

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance based on two geolocations"""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ---------------------------
# Installation index cache (lat/lon -> installationId)
# ---------------------------

def _index_cache_path() -> str:
    """Helps reduce repeated /nearest API calls by remembering which
    station was previously used for a given location."""
    return _cache_path("installation_index.json")


def _load_installation_index() -> dict:
    """Loads the installation index from cache if it exists and is still valid."""
    data = _cache_read(_index_cache_path(), INSTALLATION_INDEX_TTL)
    return data if isinstance(data, dict) else {}


def _save_installation_index(index: dict) -> None:
    """Saves the installation index to disk."""
    _cache_write(_index_cache_path(), index)


# ---------------------------
# Airly fetchers
# ---------------------------

def fetch_airly_point(lat: float, lon: float) -> dict:
    """Interpolated method"""
    params = {"lat": lat, "lng": lon}
    r = requests.get(AIRLY_POINT_URL, headers=AIRLY_HEADERS, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_airly_nearest(lat: float, lon: float, max_distance_km: int = AIRLY_NEAREST_MAX_DISTANCE_KM) -> dict:
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
# Normalization helpers
# ---------------------------

def _to_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


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
    """
    Airly 'history'/'forecast' usually: list of dicts with:
      fromDateTime, tillDateTime, values:[{name,value},...]
    """
    if not isinstance(series, list):
        return []

    rows: List[Dict[str, Any]] = []
    for slot in series:
        if not isinstance(slot, dict):
            continue
        values = _airly_values_to_dict(slot.get("values"))
        rows.append({
            "time": slot.get("fromDateTime") or slot.get("tillDateTime"),
            "pm25": _to_float(values.get("PM25")),
            "pm10": _to_float(values.get("PM10")),
            "temperature_c": _to_float(values.get("TEMPERATURE")),
            "humidity_pct": _to_float(values.get("HUMIDITY")),
            "pressure_hpa": _to_float(values.get("PRESSURE")),
        })
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
        "no2": _to_float(values.get("NO2")),
        "co": _to_float(values.get("CO")),
        "o3": _to_float(values.get("O3")),
        "so2": _to_float(values.get("SO2")),
    }

    normalized = {
        "current": current,
        "history": _normalize_airly_timeseries(raw.get("history")),
        "forecast": _normalize_airly_timeseries(raw.get("forecast")),
        "meta": {
            "timezone": "UTC",
            "units": {
                "pm": "µg/m³",
                "temperature": "°C",
                "pressure": "hPa",
            },
        },
        "measurement_window": {
            "from": current_section.get("fromDateTime"),
            "to": current_section.get("tillDateTime"),
        },
        "source": source,
        "cache": {
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
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

def fetch_openaq_latest_nearby(lat: float, lon: float, radius_km: float) -> Optional[Dict[str, Any]]:
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

    # pick closest entry with pm2.5/pm10
    for loc in results:
        coords = (loc.get("coordinates") or {})
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
                "no2": None,
                "co": None,
                "o3": None,
                "so2": None,
            },
            "history": [],
            "forecast": [],
            "meta": {
                "timezone": "UTC",
                "units": {"pm": "µg/m³"},
            },
            "measurement_window": {"from": None, "to": None},
            "source": source,
            "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
        }

        if CACHE_RAW:
            normalized["raw"] = data

        return normalized

    return None


# ---------------------------
# Open-Meteo fallback (model)
# ---------------------------

def _parse_iso_utc(ts: str) -> Optional[datetime]:
    if not ts or not isinstance(ts, str):
        return None
    try:
        # Open-Meteo returns like "2026-02-16T10:00"
        # We'll interpret as UTC because we request timezone=UTC
        if ts.endswith("Z"):
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        # If no offset, treat as UTC
        return datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def fetch_openmeteo_air_quality(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": "UTC",
        "current": "pm10,pm2_5",
        "hourly": "pm10,pm2_5",
        "past_days": 1,          # gives us history window
        "forecast_days": 2,      # gives us forecast window
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

    # Build hourly history + forecast (then we trim to past/future hours)
    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    pm25_list = hourly.get("pm2_5") or []
    pm10_list = hourly.get("pm10") or []

    now_dt = _parse_iso_utc(cur_time) or datetime.now(timezone.utc)
    history: List[Dict[str, Any]] = []
    forecast: List[Dict[str, Any]] = []

    # Walk aligned arrays safely
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
            "no2": None,
            "co": None,
            "o3": None,
            "so2": None,
        },
        "history": history,
        "forecast": forecast,
        "meta": {
            "timezone": "UTC",
            "units": {"pm": "µg/m³"},
        },
        "measurement_window": {"from": cur_time, "to": cur_time},
        "source": source,
        "cache": {"created_at": datetime.now(timezone.utc).isoformat()},
    }

    if CACHE_RAW:
        normalized["raw"] = data

    return normalized


# ---------------------------
# Main retrieval (normalized + caching)
# ---------------------------

def get_air_quality_data(lat: float, lon: float) -> Dict[str, Any]:
    """
    Returns NORMALIZED data (not raw), with fallbacks:
      1) Airly /point
      2) Airly /nearest (<= AIRLY_NEAREST_MAX_DISTANCE_KM)
      3) OpenAQ nearest (<= OPENAQ_MAX_DISTANCE_KM)
      4) Open-Meteo model (always available)
    """
    _ensure_cache_dir()
    _cleanup_cache_dir()
    key = _index_key(lat, lon)

    # ---------- 1) Airly point (cached normalized) ----------
    airly_point_cache = _cache_path(f"norm_airly_point_{key}.json")
    cached = _cache_read(airly_point_cache, TTL_CURRENT)
    if cached and isinstance(cached, dict) and normalized_has_data(cached):
        return cached

    try:
        raw_point = fetch_airly_point(lat, lon)
    except requests.RequestException as e:
        if DEBUG:
            print(f"DEBUG: Airly /point failed: {e}")
        raw_point = {}

    # Normalize (even if empty) so schema is stable
    point_source = {
        "provider": "airly",
        "method": "point",
        "message": "Used interpolated point measurements (if available).",
    }
    norm_point = normalize_airly(raw_point, point_source)

    if normalized_has_data(norm_point):
        norm_point["cache"]["ttl_sec"] = TTL_CURRENT
        _cache_write(airly_point_cache, norm_point)
        return norm_point

    # ---------- 2) Airly nearest (station cache by installationId when possible) ----------
    index = _load_installation_index()
    inst_id = index.get(key)

    if isinstance(inst_id, int):
        airly_station_cache = _cache_path(f"norm_airly_station_{inst_id}_{AIRLY_NEAREST_MAX_DISTANCE_KM}km.json")
        cached_station = _cache_read(airly_station_cache, TTL_STATION)
        if cached_station and isinstance(cached_station, dict) and normalized_has_data(cached_station):
            return cached_station

    # If no cached station, call nearest
    try:
        raw_nearest = fetch_airly_nearest(lat, lon, max_distance_km=AIRLY_NEAREST_MAX_DISTANCE_KM)
    except requests.RequestException as e:
        # If nearest fails, continue to other providers
        raw_nearest = {}
        if DEBUG:
            print(f"DEBUG: Airly /nearest failed: {e}")

    if raw_nearest:
        inst_id2 = get_airly_installation_id(raw_nearest)
        coords = get_airly_installation_coords(raw_nearest)
        distance_km = None
        if coords:
            distance_km = haversine_km(lat, lon, coords[0], coords[1])

        method = "nearest_station"
        msg = f"/point had no values, so used Airly nearest (<= {AIRLY_NEAREST_MAX_DISTANCE_KM} km)."
        if distance_km is not None:
            if distance_km <= INTERPOLATION_CLOSE_KM:
                msg = f"/point had no values, but nearest station is very close (~{distance_km:.1f} km). Using nearest station."
            else:
                msg += f" Nearest station is ~{distance_km:.1f} km away."
        else:
            msg += " (Distance unknown.)"

        nearest_source = {
            "provider": "airly",
            "method": method,
            "max_distance_km": AIRLY_NEAREST_MAX_DISTANCE_KM,
            "installation_id": inst_id2,
            "distance_km": round(distance_km, 2) if distance_km is not None else None,
            "message": msg,
        }

        norm_nearest = normalize_airly(raw_nearest, nearest_source)

        if normalized_has_data(norm_nearest):
            norm_nearest["cache"]["ttl_sec"] = TTL_STATION

            if isinstance(inst_id2, int):
                # station cache by installation id
                airly_station_cache = _cache_path(f"norm_airly_station_{inst_id2}_{AIRLY_NEAREST_MAX_DISTANCE_KM}km.json")
                _cache_write(airly_station_cache, norm_nearest)
                index[key] = inst_id2
                _save_installation_index(index)
            else:
                # fallback cache by location key (rare case)
                airly_nearest_cache = _cache_path(f"norm_airly_nearest_{key}_{AIRLY_NEAREST_MAX_DISTANCE_KM}km.json")
                _cache_write(airly_nearest_cache, norm_nearest)

            return norm_nearest

    # ---------- 3) OpenAQ nearest ----------
    openaq_cache = _cache_path(f"norm_openaq_nearest_{key}_{OPENAQ_MAX_DISTANCE_KM}km.json")
    cached_openaq = _cache_read(openaq_cache, TTL_STATION)
    if cached_openaq and isinstance(cached_openaq, dict) and normalized_has_data(cached_openaq):
        return cached_openaq

    try:
        norm_openaq = fetch_openaq_latest_nearby(lat, lon, radius_km=OPENAQ_MAX_DISTANCE_KM)
    except (requests.RequestException, RuntimeError) as e:
        norm_openaq = None
        if DEBUG:
            print(f"DEBUG: OpenAQ failed: {e}")

    if norm_openaq and normalized_has_data(norm_openaq):
        norm_openaq["cache"]["ttl_sec"] = TTL_STATION
        _cache_write(openaq_cache, norm_openaq)
        return norm_openaq

    # ---------- 4) Open-Meteo model ----------
    openmeteo_cache = _cache_path(f"norm_openmeteo_model_{key}_{OPENMETEO_PAST_HOURS}h_{OPENMETEO_FUTURE_HOURS}h.json")
    cached_model = _cache_read(openmeteo_cache, TTL_MODEL)
    if cached_model and isinstance(cached_model, dict) and normalized_has_data(cached_model):
        return cached_model

    try:
        norm_model = fetch_openmeteo_air_quality(lat, lon)
    except requests.RequestException as e:
        norm_model = None
        if DEBUG:
            print(f"DEBUG: Open-Meteo failed: {e}")

    if norm_model and normalized_has_data(norm_model):
        norm_model["cache"]["ttl_sec"] = TTL_MODEL
        _cache_write(openmeteo_cache, norm_model)
        return norm_model

    # ---------- Final fallback: empty normalized ----------
    return {
        "current": {
            "pm25": None,
            "pm10": None,
            "temperature_c": None,
            "humidity_pct": None,
            "pressure_hpa": None,
            "no2": None,
            "co": None,
            "o3": None,
            "so2": None,
        },
        "history": [],
        "forecast": [],
        "meta": {"timezone": "UTC", "units": {"pm": "µg/m³"}},
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


# ---------------------------
# Test run
# ---------------------------

if __name__ == "__main__":
    # Change to your test coordinate
    lat, lon = 53.23533544661682, 12.09130881465885

    normalized = get_air_quality_data(lat, lon)
    print(json.dumps(normalized, indent=2, ensure_ascii=False))
