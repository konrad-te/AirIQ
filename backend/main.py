import hashlib
import json
import os
import time
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim

cache_folder = r"C:\Users\Admin\Desktop\AI Ingenjör och Maskininlärning\Webbramverk i python\AirIQ\data\cache"
load_dotenv()

api_key = os.getenv("airly_api")
api_key_2 = os.getenv("owm_api")

headers = {"Accept": "application/json", "apikey": api_key}


def fetch_air_quality_data(lat: float, lon: float) -> dict:
    """
    Fetches air quality data for a specific geographic point using Airly's
    interpolated measurements (based on nearby stations within ~1.5 km).
    Returns a dict: Air quality data including current, history, and forecast sections.
    """

    url = "https://airapi.airly.eu/v2/measurements/point"
    params = {"lat": lat, "lng": lon}
    response = requests.get(url, headers=headers, params=params, timeout=10)
    response.raise_for_status()
    return response.json()


# vvv Used to test the function vvv
# data = fetch_air_quality_data(50.509139467141765, 19.413033344281995)
# print(json.dumps(data, indent=2, ensure_ascii=False))


def airly_has_data(data: dict) -> bool:
    """
    Checks whether the Airly response contains any actual measurement values.
    Returns False when no nearby stations are available (values list is empty).
    """
    current = data.get("current", {})
    values = current.get("values") or []
    if values:  # has at least one measurement
        return True
    # If values are empty, treat as no data
    return False


old_data_limit = 3600  # seconds


def get_air_quality_data(lat: float, lon: float) -> dict:
    """
    Retrieve air quality data for a geographic point using local caching.

    The function first attempts to load cached air quality data based on the
    provided latitude and longitude. Cache files are keyed by rounded
    coordinates (4 decimal places) to avoid excessive file creation.

    If cached data exists and is newer than `old_data_limit`, it is returned
    immediately. Otherwise, fresh data is fetched from the external air quality
    API.

    Responses that do not contain valid air quality sensor data are returned
    but deliberately not cached, ensuring that missing or incomplete data does
    not become permanently stored.

    Args:
        lat (float): Latitude of the requested location.
        lon (float): Longitude of the requested location.

    Returns:
        dict: Air quality data fetched from cache or the external API.
    """

    key = f"{lat:.4f}_{lon:.4f}"  # :.4f means round to 4 decimals
    filename = os.path.join(cache_folder, f"air_point_{key}.json")
    if os.path.exists(filename):
        file_age = time.time() - os.path.getmtime(filename)
        if file_age < old_data_limit:
            print("Using cached data")
            with open(filename, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            print("Cached data is too old, fetching new data.")
    else:
        print("No cache found. Fetching new data.")
    data = fetch_air_quality_data(lat, lon)
    if not airly_has_data(data):  # If data is empty - don't cache the file
        return data
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return data


def extract_airly_current(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts normalized air quality data from Airly 'current' response.

    Returns a standardized structure:
    {
        "current": {...},
        "measurement_window": {...},
        "source": {...}
    }
    """
    current_section = data.get("current", {})
    values_list = current_section.get("values", [])

    # Convert list of {name, value} into dictionary
    raw_values = {
        item.get("name"): item.get("value") for item in values_list if "name" in item
    }

    normalized_current = {
        "pm25": raw_values.get("PM25"),
        "pm10": raw_values.get("PM10"),
        "temperature_c": raw_values.get("TEMPERATURE"),
        "humidity_pct": raw_values.get("HUMIDITY"),
        "pressure_hpa": raw_values.get("PRESSURE"),
    }
    return {
        "current": normalized_current,
        "measurement_window": {
            "from": current_section.get("fromDateTime"),
            "to": current_section.get("tillDateTime"),
        },
        "source": {"provider": "airly", "method": "point"},
    }


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


# if __name__ == "__main__":
#     lat, lon = 50.50921921512974, 19.411960729382777

#     raw = get_air_quality_data(lat, lon)
#     normalized = extract_airly_current(raw)

#     print("Normalized output:")
#     print(json.dumps(normalized, indent=2, ensure_ascii=False))

"""
Geocode Nominatim
Implement Nominatim solution that translates a adress into a geolocation, cache the information inside data/cache and use a logic that checks the cache before making a Nominatim request.
https://nominatim.org/release-docs/develop/api/Lookup/#endpoint
"""

nominatim_cache_limit = 2592000  # 30 days


def _normalize_address(address: str) -> str:
    """Normalize address input so equivalent strings map to the same cache key."""
    return " ".join(address.strip().lower().split())


def get_lat_lon_nominatim_cached(address: str) -> tuple[float, float] | None:
    """
    Translate an address into (lat, lon) using Nominatim with local caching.

    Cache-first flow:
    1. Normalize the address and check for a matching file in data/cache.
    2. If cache is fresh, return cached coordinates.
    3. Otherwise query Nominatim and cache the returned coordinates.
    """
    normalized_address = _normalize_address(address)
    if not normalized_address:
        print("Error: Address cannot be empty.")
        return None

    os.makedirs(cache_folder, exist_ok=True)
    cache_key = hashlib.sha256(normalized_address.encode("utf-8")).hexdigest()[:16]
    cache_file = os.path.join(cache_folder, "nominatim_cache.json")

    cache_data: dict[str, Any] = {}
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

    if isinstance(cache_data.get("entries"), dict):
        cache_entries = cache_data["entries"]
    else:
        # Support both {"entries": {...}} and legacy root-level dict shape.
        cache_entries = cache_data

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
        # Respect Nominatim usage policy by limiting request frequency.
        time.sleep(1.2)
        response = requests.get(
            nominatim_url, params=params, headers=headers, timeout=10
        )
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


if __name__ == "__main__":
    coords = get_lat_lon_nominatim_cached("Kungsgatan 4, Stockholm")
    print("Coords:", coords)
