import requests
import json
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("airly_api")

headers = {
    'Accept': 'application/json',
    'apikey': api_key
}

def find_nearest_station_id(lat:float, lon:float, max_distance:int) -> int:
    url = f"https://airapi.airly.eu/v2/installations/nearest?lat={lat}&lng={lon}&maxDistanceKM={max_distance}"
    nearest_station = requests.get(url, headers=headers)
    nearest_station_data = nearest_station.json()
    #print(json.dumps(nearest_station_json, indent=2)) # Makes the returned data easier to read
    for station_id in nearest_station_data:
        return(station_id["id"])

station_id = find_nearest_station_id(50.5082, 19.4148, 5)    

def get_air_quality_data(station_id:int) -> dict:
    url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
    request_air_quality_data = requests.get(url, headers=headers)
    air_quality_data = request_air_quality_data.json()
    #print(json.dumps(air_quality_data, indent=2))
    return air_quality_data


meterological_data = get_air_quality_data(station_id)


def get_pm25_value(meterological_data) -> float:
    for value in meterological_data.values():
        for item in value["values"]:
            if item["name"] == "PM25":
                return item["value"]
            
def get_temperature(meterological_data) -> float:
    for value in meterological_data.values():
        for item in value["values"]:
            if item["name"] == "TEMPERATURE":
                return item["value"]
            
def translate_pm25(pm25_result: float) -> str:
    if pm25_result >= 150:
        return "Extremely Poor"
    elif pm25_result >= 100:
        return "Very Poor"
    elif pm25_result >= 50:
        return "Poor"
    elif pm25_result >= 40:
        return "Medium"
    elif pm25_result >= 20:
        return "Good"
    elif pm25_result >= 0:
        return "Very Good"
    else:
        return "Incorrect pm25 level"

pm25_result = get_pm25_value(meterological_data)
temp_result = get_temperature(meterological_data)



# print(result)

#def measure_data 
