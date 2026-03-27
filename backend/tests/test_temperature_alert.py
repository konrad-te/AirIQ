from __future__ import annotations

import unittest

from backend.schemas.suggestions import VentilationContext
from backend.services.temperature_alert import (
    evaluate_indoor_temperature,
    evaluate_outdoor_temperature,
)


class EvaluateOutdoorTemperatureTests(unittest.TestCase):
    def test_missing_temperature_returns_none(self) -> None:
        self.assertIsNone(evaluate_outdoor_temperature(VentilationContext()))

    def test_hot_temperature_returns_medium_caution(self) -> None:
        suggestion = evaluate_outdoor_temperature(
            VentilationContext(outdoor_temperature_c=29)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "outdoor_temp_too_hot")
        self.assertEqual(suggestion.priority, "medium")
        self.assertEqual(suggestion.severity, "caution")
        self.assertIn("water", suggestion.recommendation.lower())
        self.assertIn("dehydration", (suggestion.impact or "").lower())

    def test_very_hot_temperature_returns_high_warning(self) -> None:
        suggestion = evaluate_outdoor_temperature(
            VentilationContext(outdoor_temperature_c=34)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "outdoor_temp_too_hot")
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(suggestion.severity, "warning")
        self.assertIn("shade", suggestion.recommendation.lower())

    def test_cold_temperature_returns_medium_caution(self) -> None:
        suggestion = evaluate_outdoor_temperature(
            VentilationContext(outdoor_temperature_c=-6)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "outdoor_temp_too_cold")
        self.assertEqual(suggestion.priority, "medium")
        self.assertEqual(suggestion.severity, "caution")
        self.assertIn("extra layer", suggestion.recommendation.lower())

    def test_very_cold_temperature_returns_high_warning(self) -> None:
        suggestion = evaluate_outdoor_temperature(
            VentilationContext(outdoor_temperature_c=-12)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "outdoor_temp_too_cold")
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(suggestion.severity, "warning")
        self.assertIn("warm layers", suggestion.recommendation.lower())


class EvaluateIndoorTemperatureTests(unittest.TestCase):
    def test_missing_temperature_returns_none(self) -> None:
        self.assertIsNone(evaluate_indoor_temperature(VentilationContext()))

    def test_warm_room_returns_medium_caution(self) -> None:
        suggestion = evaluate_indoor_temperature(
            VentilationContext(indoor_temperature_c=27)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "indoor_temp_too_hot")
        self.assertEqual(suggestion.priority, "medium")
        self.assertEqual(suggestion.severity, "caution")
        self.assertIn("comfort", (suggestion.impact or "").lower())

    def test_very_hot_room_returns_high_warning(self) -> None:
        suggestion = evaluate_indoor_temperature(
            VentilationContext(indoor_temperature_c=40)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "indoor_temp_too_hot")
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(suggestion.severity, "warning")
        self.assertIn("cool it down", suggestion.recommendation.lower())

    def test_cool_room_returns_medium_caution(self) -> None:
        suggestion = evaluate_indoor_temperature(
            VentilationContext(indoor_temperature_c=15)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "indoor_temp_too_cold")
        self.assertEqual(suggestion.priority, "medium")
        self.assertEqual(suggestion.severity, "caution")

    def test_very_cold_room_returns_high_warning(self) -> None:
        suggestion = evaluate_indoor_temperature(
            VentilationContext(indoor_temperature_c=10)
        )

        assert suggestion is not None
        self.assertEqual(suggestion.id, "indoor_temp_too_cold")
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(suggestion.severity, "warning")


if __name__ == "__main__":
    unittest.main()
