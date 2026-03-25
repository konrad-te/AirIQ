from __future__ import annotations

import unittest

from backend.schemas.suggestions import VentilationContext
from backend.services.ventilation import evaluate_ventilation


class EvaluateVentilationTests(unittest.TestCase):
    def test_outdoor_bad_and_indoor_co2_high(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=35,
                outdoor_pm10=50,
                indoor_co2_ppm=1100,
            )
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "improve_air_without_ventilation")
        self.assertEqual(suggestion.priority, "high")
        self.assertIn("Indoor CO2 is elevated", suggestion.secondary_reasons[0])
        self.assertEqual(
            suggestion.based_on,
            ["outdoor_pm25", "outdoor_pm10", "indoor_co2_ppm"],
        )

    def test_outdoor_bad_and_indoor_okay(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=24,
                outdoor_pm10=36,
                indoor_co2_ppm=650,
                indoor_pm25=8,
                indoor_pm10=12,
            )
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "keep_windows_closed")
        self.assertEqual(suggestion.secondary_reasons, [])
        self.assertEqual(
            suggestion.based_on,
            [
                "outdoor_pm25",
                "outdoor_pm10",
                "indoor_co2_ppm",
                "indoor_pm25",
                "indoor_pm10",
            ],
        )

    def test_outdoor_good_and_indoor_co2_high(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=8,
                outdoor_pm10=14,
                indoor_co2_ppm=950,
            )
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "open_windows_now")
        self.assertIsNone(suggestion.note)
        self.assertIn(
            "ventilation would help refresh the room",
            suggestion.secondary_reasons[0],
        )

    def test_outdoor_acceptable_and_indoor_co2_high(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=18,
                outdoor_pm10=30,
                indoor_co2_ppm=950,
            )
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "ventilate_briefly")
        self.assertEqual(suggestion.priority, "high")
        self.assertEqual(
            suggestion.advice,
            "A short airing-out is safer here than leaving windows open for long.",
        )
        self.assertIn(
            "ventilation would help refresh the room",
            suggestion.secondary_reasons[0],
        )

    def test_outdoor_acceptable_and_indoor_slightly_stale(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=18,
                outdoor_pm10=30,
                indoor_co2_ppm=780,
            )
        )

        self.assertIsNotNone(suggestion)
        assert suggestion is not None
        self.assertEqual(suggestion.id, "ventilate_soon")
        self.assertEqual(suggestion.priority, "medium")
        self.assertEqual(suggestion.secondary_reasons, ["CO2 is slightly elevated."])

    def test_everything_okay(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=9,
                outdoor_pm10=16,
                indoor_co2_ppm=620,
                indoor_pm25=7,
                indoor_pm10=11,
            )
        )

        self.assertIsNone(suggestion)

    def test_missing_outdoor_data(self) -> None:
        suggestion = evaluate_ventilation(
            VentilationContext(
                outdoor_pm25=None,
                outdoor_pm10=18,
                indoor_co2_ppm=950,
            )
        )

        self.assertIsNone(suggestion)


if __name__ == "__main__":
    unittest.main()
