from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

import requests

from backend.main import enrich_with_weather_if_missing, fetch_openmeteo_weather


class OpenMeteoWeatherTests(unittest.TestCase):
    def test_fetch_openmeteo_weather_retries_and_requests_ms_wind_unit(self) -> None:
        success_response = Mock()
        success_response.raise_for_status.return_value = None
        success_response.json.return_value = {
            "current": {
                "time": "2026-04-07T10:00",
                "temperature_2m": 12.5,
                "apparent_temperature": 11.7,
                "relative_humidity_2m": 61,
                "cloud_cover": 40,
                "pressure_msl": 1012.1,
                "weather_code": 3,
                "is_day": 1,
                "uv_index": 2.3,
                "rain": 0.0,
                "wind_speed_10m": 4.2,
                "wind_direction_10m": 205,
            },
            "hourly": {
                "time": ["2026-04-07T10:00"],
                "temperature_2m": [12.5],
                "apparent_temperature": [11.7],
                "relative_humidity_2m": [61],
                "cloud_cover": [40],
                "pressure_msl": [1012.1],
                "weather_code": [3],
                "is_day": [1],
                "uv_index": [2.3],
                "rain": [0.0],
                "wind_speed_10m": [4.2],
                "wind_direction_10m": [205],
            },
        }

        with patch(
            "backend.main._http_get",
            side_effect=[requests.exceptions.ReadTimeout("first try"), success_response],
        ) as http_get_mock, patch("backend.main.time.sleep") as sleep_mock:
            payload = fetch_openmeteo_weather(59.325, 18.071)

        self.assertEqual(http_get_mock.call_count, 2)
        first_call = http_get_mock.call_args_list[0]
        second_call = http_get_mock.call_args_list[1]
        self.assertEqual(first_call.kwargs["timeout"], 12)
        self.assertEqual(second_call.kwargs["timeout"], 20)
        self.assertEqual(first_call.kwargs["params"]["wind_speed_unit"], "ms")
        sleep_mock.assert_called_once_with(0.5)
        self.assertEqual(payload["current"]["wind_speed_ms"], 4.2)

    def test_enrich_with_weather_if_missing_records_unavailable_metadata_on_failure(self) -> None:
        normalized = {
            "current": {
                "pm25": 8.0,
                "pm10": 14.0,
                "temperature_c": None,
                "apparent_temperature_c": None,
                "humidity_pct": None,
                "cloud_cover_pct": None,
                "pressure_hpa": None,
                "wind_speed_ms": None,
                "wind_direction_deg": None,
                "weather_code": None,
                "is_day": None,
                "uv_index": None,
                "rain_mm": None,
            },
            "history": [],
            "forecast": [],
            "meta": {
                "timezone": "UTC",
            },
            "measurement_window": {
                "from": "2026-04-07T10:00:00Z",
                "to": "2026-04-07T10:00:00Z",
            },
            "source": {
                "provider": "airly",
                "method": "point",
            },
        }

        with patch("backend.main._read_provider_cache", return_value=None), patch(
            "backend.main.fetch_openmeteo_weather",
            side_effect=requests.exceptions.ReadTimeout("weather timeout"),
        ):
            enriched = enrich_with_weather_if_missing(Mock(), 59.325, 18.071, normalized)

        weather_source = enriched["meta"]["weather_source"]
        self.assertFalse(weather_source["available"])
        self.assertEqual(weather_source["provider"], "open-meteo")
        self.assertIn("unavailable", weather_source["message"].lower())
        self.assertIn("weather timeout", weather_source["error"].lower())


if __name__ == "__main__":
    unittest.main()
