from __future__ import annotations

import unittest

from backend.services.sleep_insights import _analyze_sleep_patterns, _build_findings


class SleepInsightRuleTests(unittest.TestCase):
    def test_sleep_findings_flag_long_sleep_and_stage_imbalance(self) -> None:
        sleep = {
            "sleep_duration_minutes": 604,
            "sleep_deep_minutes": 42,
            "sleep_light_minutes": 358,
            "sleep_rem_minutes": 204,
            "sleep_awake_minutes": 0,
        }
        baseline = {
            "night_count": 5,
            "average_duration_minutes": 485,
            "average_deep_pct": 16.5,
            "average_light_pct": 51.0,
            "average_rem_pct": 22.0,
            "average_awake_pct": 10.5,
        }
        sleep_analysis = _analyze_sleep_patterns(sleep, baseline)

        findings = _build_findings(
            sleep,
            sleep_analysis,
            {
                "available": True,
                "sample_count": 24,
                "coverage_ratio": 0.9,
                "average_temperature_c": 19.2,
                "average_humidity_pct": 34.3,
                "average_pm25_ug_m3": 15.9,
                "max_pm25_ug_m3": 20.1,
                "max_co2_ppm": 995,
                "minutes_over_1000_co2": 0,
                "minutes_over_1400_co2": 0,
            },
            {"available": False, "source_label": "Outdoor history is unavailable."},
            {"had_recent_workout": False},
        )

        finding_codes = {finding["code"] for finding in findings}
        self.assertIn("sleep_duration_outside_target", finding_codes)
        self.assertIn("deep_sleep_low", finding_codes)
        self.assertIn("rem_sleep_high", finding_codes)

    def test_sleep_findings_still_work_without_indoor_data(self) -> None:
        sleep = {
            "sleep_duration_minutes": 310,
            "sleep_deep_minutes": 30,
            "sleep_light_minutes": 170,
            "sleep_rem_minutes": 60,
            "sleep_awake_minutes": 50,
        }
        sleep_analysis = _analyze_sleep_patterns(
            sleep,
            {
                "night_count": 0,
                "average_duration_minutes": None,
                "average_deep_pct": None,
                "average_light_pct": None,
                "average_rem_pct": None,
                "average_awake_pct": None,
            },
        )

        findings = _build_findings(
            sleep,
            sleep_analysis,
            {"available": False, "sample_count": 0, "coverage_ratio": None},
            {"available": False, "source_label": "Outdoor history is unavailable."},
            {"had_recent_workout": False},
        )

        finding_codes = {finding["code"] for finding in findings}
        self.assertIn("indoor_data_missing", finding_codes)
        self.assertIn("sleep_duration_outside_target", finding_codes)


if __name__ == "__main__":
    unittest.main()
