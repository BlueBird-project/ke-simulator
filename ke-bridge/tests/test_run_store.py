"""Unit tests for the bounded, in-memory price-forecast run store."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.run_store import RunStore  # noqa: E402


class RunStoreTests(unittest.TestCase):
    def test_start_add_stage_finish_roundtrip(self):
        store = RunStore()
        store.start("abc", trigger="react-auto", data_origin="TEST")
        store.add_stage("abc", "prices_received", count=96)
        store.finish("abc", status="ok", forecast_uri="http://x/forecast/abc")

        run = store.get("abc")
        self.assertEqual(run["status"], "ok")
        self.assertEqual(run["trigger"], "react-auto")
        self.assertEqual(len(run["stages"]), 1)
        self.assertEqual(run["stages"][0]["name"], "prices_received")
        self.assertEqual(run["forecast_uri"], "http://x/forecast/abc")

    def test_update_attaches_fields_without_finishing(self):
        store = RunStore()
        store.start("abc")
        store.update("abc", prices=[{"ts": "t1", "price": 1.0, "unit": "EUR/MWh"}])
        run = store.get("abc")
        self.assertEqual(run["status"], "running")
        self.assertNotIn("completed_at", run)
        self.assertEqual(run["prices"][0]["price"], 1.0)

    def test_unknown_id_returns_none(self):
        store = RunStore()
        self.assertIsNone(store.get("does-not-exist"))

    def test_bounded_evicts_oldest(self):
        store = RunStore(max_runs=2)
        store.start("a")
        store.start("b")
        store.start("c")  # evicts "a"
        self.assertIsNone(store.get("a"))
        self.assertIsNotNone(store.get("b"))
        self.assertIsNotNone(store.get("c"))

    def test_list_recent_newest_first(self):
        store = RunStore()
        store.start("a")
        store.start("b")
        ids = [r["correlation_id"] for r in store.list_recent()]
        self.assertEqual(ids, ["b", "a"])

    def test_add_stage_on_unknown_id_is_a_noop(self):
        store = RunStore()
        store.add_stage("missing", "whatever")  # must not raise
        self.assertIsNone(store.get("missing"))


if __name__ == "__main__":
    unittest.main()
