import os
import json
import time
import math
from typing import Any, Dict, Optional, Tuple

import requests
from dotenv import load_dotenv

# ---------------------------
# Config
# ---------------------------

cache_folder = r"C:\Users\konra\Desktop\Air\data\cache"
load_dotenv()

api_key = os.getenv("airly_api")
if not api_key:
    raise RuntimeError("Missing airly_api in your .env")

headers = {"Accept": "application/json", "apikey": api_key}

OLD_DATA_LIMIT = 3600  # seconds
NEAREST_MAX_DISTANCE_KM = 10
INTERPOLATION_CLOSE_KM = 1.5  # your “interpolated should work” mental model threshold
INSTALLATION_INDEX_TTL = 7 * 24 * 3600  # 7 days

DEBUG = False  # set True temporarily when diagnosing

POINT_URL = "https://airapi.airly.eu/v2/measurements/point"
NEAREST_URL = "https://airapi.airly.eu/v2/measurements/nearest"


# ---------------------------
# Cache helpers
# ---------------------------

def _ensure_cache_dir() -> None:
    os.makedirs(cache_folder, exist_ok=True)


def _cache_read(path: str, max_age_seconds: int) -> Optional[dict]:
    if not os.path.exists(path):
        return None
    age = time.time() - os.path.getmtime(path)
    if age >= max_age_seconds:
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _cache_write(path: str, data: dict) -> None:
    _ensure_cache_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ---------------------------
# Airly fetchers
# ---------------------------

