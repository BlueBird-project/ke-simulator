"""Trading Manager interactions (consumer side) — all via the Knowledge Engine.

Mirrors TM's example usage (tm-service/examples/ki/tou_interactions.py): a
module-level KIHolder with ASK-decorated functions. Calling a decorated function
performs the ASK through the KE and returns a KIAskResponse whose `.binding_set`
is a list of result binding dicts.

Also registers a REACT on the SAME `tou-price` graph pattern (reused as-is,
not a new protocol - see resources/ki/trading-manager.yaml) so the Forecast
Smart Connector reacts automatically when a Market Service (real or TEST
producer) POSTs a price series, instead of requiring a manual ASK.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from ke_client import KIHolder

from ..rdf_utils import datetime_literal, parse_node, parse_float, uri

log = logging.getLogger("ke-bridge")

tm_ki = KIHolder()


@tm_ki.ask("tm-info")
def _ask_tm_info(kb_id: Optional[str] = None):
    # Empty binding asks the KE for all tm-info matches.
    return [{}]


@tm_ki.ask("tou-price-info-filtered")
def _ask_tou_info(query: Dict[str, str]):
    return [query]


@tm_ki.ask("tou-price")
def _ask_tou_price(queries: List[Dict[str, str]]):
    return queries


def _points_from_tou_price_rows(rows: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Shared N3 -> `{ts, endTime, price}` parsing for `tou-price` rows, used
    both by the ASK response (get_day_ahead_prices) and the REACT handler
    below - same graph pattern, same row shape, one parser."""
    prices: List[Dict[str, Any]] = []
    for row in rows:
        start = parse_node(row["ts"])
        prices.append({
            "ts": start,
            "endTime": _plus_15min(start),
            "price": parse_float(row["value"]),
        })
    return prices


def get_tm_info() -> List[Dict[str, Any]]:
    """Discover TM: returns binding dicts with command_uri / market_uri."""
    resp = _ask_tm_info()
    return resp.binding_set


def get_day_ahead_prices(date_from: str, date_to: str) -> List[Dict[str, Any]]:
    """ASK TM for day-ahead prices (two-step: locate series, then fetch points).

    `date_from`/`date_to` are ISO-8601 strings. Returns a list of
    `{ "ts": <iso>, "price": <float EUR/MWh> }`.

    NOTE (Phase 2 / T020): the exact interval modelling for the info query
    (ts_interval_uri + begin/end) must be validated against a live TM; the
    minimal query below is a starting point.
    """
    info_query = {
        "ts_interval_uri": uri("http://simulator.bluebird.com/interval/day-ahead"),
        "ts_date_from": datetime_literal(date_from),
        "ts_date_to": datetime_literal(date_to),
    }
    info = _ask_tou_info(info_query).binding_set
    price_queries = [
        {"tou_uri": uri(parse_node(row["tou_uri"]))}
        for row in info
        if "tou_uri" in row
    ]
    if not price_queries:
        return []

    points = _ask_tou_price(price_queries).binding_set
    return _points_from_tou_price_rows(points)


@tm_ki.react("tou-price")
def _react_tou_price(ki_id, bindings):
    """Fires automatically when ANY producer (real Market Service or a TEST
    stand-in) POSTs a `tou-price` series - no manual ASK/button involved.

    Never raises: any failure here must not crash the bridge's shared KE
    handler loop (which also serves tm-info/tou-price-info-filtered ASKs and
    the fm-ts ASK). Errors are logged loudly and surfaced over the SSE event
    broker instead of being swallowed or fabricating a forecast.
    """
    if not bindings:
        log.warning("REACT tou-price: empty bindings, nothing to do")
        return []
    tou_uri = parse_node(bindings[0].get("tou_uri", ""))
    try:
        prices = _points_from_tou_price_rows(bindings)
    except Exception:
        log.exception("REACT tou-price: failed to parse incoming bindings for %s", tou_uri)
        return []
    log.info("REACT tou-price: received %s price point(s) for %s", len(prices), tou_uri)
    try:
        from .. import ke_bridge
        ke_bridge.bridge.handle_incoming_tou_price_react(tou_uri=tou_uri, prices=prices)
    except Exception:
        log.exception("REACT tou-price: auto-forecast failed for %s (no forecast published)", tou_uri)
    return []


def _plus_15min(iso: str) -> Optional[str]:
    try:
        return (datetime.fromisoformat(iso.replace("Z", "+00:00")) + timedelta(minutes=15)).isoformat()
    except ValueError:
        return None

