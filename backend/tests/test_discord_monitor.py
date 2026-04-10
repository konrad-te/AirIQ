from __future__ import annotations

import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.services.discord_monitor import build_status_embed


class DiscordMonitorTests(unittest.TestCase):
    def test_build_status_embed_includes_storage_field(self) -> None:
        db = Mock()
        db.execute.side_effect = [
            SimpleNamespace(scalar_one=lambda: 5),
            SimpleNamespace(scalar_one=lambda: 2),
            SimpleNamespace(scalar_one=lambda: 100),
            SimpleNamespace(scalar_one=lambda: 80),
            SimpleNamespace(scalar_one=lambda: 20),
            SimpleNamespace(scalar_one=lambda: 12),
            SimpleNamespace(scalar_one=lambda: 3),
            SimpleNamespace(scalar_one=lambda: 7),
            SimpleNamespace(scalar_one=lambda: 4),
            SimpleNamespace(first=lambda: (
                SimpleNamespace(
                    status="success",
                    success_count=80,
                    total_points=100,
                    started_at=datetime(2026, 4, 10, 10, 0, tzinfo=UTC),
                ),
                SimpleNamespace(provider_code="openmeteo"),
            )),
            SimpleNamespace(scalar_one=lambda: 536870912),
        ]

        with patch(
            "backend.services.discord_monitor._get_disk_usage_snapshot",
            return_value={"total": 10737418240, "used": 4294967296, "free": 6442450944},
        ):
            embed = build_status_embed(db)

        storage_field = next(field for field in embed["fields"] if field["name"] == "Storage")
        self.assertIn("EC2 disk free", storage_field["value"])
        self.assertIn("DB size", storage_field["value"])
        self.assertIn("6.0 GB", storage_field["value"])
        self.assertIn("512.0 MB", storage_field["value"])


if __name__ == "__main__":
    unittest.main()
