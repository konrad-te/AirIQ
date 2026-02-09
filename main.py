import json
import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("airly_api")
api_key_2 = os.getenv("owm_api")

headers = {"Accept": "application/json", "apikey": api_key}


def find_nearest_station_id(lat: float, lon: float, max_distance: int) -> int:
    try:
        url = f"https://airapi.airly.eu/v2/installations/nearest?lat={lat}&lng={lon}&maxDistanceKM={max_distance}"
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        nearest_station_data = response.json()
        for station_id in nearest_station_data:
            return station_id["id"]
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print(f"Incorrect API key{e}")


# station_id = find_nearest_station_id(50.5082, 19.4148, 5)


def fetch_air_quality_data(station_id: int) -> dict:
    if station_id is not int:
        print("Incorrect API key")
    url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
    request_air_quality_data = requests.get(url, headers=headers)
    request_air_quality_data.raise_for_status()
    air_quality_data = request_air_quality_data.json()
    return air_quality_data


old_data_limit = 1  # seconds


def get_air_quality_data(station_id: int):
    filename = f"air_data_{station_id}"
    if os.path.exists(filename):
        file_age = time.time() - os.path.getmtime(filename)
        if file_age < old_data_limit:
            print("Using fetched data")
            with open(filename, "r") as f:
                return json.load(f)
        else:
            print("Data is too old, fetching new one.")
    else:
        print("No file found. Fetching new data")
    data = fetch_air_quality_data(station_id)
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)
    return data


def get_pm25_value(meterological_data) -> float:
    for value in meterological_data.values():
        for item in value["values"]:
            if item["name"] == "PM25":
                return item["value"]


def translate_pm25(pm25_result: float) -> str:
    if pm25_result >= 75:
        return "Extremely Poor"
    elif pm25_result >= 50:
        return "Very Poor"
    elif pm25_result >= 25:
        return "Poor"
    elif pm25_result >= 20:
        return "Medium"
    elif pm25_result >= 10:
        return "Good"
    elif pm25_result >= 0:
        return "Very Good"
    else:
        return "Incorrect pm25 level"


def get_temperature(meterological_data) -> float:
    for value in meterological_data.values():
        for item in value["values"]:
            if item["name"] == "TEMPERATURE":
                return item["value"]


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


"""
TEST ZONE BELOW
"""
nearest_station_id = find_nearest_station_id(50.5082, 19.4148, 5)
meterological_data = get_air_quality_data(nearest_station_id)
# pm25_value = get_pm25_value(meterological_data)
# air_quality = translate_pm25(pm25_value)
# temp = get_temperature(meterological_data)
# print(air_quality)
# print(temp)
# temp = get_value(meterological_data, category="TEMPERATURE")
# print(temp)

from air_data_example import data_1

translated = translate_values_from_data(data_1)
print(translated)


def fetch_meterological_data():
    pass


# pm25_result = get_pm25_value(meterological_data)
# print(pm25_result)
# temp_result = get_temperature(meterological_data)
# print(temp_result)
# print(translate_pm25(pm25_result))


# print(result)

# def measure_data
