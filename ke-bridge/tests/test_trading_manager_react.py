"""Unit tests for the new reactive price-forecast path:
- `trading_manager._points_from_tou_price_rows` (pure N3 parsing, shared by
  the ASK path and the new REACT handler).
- `KEBridge.handle_incoming_tou_price_react` de-dupe logic (no live KE/Taimu
  needed - the Taimu/publish pipeline itself is monkeypatched out).

Run with:
    cd ke-bridge
    python -m unittest tests.test_trading_manager_react -v
"""

import os
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.interactions.trading_manager import _points_from_tou_price_rows  # noqa: E402
from app.ke_bridge import KEBridge  # noqa: E402


def _wait_until(predicate, timeout=2.0, interval=0.01):
    """Poll briefly for the background thread spawned by
    `handle_incoming_tou_price_react` to finish (it's a real thread, so the
    mocked call isn't necessarily visible the instant `.start()` returns)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


class PointsFromTouPriceRowsTests(unittest.TestCase):
    def test_parses_ts_and_value(self):
        rows = [
            {
                "tou_uri": "<http://test-market-producer.bluebird.com/tou/test-1>",
                "ts": '"2026-11-01T00:00:00+00:00"^^<http://www.w3.org/2001/XMLSchema#dateTime>',
                "value": '"55.2"^^<http://www.w3.org/2001/XMLSchema#double>',
            },
            {
                "tou_uri": "<http://test-market-producer.bluebird.com/tou/test-1>",
                "ts": '"2026-11-01T00:15:00+00:00"^^<http://www.w3.org/2001/XMLSchema#dateTime>',
                "value": '"-14.96"^^<http://www.w3.org/2001/XMLSchema#double>',
            },
        ]
        points = _points_from_tou_price_rows(rows)
        self.assertEqual(points[0]["ts"], "2026-11-01T00:00:00+00:00")
        self.assertEqual(points[0]["price"], 55.2)
        self.assertEqual(points[1]["price"], -14.96)  # negative prices preserved, not clipped

    def test_empty_rows(self):
        self.assertEqual(_points_from_tou_price_rows([]), [])


class HandleIncomingTouPriceReactTests(unittest.TestCase):
    """handle_incoming_tou_price_react() de-dupes synchronously, then runs
    the actual forecast in a background thread (real bug found by testing:
    the KE's POST/REACT exchange times out if the REACT ack is delayed by
    Taimu's ~15-25s inference) - so these tests poll briefly instead of
    asserting immediately after the call returns."""

    def _make_bridge(self):
        bridge = KEBridge()
        bridge._mode = "ke"
        return bridge

    def test_runs_forecast_for_new_tou_uri(self):
        bridge = self._make_bridge()
        prices = [{"ts": "2026-11-01T00:00:00+00:00", "price": 55.2}]
        with patch.object(bridge, "_run_forecast_from_prices") as mock_run:
            bridge.handle_incoming_tou_price_react("http://x/tou/1", prices)
            self.assertTrue(_wait_until(lambda: mock_run.called))
            _, kwargs = mock_run.call_args
            self.assertEqual(kwargs["trigger"], "react-auto")
            self.assertEqual(kwargs["price_source"], "ke-react")

    def test_skips_duplicate_tou_uri(self):
        bridge = self._make_bridge()
        prices = [{"ts": "2026-11-01T00:00:00+00:00", "price": 55.2}]
        with patch.object(bridge, "_run_forecast_from_prices") as mock_run:
            bridge.handle_incoming_tou_price_react("http://x/tou/dup", prices)
            self.assertTrue(_wait_until(lambda: mock_run.called))
            bridge.handle_incoming_tou_price_react("http://x/tou/dup", prices)  # synchronous no-op, no thread spawned
            mock_run.assert_called_once()  # second call never reaches _run_forecast_from_prices

    def test_skips_empty_prices(self):
        bridge = self._make_bridge()
        with patch.object(bridge, "_run_forecast_from_prices") as mock_run:
            bridge.handle_incoming_tou_price_react("http://x/tou/empty", [])
            time.sleep(0.1)  # no thread is spawned for empty prices either way
            mock_run.assert_not_called()

    def test_forecast_failure_does_not_raise(self):
        # "No inventes predicciones si Taimu falla": the background runner
        # must swallow the error (log it) rather than crash the thread/loop.
        bridge = self._make_bridge()
        prices = [{"ts": "2026-11-01T00:00:00+00:00", "price": 55.2}]
        with patch.object(bridge, "_run_forecast_from_prices", side_effect=RuntimeError("taimu down")) as mock_run:
            bridge.handle_incoming_tou_price_react("http://x/tou/fail", prices)  # must not raise
            self.assertTrue(_wait_until(lambda: mock_run.called))


if __name__ == "__main__":
    unittest.main()
