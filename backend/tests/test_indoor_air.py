from __future__ import annotations

import unittest

from backend.schemas.suggestions import VentilationContext
from backend.services.indoor_air import (
    evaluate_high_indoor_pm25,
    evaluate_low_indoor_humidity,
)


class IndoorAirRecommendationTests(unittest.TestCase):
    def test_high_indoor_pm25_creates_high_priority_warning(self) -> None:
        suggestion = evaluate_high_indoor_pm25(
            VentilationContext(indoor_pm25=42, outdoor_pm25=12),
            threshold=25,
            has_ventilation_recommendation=False,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "indoor_pm25_high")
        self.assertEqual(suggestion.priority, "high")
        self.assertIn("Indoor PM2.5 is high", suggestion.recommendation)
        self.assertIn("airways", suggestion.impact or "")

    def test_high_indoor_pm25_avoids_ventilation_copy_if_other_card_exists(self) -> None:
        suggestion = evaluate_high_indoor_pm25(
            VentilationContext(indoor_pm25=42, outdoor_pm25=10),
            threshold=25,
            has_ventilation_recommendation=True,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertNotIn("airing-out may help", suggestion.recommendation)

    def test_low_humidity_below_30_high_outdoor_suggests_airing(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=24, outdoor_humidity_pct=65),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(suggestion.severity, "warning")
        self.assertIn("window", suggestion.recommendation)
        self.assertIn("65%", suggestion.recommendation)
        self.assertIn("Humid outdoors", suggestion.reasons)

    def test_low_humidity_below_30_dry_outdoor_suggests_humidifier(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=24, outdoor_humidity_pct=30),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.priority, "high")
        self.assertIn("humidifier", suggestion.recommendation)
        self.assertIn("airing alone won't help", suggestion.recommendation)
        self.assertIn("Dry outdoors", suggestion.reasons)

    def test_low_humidity_below_30_no_outdoor_data(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=24),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.priority, "high")
        self.assertIn("humidifier", suggestion.recommendation)

    def test_medium_humidity_high_outdoor_suggests_airing(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=35, outdoor_humidity_pct=60),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.priority, "medium")
        self.assertEqual(suggestion.severity, "caution")
        self.assertIn("window", suggestion.recommendation)
        self.assertIn("Humid outdoors", suggestion.reasons)

    def test_medium_humidity_dry_outdoor_suggests_humidifier(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=35, outdoor_humidity_pct=25),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.priority, "medium")
        self.assertIn("humidifier", suggestion.recommendation)
        self.assertIn("Dry outdoors", suggestion.reasons)

    def test_humidity_at_40_or_above_returns_none(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=40),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNone(suggestion)

    def test_low_humidity_without_ideal_min_uses_low_threshold(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=35),
            low_threshold=30,
        )

        self.assertIsNone(suggestion)

    def test_no_duplicate_reasons(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=35, outdoor_humidity_pct=60),
            low_threshold=30,
            ideal_min=40,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertNotEqual(suggestion.short_label, suggestion.reasons[0])


if __name__ == "__main__":
    unittest.main()
