"""Trading Manager interactions (consumer side) — all via the Knowledge Engine.

Mirrors TM's example usage (tm-service/examples/ki/tou_interactions.py): a
module-level KIHolder with ASK-decorated functions. Calling a decorated function
performs the ASK through the KE and returns a KIAskResponse whose `.binding_set`
is a list of result binding dicts.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from ke_client import KIHolder

from ..rdf_utils import datetime_literal, parse_node, parse_float, uri

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
    prices: List[Dict[str, Any]] = []
    for point in points:
        start = parse_node(point["ts"])
        prices.append({
            "ts": start,
            "endTime": _plus_15min(start),
            "price": parse_float(point["value"]),
        })
    return prices


def _plus_15min(iso: str) -> Optional[str]:
    try:
        return (datetime.fromisoformat(iso.replace("Z", "+00:00")) + timedelta(minutes=15)).isoformat()
    except ValueError:
        return None
