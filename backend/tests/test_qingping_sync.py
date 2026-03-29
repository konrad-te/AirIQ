from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend.routers.integrations import (
    get_qingping_sync_interval_minutes,
    sync_all_qingping_integrations,
    sync_qingping_integration,
)


class QingpingSyncTests(unittest.TestCase):
    def test_get_qingping_sync_interval_minutes_defaults_to_five(self) -> None:
        previous = os.environ.pop("QINGPING_SYNC_INTERVAL_MINUTES", None)
        try:
            self.assertEqual(get_qingping_sync_interval_minutes(), 5)
        finally:
            if previous is not None:
                os.environ["QINGPING_SYNC_INTERVAL_MINUTES"] = previous

    def test_get_qingping_sync_interval_minutes_clamps_invalid_values(self) -> None:
        with patch.dict(os.environ, {"QINGPING_SYNC_INTERVAL_MINUTES": "0"}, clear=False):
            self.assertEqual(get_qingping_sync_interval_minutes(), 1)

        with patch.dict(os.environ, {"QINGPING_SYNC_INTERVAL_MINUTES": "abc"}, clear=False):
            self.assertEqual(get_qingping_sync_interval_minutes(), 5)

    def test_sync_qingping_integration_requires_selected_device(self) -> None:
        integration = SimpleNamespace(selected_device_id=None)

        with self.assertRaises(HTTPException) as context:
            sync_qingping_integration(db=Mock(), integration=integration)

        self.assertEqual(context.exception.status_code, 404)
        self.assertIn("selected", str(context.exception.detail))

    def test_sync_all_qingping_integrations_counts_successes_and_failures(self) -> None:
        integrations = [
            SimpleNamespace(id=1, user_id=10, selected_device_id="dev-1"),
            SimpleNamespace(id=2, user_id=11, selected_device_id="dev-2"),
            SimpleNamespace(id=3, user_id=12, selected_device_id="dev-3"),
        ]
        db = Mock()
        db.execute.return_value.scalars.return_value.all.return_value = integrations

        with patch(
            "backend.routers.integrations.sync_qingping_integration",
            side_effect=[
                SimpleNamespace(),
                HTTPException(status_code=502, detail="temporary failure"),
                RuntimeError("boom"),
            ],
        ) as sync_mock, patch("backend.routers.integrations.logger") as logger_mock:
            summary = sync_all_qingping_integrations(db)

        self.assertEqual(summary.attempted, 3)
        self.assertEqual(summary.synced, 1)
        self.assertEqual(summary.failed, 2)
        self.assertEqual(sync_mock.call_count, 3)
        logger_mock.warning.assert_called_once()
        logger_mock.exception.assert_called_once()


if __name__ == "__main__":
    unittest.main()
