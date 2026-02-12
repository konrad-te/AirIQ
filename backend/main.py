import requests
import json
from dotenv import load_dotenv
import os
import time
from typing import Any, Dict, Optional

cache_folder = r"C:\Users\konra\Desktop\Air\data\cache"
load_dotenv()

api_key = os.getenv("airly_api")
api_key_2 = os.getenv("owm_api")

headers = {
    'Accept': 'application/json',
    'apikey': api_key
}



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
   
    key = f"{lat:.4f}_{lon:.4f}" # :.4f means round to 4 decimals
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
    if not airly_has_data(data): # If data is empty - don't cache the file
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
        item.get("name"): item.get("value")
        for item in values_list
        if "name" in item
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
        "source": {
            "provider": "airly",
            "method": "point"
        }
    }

if __name__ == "__main__":
    lat, lon = 50.50921921512974, 19.411960729382777

    raw = get_air_quality_data(lat, lon)
    normalized = extract_airly_current(raw)

    print("Normalized output:")
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