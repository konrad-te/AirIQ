import requests
import json
from dotenv import load_dotenv
import os
import time

load_dotenv()

api_key = os.getenv("airly_api")

headers = {
    'Accept': 'application/json',
    'apikey': api_key
}

def find_nearest_station_id(lat:float, lon:float, max_distance:int) -> int:
    url = f"https://airapi.airly.eu/v2/installations/nearest?lat={lat}&lng={lon}&maxDistanceKM={max_distance}"
    nearest_station_data = requests.get(url, headers=headers).json()
    for station_id in nearest_station_data:
        return(station_id["id"])

#station_id = find_nearest_station_id(50.5082, 19.4148, 5)    

def fetch_air_quality_data(station_id:int) -> dict:
    url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
    request_air_quality_data = requests.get(url, headers=headers)
    request_air_quality_data.raise_for_status()
    air_quality_data = request_air_quality_data.json()
    return air_quality_data

old_data_limit = 3600 # seconds

def get_air_quality_data(station_id:int):
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
        json.dump(data, f)
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



nearest_station_id = find_nearest_station_id(50.5082, 19.4148, 5)
meterological_data = get_air_quality_data(nearest_station_id)
pm25_value = get_pm25_value(meterological_data)
air_quality = translate_pm25(pm25_value)
print(air_quality)
            
def get_temperature(meterological_data) -> float:
    for value in meterological_data.values():
        for item in value["values"]:
            if item["name"] == "TEMPERATURE":
                return item["value"]
            
    
def fetch_meterological_data():
    pass

# pm25_result = get_pm25_value(meterological_data)
# print(pm25_result)
# temp_result = get_temperature(meterological_data)
# print(temp_result)
# print(translate_pm25(pm25_result))


# print(result)

#def measure_data 
