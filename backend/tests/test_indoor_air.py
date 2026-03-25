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

    def test_low_humidity_creates_warning(self) -> None:
        suggestion = evaluate_low_indoor_humidity(
            VentilationContext(indoor_humidity_pct=24),
            low_threshold=30,
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "indoor_humidity_low")
        self.assertEqual(suggestion.priority, "medium")
        self.assertIn("feel especially dry", suggestion.recommendation)
        self.assertIn("skin", suggestion.impact or "")


if __name__ == "__main__":
    unittest.main()
