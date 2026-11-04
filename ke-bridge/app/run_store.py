"""Bounded, in-memory store of recent price-forecast runs, keyed by
`correlation_id`.

NOT persisted: this is demo-scoped state that is lost whenever the ke-bridge
process restarts (no database/file backing exists in this project for this
data). Bounded to `_MAX_RUNS` entries (oldest evicted first) so a long-running
demo with `market-service-standin` publishing every 90s doesn't grow memory
unbounded.

Stages are appended to a run's `stages` list only as they actually happen -
never pre-filled with "pending" placeholders - so the frontend only ever
shows a stage as reached if a real event backs it (per the task's explicit
"únicamente si están respaldados por eventos reales").
"""

import threading
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

_MAX_RUNS = 20


class RunStore:
    def __init__(self, max_runs: int = _MAX_RUNS) -> None:
        self._max_runs = max_runs
        self._runs: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        self._lock = threading.Lock()

    def start(self, correlation_id: str, **fields: Any) -> None:
        with self._lock:
            run = {
                "correlation_id": correlation_id,
                "status": "running",
                "stages": [],
                "started_at": time.time(),
                **fields,
            }
            self._runs[correlation_id] = run
            self._runs.move_to_end(correlation_id)
            self._evict()

    def add_stage(self, correlation_id: str, name: str, **fields: Any) -> None:
        with self._lock:
            run = self._runs.get(correlation_id)
            if run is None:
                return
            run["stages"].append({"name": name, "at": time.time(), **fields})
            self._runs.move_to_end(correlation_id)

    def update(self, correlation_id: str, **fields: Any) -> None:
        """Attach/replace fields on a run that's still in progress (e.g. the
        price series, as soon as it's known) without marking it finished."""
        with self._lock:
            run = self._runs.get(correlation_id)
            if run is None:
                return
            run.update(fields)
            self._runs.move_to_end(correlation_id)

    def finish(self, correlation_id: str, status: str, **fields: Any) -> None:
        with self._lock:
            run = self._runs.get(correlation_id)
            if run is None:
                return
            run["status"] = status
            run["completed_at"] = time.time()
            run.update(fields)
            self._runs.move_to_end(correlation_id)

    def get(self, correlation_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            run = self._runs.get(correlation_id)
            return dict(run) if run is not None else None

    def list_recent(self, limit: int = _MAX_RUNS) -> List[Dict[str, Any]]:
        with self._lock:
            runs = list(self._runs.values())
        return [dict(r) for r in runs[-limit:]][::-1]

    def _evict(self) -> None:
        while len(self._runs) > self._max_runs:
            self._runs.popitem(last=False)


run_store = RunStore()
