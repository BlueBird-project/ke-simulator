"""Unit tests for the pure price-forecast transform functions (no live KE
or Taimu needed). Run with:

    cd ke-bridge
    python -m unittest tests.test_price_forecast -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.interactions.price_forecast import (  # noqa: E402
    build_price_forecast_bindings,
    prices_to_taimu_payload,
    taimu_result_to_points,
)


class PricesToTaimuPayloadTests(unittest.TestCase):
    def test_maps_ts_and_price_to_ds_and_y(self):
        prices = [
            {"ts": "2026-10-31T00:00:00+00:00", "price": 55.2},
            {"ts": "2026-10-31T00:15:00+00:00", "price": -3.1},
        ]
        payload = prices_to_taimu_payload(prices)
        # Taimu's FAST/chronos_2 pipeline fails on tz-aware timestamps (real
        # bug, reproduced directly against the API) - the offset is dropped
        # since everything here is UTC, not fabricated/guessed.
        self.assertEqual(payload["ds"], ["2026-10-31T00:00:00", "2026-10-31T00:15:00"])
        self.assertEqual(payload["y"], [55.2, -3.1])
        self.assertEqual(payload["unique_id"], ["tm-day-ahead-price", "tm-day-ahead-price"])

    def test_preserves_negative_prices(self):
        # Electricity prices can be negative - must NOT be clamped to zero
        # (that is exactly what the demo Chronos-2 config's positive_pv forge
        # does, which is why price-forecast uses a separate config).
        prices = [{"ts": "2026-10-31T03:00:00+00:00", "price": -12.5}]
        payload = prices_to_taimu_payload(prices)
        self.assertEqual(payload["y"], [-12.5])

    def test_empty_input(self):
        self.assertEqual(prices_to_taimu_payload([]), {"ds": [], "unique_id": [], "y": []})


class TaimuResultToPointsTests(unittest.TestCase):
    def test_zips_ds_and_yhat(self):
        # Taimu returns pandas-formatted, space-separated, naive timestamps.
        result = {
            "ds": ["2026-11-01 00:00:00", "2026-11-01 00:15:00"],
            "unique_id": ["a", "a"],
            "yhat": [1.0, 2.5],
        }
        points = taimu_result_to_points(result)
        self.assertEqual(
            points,
            [
                {"ds": "2026-11-01T00:00:00+00:00", "yhat": 1.0},
                {"ds": "2026-11-01T00:15:00+00:00", "yhat": 2.5},
            ],
        )

    def test_raises_on_length_mismatch(self):
        with self.assertRaises(ValueError):
            taimu_result_to_points({"ds": ["2026-11-01 00:00:00", "2026-11-01 00:15:00"], "yhat": [1.0]})

    def test_raises_on_missing_keys(self):
        with self.assertRaises(ValueError):
            taimu_result_to_points({})


class BuildPriceForecastBindingsTests(unittest.TestCase):
    def test_builds_one_binding_per_point_with_shared_forecast_uri(self):
        points = [{"ds": "2026-11-01T00:00:00", "yhat": 10.0}, {"ds": "2026-11-01T00:15:00", "yhat": 11.5}]
        bindings = build_price_forecast_bindings(
            forecast_uri="http://simulator.bluebird.com/forecast/abc123",
            points=points,
            time_create="2026-10-31T12:00:00+00:00",
        )
        self.assertEqual(len(bindings), 2)
        for binding in bindings:
            self.assertEqual(binding["forecast_uri"], "<http://simulator.bluebird.com/forecast/abc123>")
            self.assertIn("xsd:dateTime".split(":")[-1][:-1], binding["time_create"])  # has a datetime datatype suffix
        self.assertNotEqual(bindings[0]["dp"], bindings[1]["dp"])  # distinct per-point URIs
        self.assertIn('"10.0"', bindings[0]["value"])
        self.assertIn('"11.5"', bindings[1]["value"])


if __name__ == "__main__":
    unittest.main()
