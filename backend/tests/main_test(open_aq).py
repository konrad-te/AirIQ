import requests
import json
from dotenv import load_dotenv
import os
import time 

load_dotenv()

api_key = os.getenv("airly_api")
api_key_2 = os.getenv("open_aq")

headers = {
    'Accept': 'application/json',
    'apikey': api_key
}

headers2= {"X-API-Key": api_key_2}

old_data_limit = 1
10185

def find_air_quality_station(lat, lon) -> dict:
    url2 = f"https://api.openaq.org/v3/locations?coordinates={lat},{lon}&radius=10000"
    response = requests.get(url2, headers = headers2)
    response.raise_for_status()
    return response.json()

air_quality_station = find_air_quality_station(50.5082, 19.4148)
print(json.dumps(air_quality_station, indent=2))

def fetch_air_quality_data(station_id:int) -> dict:
    if station_id is not int:
        print("Incorrect API key")
    url = f"https://api.openaq.org/v3/locations/{station_id}/latest"
    request_air_quality_data = requests.get(url, headers=headers2)
    request_air_quality_data.raise_for_status()
    air_quality_data = request_air_quality_data.json()
    return air_quality_data


def get_air_quality_data(station_id:int):
    filename = f"air_data_{station_id}.json"
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


