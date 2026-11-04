"""Price-forecast Knowledge Interaction (producer side) - all via the KE.

Publishes the Taimu forecast as a `price-forecast` POST (see
resources/ki/price-forecast.yaml). Pure transform functions are kept separate
from the ke_client-decorated function so they can be unit-tested without a
live Knowledge Engine (see ke-bridge/tests/test_price_forecast.py).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List

from ke_client import KIHolder

from ..rdf_utils import datetime_literal, double_literal, uri

forecast_ki = KIHolder()


@forecast_ki.post("price-forecast")
def _post_price_forecast(bindings: List[Dict[str, str]]):
    # The KE POST payload IS this function's return value - see ke-pyclient's
    # docs/README.md "Decorating KI methods" for this exact convention.
    return bindings


def _to_naive_utc_iso(ts: str) -> str:
    """Taimu's FAST/chronos_2 pipeline (third-party, not ours) fails with
    `Cannot change data-type for array of references` when fed timezone-aware
    ISO 8601 timestamps (confirmed by reproducing it directly against the
    Taimu API with real KE-sourced prices). All our timestamps are UTC, so
    this drops the offset losslessly instead of fabricating/guessing a time."""
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat()


def _to_utc_iso(ds: str) -> str:
    """Taimu returns `ds` as a pandas-formatted, space-separated, naive
    string (e.g. '2026-11-02 00:00:00'), which is implicitly UTC (see
    `_to_naive_utc_iso`). xsd:dateTime requires a 'T' separator, so this
    reattaches it plus the UTC offset before publishing back to the KE."""
    dt = datetime.fromisoformat(ds.replace(" ", "T"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def prices_to_taimu_payload(
    prices: List[Dict[str, Any]],
    unique_id: str = "tm-day-ahead-price",
) -> Dict[str, List[Any]]:
    """Turn KE price points (`{"ts": iso, "price": float}`) into Taimu's
    `{ds, unique_id, y}` day-ahead request contract."""
    return {
        "ds": [_to_naive_utc_iso(p["ts"]) for p in prices],
        "unique_id": [unique_id] * len(prices),
        "y": [p["price"] for p in prices],
    }


def taimu_result_to_points(result: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
    """Validate and flatten a Taimu `/forecast/day-ahead` response into
    `[{"ds": iso, "yhat": float}, ...]`. Raises ValueError on a malformed
    response - never silently fabricates points."""
    ds = result.get("ds", [])
    yhat = result.get("yhat", [])
    if not ds or not yhat:
        raise ValueError("Taimu response is missing 'ds'/'yhat'")
    if len(ds) != len(yhat):
        raise ValueError(f"Taimu response arrays length mismatch: ds={len(ds)} yhat={len(yhat)}")
    return [{"ds": _to_utc_iso(d), "yhat": float(v)} for d, v in zip(ds, yhat)]


def build_price_forecast_bindings(
    forecast_uri: str,
    points: List[Dict[str, Any]],
    time_create: str,
) -> List[Dict[str, str]]:
    """Build the N3 bindings for the price-forecast graph pattern: one
    s4ener:DataPoint per forecasted point, all belonging to `forecast_uri`."""
    forecast_uri_n3 = uri(forecast_uri)
    time_create_n3 = datetime_literal(time_create)
    bindings = []
    for index, point in enumerate(points):
        bindings.append({
            "forecast_uri": forecast_uri_n3,
            "time_create": time_create_n3,
            "dp": uri(f"{forecast_uri}/dp/{index}"),
            "ts": datetime_literal(point["ds"]),
            "dpr": uri(f"{forecast_uri}/dp/{index}/result"),
            "value": double_literal(point["yhat"]),
        })
    return bindings


def publish_price_forecast(forecast_uri: str, points: List[Dict[str, Any]], time_create: str) -> int:
    """POST the forecast to the KE. Returns the number of points published."""
    bindings = build_price_forecast_bindings(forecast_uri, points, time_create)
    _post_price_forecast(bindings=bindings)
    return len(bindings)
