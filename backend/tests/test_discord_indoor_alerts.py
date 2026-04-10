from __future__ import annotations

import unittest

from backend.services.discord_indoor_alerts import (
    _format_message,
    _matching_indoor_air_suggestions,
)


class DiscordIndoorAlertsTests(unittest.TestCase):
    def test_matching_indoor_air_suggestions_defaults_to_high_priority_only(self) -> None:
        suggestions = [
            {"id": "vent_hot", "family": "ventilation", "priority": "high"},
            {"id": "temp_hot", "family": "temperature", "priority": "medium"},
            {"id": "pm_caution", "family": "indoor_air", "priority": "medium"},
        ]

        matched = _matching_indoor_air_suggestions(suggestions)

        self.assertEqual([item["id"] for item in matched], ["vent_hot"])

    def test_matching_indoor_air_suggestions_can_include_medium_priority(self) -> None:
        suggestions = [
            {"id": "vent_hot", "family": "ventilation", "priority": "high"},
            {"id": "pm_caution", "family": "indoor_air", "priority": "medium"},
            {"id": "indoor_temp_too_hot", "priority": "medium"},
            {"id": "other_medium", "family": "other", "priority": "medium"},
        ]

        matched = _matching_indoor_air_suggestions(
            suggestions,
            include_medium_priority=True,
        )

        self.assertEqual(
            [item["id"] for item in matched],
            ["vent_hot", "pm_caution", "indoor_temp_too_hot"],
        )

    def test_format_message_mentions_medium_priority_when_enabled(self) -> None:
        body = _format_message(
            [{"title": "Ventilate", "recommendation": "Open windows for 10 minutes."}],
            include_medium_priority=True,
        )

        self.assertIn("high + medium priority", body)


if __name__ == "__main__":
    unittest.main()
