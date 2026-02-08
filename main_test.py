import requests
import json
from dotenv import load_dotenv
import os
import time 

load_dotenv()

api_key = os.getenv("airly_api")
api_key_2 = os.getenv("owm_api")

headers = {
    'Accept': 'application/json',
    'apikey': api_key
}

lat = 50.50
lon = 19.41

def fetch_weather_data() -> dict:
    url2 = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m,relative_humidity_2m,rain,wind_speed_10m,wind_direction_10m,weather_code"
    response = requests.get(url2)
    response.raise_for_status()
    return response.json()

x = fetch_weather_data()
print(x)

old_data_limit = 1

def get_weather_data():
    filename = "weather_data"
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
    data = fetch_weather_data()
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)
    return data

y = get_weather_data()
print(y)