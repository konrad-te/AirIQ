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

def find_nearest_station_id(lat=int, lon=int, max_distance=int):
    url = f"https://airapi.airly.eu/v2/installations/nearest?lat={lat}&lng={lon}&maxDistanceKM={max_distance}"
    nearest_station = requests.get(url, headers=headers)
    nearest_station_data = nearest_station.json()
    #print(json.dumps(nearest_station_json, indent=2)) # Makes the returned data easier to read
    for station_id in nearest_station_data:
        return(station_id["id"])

station_id = find_nearest_station_id(50.5082, 19.4148, 5)    

def get_air_quality_data(station_id=int):
    url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
    request_air_quality_data = requests.get(url, headers=headers)
    air_quality_data = request_air_quality_data.json()
    print(json.dumps(air_quality_data, indent=2))


get_air_quality_data(station_id)




# print(result)

#def measure_data 
