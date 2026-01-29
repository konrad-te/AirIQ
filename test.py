from test_data import data
import json

print(json.dumps(data,indent=2))

for item in data:
    print(item["id"])