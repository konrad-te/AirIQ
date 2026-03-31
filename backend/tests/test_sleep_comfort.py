from __future__ import annotations

import unittest
from datetime import UTC, datetime

from backend.schemas.suggestions import VentilationContext
from backend.services.sleep_comfort import evaluate_sleep_temperature


class SleepComfortRecommendationTests(unittest.TestCase):
    def test_warm_sleep_window_creates_recommendation(self) -> None:
        outdoor_data = {
            "forecast": [
                {"time": "2026-01-10T21:00:00Z", "temperature_c": 23},
                {"time": "2026-01-11T00:00:00Z", "temperature_c": 24},
                {"time": "2026-01-11T03:00:00Z", "temperature_c": 22},
            ]
        }

        suggestion = evaluate_sleep_temperature(
            outdoor_data=outdoor_data,
            context=VentilationContext(indoor_temperature_c=22),
            ideal_min=16,
            ideal_max=20,
            now_utc=datetime(2026, 1, 10, 19, 0, tzinfo=UTC),
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "sleep_temp_too_warm")
        self.assertEqual(suggestion.priority, "medium")
        self.assertIn("bedroom is around 22", suggestion.recommendation.lower())
        self.assertIn("ideal sleep range is about 16°c-20°c", suggestion.recommendation.lower())
        self.assertIn("outdoor temperatures are expected to stay", suggestion.recommendation.lower())
        self.assertIn("too warm tonight", suggestion.recommendation)
        self.assertIn("sleep comfort", suggestion.impact or "")

    def test_comfortable_bedroom_but_cold_overnight_creates_recommendation(self) -> None:
        outdoor_data = {
            "forecast": [
                {"time": "2026-01-10T21:00:00Z", "temperature_c": 6},
                {"time": "2026-01-11T00:00:00Z", "temperature_c": 4},
                {"time": "2026-01-11T03:00:00Z", "temperature_c": 3},
            ]
        }

        suggestion = evaluate_sleep_temperature(
            outdoor_data=outdoor_data,
            context=VentilationContext(indoor_temperature_c=19),
            ideal_min=16,
            ideal_max=20,
            now_utc=datetime(2026, 1, 10, 19, 0, tzinfo=UTC),
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "sleep_temp_too_cold")
        self.assertIn("bedroom is around 19", suggestion.recommendation.lower())
        self.assertIn("ideal sleep range is about 16°c-20°c", suggestion.recommendation.lower())
        self.assertIn("outdoor temperatures are expected to drop", suggestion.recommendation.lower())
        self.assertIn("too cold tonight", suggestion.recommendation)

    def test_in_range_sleep_window_returns_none(self) -> None:
        outdoor_data = {
            "forecast": [
                {"time": "2026-01-10T21:00:00Z", "temperature_c": 18},
                {"time": "2026-01-11T00:00:00Z", "temperature_c": 19},
            ]
        }

        suggestion = evaluate_sleep_temperature(
            outdoor_data=outdoor_data,
            context=VentilationContext(),
            ideal_min=16,
            ideal_max=20,
            now_utc=datetime(2026, 1, 10, 19, 0, tzinfo=UTC),
        )

        self.assertIsNone(suggestion)

    def test_sleep_recommendation_is_hidden_before_evening(self) -> None:
        outdoor_data = {
            "forecast": [
                {"time": "2026-01-10T21:00:00Z", "temperature_c": 6},
                {"time": "2026-01-11T00:00:00Z", "temperature_c": 4},
                {"time": "2026-01-11T03:00:00Z", "temperature_c": 3},
            ]
        }

        suggestion = evaluate_sleep_temperature(
            outdoor_data=outdoor_data,
            context=VentilationContext(indoor_temperature_c=19),
            ideal_min=16,
            ideal_max=20,
            now_utc=datetime(2026, 1, 10, 9, 18, tzinfo=UTC),
        )

        self.assertIsNone(suggestion)

    def test_sleep_recommendation_can_ignore_time_window_for_preview(self) -> None:
        outdoor_data = {
            "forecast": [
                {"time": "2026-01-10T21:00:00Z", "temperature_c": 6},
                {"time": "2026-01-11T00:00:00Z", "temperature_c": 4},
                {"time": "2026-01-11T03:00:00Z", "temperature_c": 3},
            ]
        }

        suggestion = evaluate_sleep_temperature(
            outdoor_data=outdoor_data,
            context=VentilationContext(indoor_temperature_c=19),
            ideal_min=16,
            ideal_max=20,
            now_utc=datetime(2026, 1, 10, 9, 18, tzinfo=UTC),
            respect_time_window=False,
        )

        self.assertIsNotNone(suggestion)


if __name__ == "__main__":
    unittest.main()
