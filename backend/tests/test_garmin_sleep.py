from __future__ import annotations

import unittest
from datetime import date

from backend.services.garmin_sleep import normalize_garmin_sleep_entry


class GarminSleepImportTests(unittest.TestCase):
    def test_normalize_garmin_sleep_entry_extracts_nightly_metrics(self) -> None:
        row = {
            "calendarDate": "2025-12-08",
            "uuid": "f490221e144d45cab8177d5b756ce0a7",
            "wellnessStartTimeGmt": "2025-12-07T17:00:00.0",
            "wellnessStartTimeLocal": "2025-12-08T00:00:00.0",
            "wellnessEndTimeGmt": "2025-12-08T17:00:00.0",
            "wellnessEndTimeLocal": "2025-12-09T00:00:00.0",
            "restingHeartRate": 41,
            "minHeartRate": 41,
            "maxHeartRate": 104,
            "allDayStress": {
                "aggregatorList": [
                    {"type": "TOTAL", "averageStressLevel": 25},
                    {
                        "type": "ASLEEP",
                        "averageStressLevel": 12,
                        "maxStressLevel": 54,
                        "totalDuration": 28620,
                    },
                ]
            },
            "bodyBattery": {
                "chargedValue": 68,
                "bodyBatteryStatList": [
                    {
                        "bodyBatteryStatType": "SLEEPSTART",
                        "statsValue": 33,
                        "statTimestamp": "2025-12-07T17:12:00.0",
                    },
                    {
                        "bodyBatteryStatType": "SLEEPEND",
                        "statsValue": 99,
                        "statTimestamp": "2025-12-08T01:11:00.0",
                    },
                ],
            },
            "respiration": {
                "avgWakingRespirationValue": 14.0,
            },
        }

        normalized = normalize_garmin_sleep_entry(row, source_file_name="sample.json")

        self.assertIsNotNone(normalized)
        assert normalized is not None
        self.assertEqual(normalized["calendar_date"], date(2025, 12, 8))
        self.assertEqual(normalized["sleep_duration_minutes"], 479)
        self.assertEqual(normalized["sleep_start_local_minutes"], 17 * 60 + 12)
        self.assertEqual(normalized["sleep_end_local_minutes"], 71)
        self.assertEqual(normalized["sleep_stress_avg"], 12.0)
        self.assertEqual(normalized["sleep_stress_max"], 54)
        self.assertEqual(normalized["body_battery_start"], 33)
        self.assertEqual(normalized["body_battery_end"], 99)
        self.assertEqual(normalized["body_battery_gain"], 66)
        self.assertEqual(normalized["resting_heart_rate"], 41)
        self.assertEqual(normalized["avg_waking_respiration"], 14.0)
        self.assertEqual(normalized["source_file_name"], "sample.json")

    def test_normalize_garmin_sleep_entry_extracts_sleep_stages(self) -> None:
        row = {
            "calendarDate": "2025-12-08",
            "sleepStartTimestampGMT": "2025-12-07T17:11:00.0",
            "sleepEndTimestampGMT": "2025-12-08T01:11:00.0",
            "sleepWindowConfirmationType": "ENHANCED_CONFIRMED_FINAL",
            "deepSleepSeconds": 3240,
            "lightSleepSeconds": 16080,
            "remSleepSeconds": 9480,
            "awakeSleepSeconds": 0,
            "unmeasurableSeconds": 0,
            "averageRespiration": 14.01,
            "lowestRespiration": 12.0,
            "highestRespiration": 19.0,
        }

        normalized = normalize_garmin_sleep_entry(row, source_file_name="sleepData.json")

        self.assertIsNotNone(normalized)
        assert normalized is not None
        self.assertEqual(normalized["calendar_date"], date(2025, 12, 8))
        self.assertEqual(normalized["sleep_duration_minutes"], 480)
        self.assertEqual(normalized["sleep_deep_minutes"], 54)
        self.assertEqual(normalized["sleep_light_minutes"], 268)
        self.assertEqual(normalized["sleep_rem_minutes"], 158)
        self.assertEqual(normalized["sleep_awake_minutes"], 0)
        self.assertEqual(normalized["sleep_window_confirmation_type"], "ENHANCED_CONFIRMED_FINAL")
        self.assertEqual(normalized["avg_sleep_respiration"], 14.01)
        self.assertEqual(normalized["lowest_sleep_respiration"], 12.0)
        self.assertEqual(normalized["highest_sleep_respiration"], 19.0)
        self.assertEqual(normalized["source_file_name"], "sleepData.json")

    def test_normalize_returns_none_without_sleep_metrics(self) -> None:
        row = {
            "calendarDate": "2026-03-15",
            "uuid": "34b112e95bbe4bf8b8f5a3ad060434b0",
            "allDayStress": {},
        }

        normalized = normalize_garmin_sleep_entry(row)
        self.assertIsNone(normalized)


if __name__ == "__main__":
    unittest.main()
