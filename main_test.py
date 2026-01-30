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

# def get_air_quality_data(station_id:int) -> dict:
#     url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
#     request_air_quality_data = requests.get(url, headers=headers)
#     air_quality_data = request_air_quality_data.json()
#     #print(json.dumps(air_quality_data, indent=2))
#     return air_quality_data

def fetch_air_quality_data(station_id:int) -> dict:
    """
    Functions takes an ID of a specific station and fetches data from it.
    """
    url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()


old_data_limit = 3600 # seconds
    
def fetch_new_data(station_id:int) -> dict: 
    url = f"https://airapi.airly.eu/v2/measurements/installation?installationId={station_id}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    data["saved_timestamp"] = time.time()

    with open(f"air_data_{station_id}.json", "w") as f:
        json.dump(data, f)

    return data

def get_station_data(station_id:int):
    filename = f"air_data_{station_id}.json"
    if os.path.exists(filename):
        file_age = time.time() - os.path.getmtime(filename)
        if file_age < old_data_limit:
            print("Using cached data")
            with open(filename, "r") as f:
                return json.load()
        else:
            print("Data is too old, fetching new one")
    else:
        print("No file found, fetching new data")
    data = fetch_new_data(station_id)
    with open(filename, "w") as f:
        json.dump(data, f)
    return data




def get_air_quality_data(station_id:int):
    with open("fetch_air_quality_data", "r") as f:
        if f is None:
            fetch_air_quality_data()



fetch
load
get 

print(fetch_air_quality_data(2464))