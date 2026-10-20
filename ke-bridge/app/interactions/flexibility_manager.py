"""Flexibility Manager interactions (consumer side) — all via the Knowledge Engine.

In Phase 1 these ASK KIs are registered but answered by nobody until the Phase 3
FM stand-in (decision D-Q2) or the real FM exposes the matching ANSWER patterns.
"""

from typing import Any, Dict, List

from ke_client import KIHolder

from ..rdf_utils import datetime_literal, parse_float, parse_node, uri

fm_ki = KIHolder()


@fm_ki.ask("fm-ts-info-request")
def _ask_fm_ts_info(query: Dict[str, str]):
    return [query]


@fm_ki.ask("fm-ts")
def _ask_fm_ts(queries: List[Dict[str, str]]):
    return queries


def get_predicted_consumption(date_from: str, date_to: str) -> Dict[str, Any]:
    """ASK FM for predicted consumption over a date range.

    Returns `{ "predictedConsumptionMWh": <float>, "points": [...] }`, where the
    total is the sum of the per-ISP MWh data points.
    """
    info_query = {
        "ts_interval_uri": uri("http://simulator.bluebird.com/interval/fm"),
        "ts_date_from": datetime_literal(date_from),
        "ts_date_to": datetime_literal(date_to),
    }
    series = _ask_fm_ts_info(info_query).binding_set
    ts_queries = [
        {"ts_uri": uri(parse_node(row["ts_uri"]))}
        for row in series
        if "ts_uri" in row
    ]
    if not ts_queries:
        return {"predictedConsumptionMWh": 0.0, "points": []}

    points = _ask_fm_ts(ts_queries).binding_set
    parsed = [
        {"ts": parse_node(p["ts"]), "value": parse_float(p["value"])}
        for p in points
    ]
    total = round(sum(p["value"] for p in parsed), 2)
    return {"predictedConsumptionMWh": total, "points": parsed}
