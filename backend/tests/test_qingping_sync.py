from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from backend.routers.integrations import (
    _persist_indoor_sensor_reading,
    _refresh_qingping_token_if_needed,
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

    def test_refresh_qingping_token_returns_503_when_field_encryption_key_is_missing(self) -> None:
        integration = SimpleNamespace(
            app_key="plain-app-key",
            app_secret="plain-app-secret",
            access_token="",
            token_expires_at=None,
        )
        db = Mock()

        with patch.dict(os.environ, {}, clear=True), patch(
            "backend.routers.integrations.exchange_qingping_token",
            return_value={"access_token": "fresh-token", "expires_in": 3600},
        ):
            with self.assertRaises(HTTPException) as context:
                _refresh_qingping_token_if_needed(db=db, integration=integration)

        self.assertEqual(context.exception.status_code, 503)
        self.assertIn("FIELD_ENCRYPTION_KEY", str(context.exception.detail))

    def test_persist_indoor_sensor_reading_recovers_from_duplicate_insert(self) -> None:
        normalized = SimpleNamespace(
            updated_at="2026-04-10T09:00:00Z",
            temperature_c=23.4,
            humidity_pct=58.6,
            pm2_5_ug_m3=25.0,
            pm10_ug_m3=25.0,
            co2_ppm=1427.0,
            battery_pct=100.0,
            device_name="Qing",
            product_name="Qingping Lite",
            serial_number="abc",
            wifi_mac="CCB5D132B127",
        )
        integration = SimpleNamespace(selected_device_id="CCB5D132B127")
        existing = SimpleNamespace(
            temperature_c=None,
            humidity_pct=None,
            pm25_ug_m3=None,
            pm10_ug_m3=None,
            co2_ppm=None,
            battery_pct=None,
            raw_payload_json=None,
        )
        db = Mock()
        db.execute.return_value.scalars.return_value.first.side_effect = [None, existing]
        db.commit.side_effect = [
            IntegrityError("insert", {}, Exception("duplicate")),
            None,
        ]

        _persist_indoor_sensor_reading(
            db=db,
            user_id=15,
            integration=integration,
            normalized=normalized,
            raw_payload={"sample": True},
        )

        self.assertEqual(db.commit.call_count, 2)
        db.rollback.assert_called_once()
        self.assertEqual(existing.temperature_c, 23.4)
        self.assertEqual(existing.humidity_pct, 58.6)
        self.assertEqual(existing.pm25_ug_m3, 25.0)
        self.assertEqual(existing.raw_payload_json, {"sample": True})

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
        self.assertEqual(db.rollback.call_count, 2)
        logger_mock.warning.assert_called_once()
        logger_mock.exception.assert_called_once()


if __name__ == "__main__":
    unittest.main()
