from __future__ import annotations

import unittest

from backend.schemas.suggestions import VentilationContext
from backend.services.outdoor_activity import evaluate_outdoor_activity


class EvaluateOutdoorActivityTests(unittest.TestCase):
    def test_clean_air_and_low_uv_is_good(self) -> None:
        suggestion = evaluate_outdoor_activity(
            VentilationContext(
                outdoor_pm25=8,
                outdoor_pm10=14,
                outdoor_uv_index=1,
            )
        )

        self.assertEqual(suggestion.id, "outdoor_activity")
        self.assertEqual(suggestion.severity, "good")
        self.assertEqual(suggestion.title, "Great time for outdoor activity")
        self.assertIn("Air looks clean", suggestion.reasons)
        self.assertIsNone(suggestion.note)

    def test_caution_air_with_high_uv_adds_uv_note(self) -> None:
        suggestion = evaluate_outdoor_activity(
            VentilationContext(
                outdoor_pm25=30,
                outdoor_pm10=40,
                outdoor_uv_index=7,
            )
        )

        self.assertEqual(suggestion.severity, "caution")
        self.assertEqual(suggestion.priority, "medium")
        self.assertIn("PM2.5 elevated", suggestion.reasons)
        self.assertIn("UV high", suggestion.reasons)
        self.assertIsNotNone(suggestion.note)
        assert suggestion.note is not None
        self.assertIn("UV is high right now", suggestion.note)

    def test_poor_air_keeps_main_warning_even_with_extreme_uv(self) -> None:
        suggestion = evaluate_outdoor_activity(
            VentilationContext(
                outdoor_pm25=60,
                outdoor_pm10=90,
                outdoor_uv_index=12,
            )
        )

        self.assertEqual(suggestion.severity, "danger")
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(suggestion.title, "Better to avoid outdoor exercise now")
        self.assertIsNotNone(suggestion.note)
        assert suggestion.note is not None
        self.assertIn("UV is extreme right now", suggestion.note)

    def test_uv_only_still_returns_activity_guidance(self) -> None:
        suggestion = evaluate_outdoor_activity(
            VentilationContext(
                outdoor_uv_index=9,
                outdoor_temperature_c=30,
            )
        )

        self.assertEqual(suggestion.id, "outdoor_activity_uv_only")
        self.assertEqual(suggestion.severity, "warning")
        self.assertIn("Air data unavailable", suggestion.reasons)
        self.assertIsNotNone(suggestion.note)
        assert suggestion.note is not None
        self.assertIn("UV is very high right now", suggestion.note)
        self.assertIn("hot outside", suggestion.note)

    def test_missing_everything_returns_fallback(self) -> None:
        suggestion = evaluate_outdoor_activity(VentilationContext())

        self.assertEqual(suggestion.id, "outdoor_activity_missing")
        self.assertIsNone(suggestion.severity)
        self.assertEqual(suggestion.title, "Not enough outdoor data")
        self.assertEqual(suggestion.reasons, ["Waiting for outdoor data"])


if __name__ == "__main__":
    unittest.main()
