from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.services.discord_monitor import build_status_embed


class DiscordMonitorTests(unittest.TestCase):
    def test_build_status_embed_includes_storage_and_feedback_fields(self) -> None:
        db = Mock()
        db.execute.side_effect = [
            SimpleNamespace(scalar_one=lambda: 5),
            SimpleNamespace(scalar_one=lambda: 2),
            SimpleNamespace(scalar_one=lambda: 100),
            SimpleNamespace(scalar_one=lambda: 80),
            SimpleNamespace(scalar_one=lambda: 20),
            SimpleNamespace(scalar_one=lambda: 3),
            SimpleNamespace(scalar_one=lambda: 4),
            SimpleNamespace(scalar_one=lambda: 7),
            SimpleNamespace(scalar_one=lambda: 4),
            SimpleNamespace(scalar_one=lambda: 536870912),
        ]

        with patch(
            "backend.services.discord_monitor._get_disk_usage_snapshot",
            return_value={"total": 10737418240, "used": 4294967296, "free": 6442450944},
        ):
            embed = build_status_embed(db)

        storage_field = next(field for field in embed["fields"] if field["name"] == "Storage")
        feedback_field = next(field for field in embed["fields"] if field["name"] == "Feedback Inbox")

        self.assertEqual(embed["title"], "AirIQ - Server Status")
        self.assertIn("Server disk free", storage_field["value"])
        self.assertIn("Database used", storage_field["value"])
        self.assertIn("6.0 GB", storage_field["value"])
        self.assertIn("512.0 MB", storage_field["value"])
        self.assertIn("Product feedback: **3** total | **4** unread", feedback_field["value"])
        self.assertIn("Suggestion feedback: **7** total | **4** unreviewed", feedback_field["value"])


if __name__ == "__main__":
    unittest.main()
