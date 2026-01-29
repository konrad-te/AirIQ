import requests
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("airly_api")

headers = {
    'Accept': 'application/json',
    'apikey': api_key
}
50.50829350719181, 19.414849479879827


lat = 50.5082
lon = 19.4144
max_distance = 1 
installation_id = 2464


url_inst = f"https://airapi.airly.eu/v2/installations/nearest?lat={lat}&lng={lon}&maxDistanceKM={max_distance}"
url_meas = f"https://airapi.airly.eu/v2/measurements/installation?installationId={installation_id}"


nearest_installation = requests.get(url_inst, headers=headers)
measure = requests.get(url_meas, headers=headers)

nearest_installation_data = nearest_installation.json()
measure_data = measure.json()

#print(nearest_installation_data)
#print(measure_data)


def find_nearest_station_id(lat=int, lon=int, max_distance=int):
    url_inst = f"https://airapi.airly.eu/v2/installations/nearest?lat={lat}&lng={lon}&maxDistanceKM={max_distance}"
    nearest_station = requests.get(url_inst, headers=headers)
    nearest_station_json = nearest_station.json()
    #print(json.dumps(nearest_station_json, indent=2))
    for item in nearest_station_json:
        return(item["id"])
    #return json.dumps(nearest_station_json, indent=2)