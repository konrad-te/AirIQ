from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException, Response

from backend.app import get_home_suggestions


class HomeSuggestionsTests(unittest.TestCase):
    def test_home_suggestions_skips_qingping_when_temporarily_unavailable(self) -> None:
        response = Response()
        request = Mock()
        current_user = SimpleNamespace(id=123)
        db = Mock()
        settings = {"mode": "test"}
        outdoor_data = {"aqi": 11}
        expected_payload = {"suggestions": []}

        with patch("backend.app.get_air_quality_data", return_value=outdoor_data), patch(
            "backend.app.get_recommendation_config", return_value=settings
        ), patch(
            "backend.app.get_qingping_latest_reading",
            side_effect=HTTPException(status_code=503, detail="Qingping unavailable"),
        ), patch(
            "backend.app._build_dashboard_suggestions_payload",
            return_value=expected_payload,
        ) as build_mock, patch("backend.app.logger") as logger_mock:
            payload = get_home_suggestions.__wrapped__(
                request=request,
                response=response,
                lat=50.5,
                lon=19.4,
                current_user=current_user,
                db=db,
            )

        self.assertEqual(payload, expected_payload)
        build_mock.assert_called_once_with(
            settings=settings,
            outdoor_data=outdoor_data,
            indoor_data=None,
        )
        logger_mock.warning.assert_called_once()


if __name__ == "__main__":
    unittest.main()