def fetch_airly_point(lat: float, lon: float) -> dict:
    params = {"lat": lat, "lng": lon}
    r = requests.get(POINT_URL, headers=headers, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_airly_nearest(lat: float, lon: float, max_distance_km: int = NEAREST_MAX_DISTANCE_KM) -> dict:
    params = {
        "lat": lat,
        "lng": lon,
        "maxDistanceKM": max_distance_km,
        "indexType": "AIRLY_CAQI",
    }
    r = requests.get(NEAREST_URL, headers=headers, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


# ---------------------------
# Response parsing helpers
# ---------------------------

def airly_has_data(data: dict) -> bool:
    current = data.get("current", {}) or {}
    values = current.get("values") or []
    return isinstance(values, list) and len(values) > 0


def get_installation_id(nearest_data: dict) -> Optional[int]:
    # Most common: nearest_data["installation"]["id"]
    inst = nearest_data.get("installation")
    if isinstance(inst, dict):
        inst_id = inst.get("id")
        if isinstance(inst_id, int):
            return inst_id

    # Alternate: nearest_data["installationId"]
    inst_id = nearest_data.get("installationId")
    if isinstance(inst_id, int):
        return inst_id

    return None


def _try_get_lat_lon_from_obj(obj: Any) -> Optional[Tuple[float, float]]:
    """
    Helper to extract lat/lon from common patterns:
    - {"latitude": .., "longitude": ..}
    - {"lat": .., "lng": ..}
    - {"lat": .., "lon": ..}
    """
    if not isinstance(obj, dict):
        return None

    lat = obj.get("latitude", obj.get("lat"))
    lon = obj.get("longitude", obj.get("lng", obj.get("lon")))

    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        return float(lat), float(lon)
    return None


def get_installation_coords(nearest_data: dict) -> Optional[Tuple[float, float]]:
    """
    Airly often provides installation.location.{latitude,longitude}
    but sometimes responses differ (especially outside PL).
    We try a few reasonable places.
    """
    # Typical: installation -> location
    inst = nearest_data.get("installation")
    if isinstance(inst, dict):
        loc = inst.get("location")
        coords = _try_get_lat_lon_from_obj(loc)
        if coords:
            return coords

        # Sometimes directly on installation
        coords = _try_get_lat_lon_from_obj(inst)
        if coords:
            return coords

    # Sometimes top-level location-ish fields
    coords = _try_get_lat_lon_from_obj(nearest_data.get("location"))
    if coords:
        return coords

    return None


# ---------------------------
# Geo (Haversine)
# ---------------------------

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ---------------------------
# Optional: index cache (lat/lon -> installationId)
# ---------------------------

def _index_cache_path() -> str:
    return os.path.join(cache_folder, "installation_index.json")


def _load_installation_index() -> dict:
    data = _cache_read(_index_cache_path(), INSTALLATION_INDEX_TTL)
    return data if isinstance(data, dict) else {}


def _save_installation_index(index: dict) -> None:
    _cache_write(_index_cache_path(), index)


def _index_key(lat: float, lon: float) -> str:
    return f"{lat:.4f}_{lon:.4f}"


# ---------------------------
# Main retrieval logic
# ---------------------------

def get_air_quality_data(lat: float, lon: float) -> dict:
    """
    Flow:
    1) Use /point (interpolated) if possible (cached by lat/lon).
    2) If /point has no values, use /nearest within NEAREST_MAX_DISTANCE_KM.
       - Accept nearest if it has values EVEN when installation metadata is missing.
       - If station coords are available, compute distance and label it:
           * "nearest_close" if <= INTERPOLATION_CLOSE_KM
           * "nearest" otherwise
    3) If still no data, return the /point response with explanation metadata.

    Always attaches `_airiq_source` metadata for your normalizer/UI layer.
    """
    _ensure_cache_dir()
    rounded_key = _index_key(lat, lon)

    # --- 1) POINT CACHE ---
    point_cache_path = os.path.join(cache_folder, f"air_point_{rounded_key}.json")
    cached_point = _cache_read(point_cache_path, OLD_DATA_LIMIT)
    if cached_point is not None:
        cached_point["_airiq_source"] = {
            "provider": "airly",
            "method": "point",
            "message": "Used interpolated point measurements (nearby stations available).",
        }
        return cached_point

    # --- 1) POINT FETCH ---
    point_data = fetch_airly_point(lat, lon)

    if DEBUG:
        cur = point_data.get("current", {}) or {}
        print("DEBUG POINT RESPONSE:")
        print(json.dumps({
            "values_len": len(cur.get("values") or []),
            "indexes": cur.get("indexes"),
        }, indent=2, ensure_ascii=False))

    if airly_has_data(point_data):
        _cache_write(point_cache_path, point_data)
        point_data["_airiq_source"] = {
            "provider": "airly",
            "method": "point",
            "message": "Used interpolated point measurements (nearby stations available).",
        }
        return point_data

    # --- 2) NEAREST ---
    index = _load_installation_index()
    inst_id_from_index = index.get(rounded_key)

    # 2a) Try cached station via index (only works if we previously had an installationId)
    if isinstance(inst_id_from_index, int):
        station_cache_path = os.path.join(
            cache_folder, f"air_station_{inst_id_from_index}_{NEAREST_MAX_DISTANCE_KM}km.json"
        )
        cached_station = _cache_read(station_cache_path, OLD_DATA_LIMIT)
        if cached_station is not None and airly_has_data(cached_station):
            coords = get_installation_coords(cached_station)
            distance_km = None
            if coords:
                st_lat, st_lon = coords
                distance_km = haversine_km(lat, lon, st_lat, st_lon)

            method = "nearest"
            msg = f"/point had no values, so used cached nearest measurements (<= {NEAREST_MAX_DISTANCE_KM} km)."
            if distance_km is not None:
                if distance_km <= INTERPOLATION_CLOSE_KM:
                    method = "nearest_close"
                    msg = (
                        f"/point had no values, but nearest station is very close (~{distance_km:.1f} km). "
                        "Using nearest station measurements."
                    )
                else:
                    msg += f" Nearest station is ~{distance_km:.1f} km away."

            cached_station["_airiq_source"] = {
                "provider": "airly",
                "method": method,
                "max_distance_km": NEAREST_MAX_DISTANCE_KM,
                "installation_id": inst_id_from_index,
                "distance_km": round(distance_km, 2) if distance_km is not None else None,
                "message": msg,
                "point_interpolation_available": False,
            }
            return cached_station

    # 2b) No usable cache -> call nearest
    try:
        nearest_data = fetch_airly_nearest(lat, lon, max_distance_km=NEAREST_MAX_DISTANCE_KM)
    except requests.RequestException as e:
        # If nearest fails, return point with clear reason
        point_data["_airiq_source"] = {
            "provider": "airly",
            "method": "none",
            "max_distance_km": NEAREST_MAX_DISTANCE_KM,
            "message": f"/point had no values and /nearest request failed: {e}",
            "point_interpolation_available": False,
        }
        return point_data

    if DEBUG:
        cur = nearest_data.get("current", {}) or {}
        print("DEBUG NEAREST RESPONSE:")
        print(json.dumps({
            "installation": nearest_data.get("installation"),
            "installationId": nearest_data.get("installationId"),
            "values_len": len(cur.get("values") or []),
            "indexes": cur.get("indexes"),
        }, indent=2, ensure_ascii=False))

    inst_id = get_installation_id(nearest_data)

    # Accept nearest if it has values, even if installation metadata is missing
    if airly_has_data(nearest_data):
        coords = get_installation_coords(nearest_data)
        distance_km = None
        if coords:
            st_lat, st_lon = coords
            distance_km = haversine_km(lat, lon, st_lat, st_lon)

        # Cache smartly:
        if inst_id is not None:
            station_cache_path = os.path.join(
                cache_folder, f"air_station_{inst_id}_{NEAREST_MAX_DISTANCE_KM}km.json"
            )
            _cache_write(station_cache_path, nearest_data)

            index[rounded_key] = inst_id
            _save_installation_index(index)
        else:
            # Airly sometimes omits installation metadata -> cache by lat/lon key
            station_cache_path = os.path.join(
                cache_folder, f"air_nearest_{rounded_key}_{NEAREST_MAX_DISTANCE_KM}km.json"
            )
            _cache_write(station_cache_path, nearest_data)

        # Decide “close” labeling if we know distance
        method = "nearest"
        msg = f"/point had no values, so used nearest measurements (<= {NEAREST_MAX_DISTANCE_KM} km)."

        if distance_km is not None:
            if distance_km <= INTERPOLATION_CLOSE_KM:
                method = "nearest_close"
                msg = (
                    f"/point had no values, but nearest station is very close (~{distance_km:.1f} km). "
                    "Using nearest station measurements."
                )
            else:
                msg += f" Nearest station is ~{distance_km:.1f} km away."
        else:
            msg += " (Airly response did not include station coordinates; distance unknown.)"

        if inst_id is None:
            msg += " (Installation metadata missing.)"

        nearest_data["_airiq_source"] = {
            "provider": "airly",
            "method": method,  # "nearest" or "nearest_close"
            "max_distance_km": NEAREST_MAX_DISTANCE_KM,
            "installation_id": inst_id,
            "distance_km": round(distance_km, 2) if distance_km is not None else None,
            "message": msg,
            "point_interpolation_available": False,
        }
        return nearest_data

    # 3) Still no data -> return point response (do not cache)
    point_data["_airiq_source"] = {
        "provider": "airly",
        "method": "none",
        "max_distance_km": NEAREST_MAX_DISTANCE_KM,
        "message": f"No Airly values via /point and no nearest values within {NEAREST_MAX_DISTANCE_KM} km.",
        "point_interpolation_available": False,
    }
    return point_data


# ---------------------------
# Normalizer
# ---------------------------

def extract_airly_current(data: Dict[str, Any]) -> Dict[str, Any]:
    current_section = data.get("current", {}) or {}
    values_list = current_section.get("values", []) or []

    raw_values = {
        item.get("name"): item.get("value")
        for item in values_list
        if isinstance(item, dict) and "name" in item
    }

    normalized_current = {
        "pm25": raw_values.get("PM25"),
        "pm10": raw_values.get("PM10"),
        "temperature_c": raw_values.get("TEMPERATURE"),
        "humidity_pct": raw_values.get("HUMIDITY"),
        "pressure_hpa": raw_values.get("PRESSURE"),
        "no2": raw_values.get("NO2"),
        "co": raw_values.get("CO"),
        "o3": raw_values.get("O3"),
        "so2": raw_values.get("SO2"),
    }

    source = data.get("_airiq_source") or {
        "provider": "airly",
        "method": "unknown",
        "message": "No source info.",
    }

    return {
        "current": normalized_current,
        "measurement_window": {
            "from": current_section.get("fromDateTime"),
            "to": current_section.get("tillDateTime"),
        },
        "source": source,
    }


# ---------------------------
# Test run
# ---------------------------

if __name__ == "__main__":
    lat, lon = 59.3293, 18.0686

    raw = get_air_quality_data(lat, lon)
    normalized = extract_airly_current(raw)

    print(json.dumps(normalized, indent=2, ensure_ascii=False))


































"""
EMILS IMPLEMENTATIONS
"""


def get_value(meterological_data, category: str) -> float:
    """
    Instead of a function to fetch each category value, we can use a generic version with parameter to use for TEMPERATURE, PM2.5 etc...//Emil
    """
    for value in meterological_data.values():
        for item in value["values"]:
            if item["name"] == category:
                return item["value"]


def translate_value(value: float, bands: list) -> str:
    """
    Supports two formats in bands:
    1. Pollutants (Threshold, Label) -> Checks if value >= threshold
    2. Weather (Min, Max, Label) -> Checks if min <= value < max
    """
    for item in bands:
        # WEATHER LOGIC (Range-based: Min, Max, Label)
        if len(item) == 3:
            min_val, max_val, label = item
            if min_val <= value < max_val:
                return label

        # POLLUTANT LOGIC (Threshold-based: Limit, Label)
        # Assumes bands are sorted DESCENDING for pollutants
        elif len(item) == 2:
            threshold, label = item
            if value >= threshold:
                return label

    return "Unknown"


POLLUTANT_BANDS = {
    "O3": [
        (380, "Extremely Poor"),
        (240, "Very Poor"),
        (130, "Poor"),
        (100, "Medium"),
        (50, "Good"),
        (0, "Very Good"),
    ],
    "NO2": [
        (340, "Extremely Poor"),
        (230, "Very Poor"),
        (120, "Poor"),
        (90, "Medium"),
        (40, "Good"),
        (0, "Very Good"),
    ],
    "SO2": [
        (750, "Extremely Poor"),
        (500, "Very Poor"),
        (350, "Poor"),
        (200, "Medium"),
        (100, "Good"),
        (0, "Very Good"),
    ],
    "PM10": [
        (150, "Extremely Poor"),
        (100, "Very Poor"),
        (50, "Poor"),
        (40, "Medium"),
        (20, "Good"),
        (0, "Very Good"),
    ],
    "PM25": [
        (75, "Extremely Poor"),
        (50, "Very Poor"),
        (25, "Poor"),
        (20, "Medium"),
        (10, "Good"),
        (0, "Very Good"),
    ],
    "PRESSURE": [
        (1030, 1100, "Very Poor (High)"),  # Extreme High
        (1020, 1030, "Good"),  # Stable/Clear
        (1010, 1020, "Very Good"),  # Optimal (Standard is ~1013)
        (1000, 1010, "Medium"),  # Normal Low
        (990, 1000, "Poor"),  # Stormy
        (970, 990, "Very Poor"),  # Strong Storm
        (0, 970, "Extremely Poor"),  # Hurricane/Cyclone
    ],
    "HUMIDITY": [
        (85, 100, "Very Poor (Damp)"),  # Risk of mold/rot
        (70, 85, "Poor (Humid)"),
        (60, 70, "Medium"),
        (40, 60, "Very Good"),  # Optimal Comfort Zone
        (30, 40, "Good"),
        (20, 30, "Medium (Dry)"),
        (0, 20, "Poor (Dry)"),  # Risk of respiratory issues
    ],
    "TEMPERATURE": [
        # This is a subjective "Comfort" scale (in Celsius)
        (35, 100, "Extremely Poor (Heat)"),
        (30, 35, "Very Poor"),
        (25, 30, "Poor"),
        (18, 25, "Very Good"),  # Room temp sweet spot
        (10, 18, "Good"),
        (0, 10, "Medium"),
        (-10, 0, "Poor (Cold)"),
        (-100, -10, "Very Poor (Freezing)"),
    ],
}

POLLUTANT_ALIASES = {
    "PM2.5": "PM25",
    "PM2_5": "PM25",
    "OZONE": "O3",
    "NITROGEN_DIOXIDE": "NO2",
    "SULPHUR_DIOXIDE": "SO2",
    "HUMIDITY": "HUMIDITY",  # Maps standard name to itself
    "TEMPERATURE": "TEMPERATURE",  # Maps standard name to itself
    "PRESSURE": "PRESSURE",
}


def translate_values_from_data(
    meterological_data: dict,
) -> dict[str, dict[str, float | str]]:
    """
    Translate supported pollutant values from API data using index_level.png bands.
    Returns, for example: {"PM25": {"value": 22.67, "level": "Medium"}}
    """
    translated_values = {}
    current_data = meterological_data.get("current", {})

    for item in current_data.get("values", []):
        raw_name = str(item.get("name", "")).upper()
        pollutant_name = POLLUTANT_ALIASES.get(raw_name, raw_name)
        bands = POLLUTANT_BANDS.get(pollutant_name)

        if not bands:
            continue

        value = float(item["value"])
        translated_values[pollutant_name] = {
            "value": value,
            "level": translate_value(value, bands),
        }

    return translated_values