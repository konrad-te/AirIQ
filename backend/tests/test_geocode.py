from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.main import geocode_address_nominatim


class GeocodeTests(unittest.TestCase):
    def test_geocode_address_nominatim_returns_cached_display_name(self) -> None:
        cached_payload = {
            "address": "Warszawa, województwo mazowieckie, Polska",
            "lat": 52.2333742,
            "lon": 21.0711489,
            "place_id": "415352587",
        }

        with patch("backend.main._read_geocode_cache_payload", return_value=cached_payload):
            result = geocode_address_nominatim("warszawa")

        self.assertEqual(result, cached_payload)


if __name__ == "__main__":
    unittest.main()
