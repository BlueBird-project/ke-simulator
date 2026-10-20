"""Temporary Trading Manager price stand-in (Option B).

Registers the TM Knowledge Base (http://tm.bluebird.com) with the Knowledge
Engine and ANSWERs the price patterns the simulator bridge ASKs (tm-info,
tou-price-info-filtered, tou-price), so day-ahead prices flow through the KE
end-to-end without the private, real Trading Manager. Prices are synthetic.

Run (needs the real ke_client and a reachable KE Smart Connector):
    python tm_standin.py
"""

import logging
import math
import os
import time
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))

# ke_client reads KE_* from the environment at import time, so set them first.
os.environ.setdefault("KE_REST_ENDPOINT", "http://tm-ke-service:8280/rest/")
os.environ.setdefault("KE_KNOWLEDGE_BASE_ID", "http://tm.bluebird.com")
os.environ.setdefault("KE_KI_CONFIG_PATH", os.path.join(_HERE, "resources_tm", "ke_config.yml"))
os.environ.setdefault("KE_ALLOW_PARTIAL_KI", "true")

from ke_client import KEClient, KIHolder, configure_ki  # noqa: E402

log = logging.getLogger("tm-standin")

XSD = "http://www.w3.org/2001/XMLSchema#"
TM = "http://tm.bluebird.com"

tm_ki = KIHolder()


def _uri(value: str) -> str:
    return f"<{value}>"


def _dt_literal(dt: datetime) -> str:
    return f'"{dt.isoformat()}"^^<{XSD}dateTime>'


def _double_literal(value: float) -> str:
    return f'"{round(value, 2)}"^^<{XSD}double>'


def _price_eur_mwh(isp_index: int) -> float:
    """A plausible day-ahead price curve (EUR/MWh): low at night, peaks midday/evening."""
    hour = (isp_index * 15) / 60.0
    base = 55.0
    morning = 18.0 * math.exp(-((hour - 9) ** 2) / 6.0)
    evening = 22.0 * math.exp(-((hour - 20) ** 2) / 6.0)
    night = -12.0 * math.exp(-((hour - 4) ** 2) / 8.0)
    return max(5.0, round(base + morning + evening + night, 2))


@tm_ki.answer("tm-info")
def on_tm_info(ki_id, bindings):
    log.info("tm-info: %s binding(s)", len(bindings))
    return [{
        "command_uri": _uri(f"{TM}/command/day-ahead"),
        "market_uri": _uri(f"{TM}/market/day-ahead"),
    }]


@tm_ki.answer("tou-price-info-filtered")
def on_tou_info(ki_id, bindings):
    log.info("tou-price-info-filtered: %s binding(s)", len(bindings))
    now = datetime.now(timezone.utc)
    tou_uri = _uri(f"{TM}/tou/day-ahead")
    responses = []
    for b in bindings:
        responses.append({
            "ts_interval_uri": b.get("ts_interval_uri", _uri(f"{TM}/interval/day-ahead")),
            "ts_date_from": b.get("ts_date_from", _dt_literal(now)),
            "ts_date_to": b.get("ts_date_to", _dt_literal(now + timedelta(days=1))),
            "tou_uri": tou_uri,
            "time_create": _dt_literal(now),
        })
    return responses


@tm_ki.answer("tou-price")
def on_tou_price(ki_id, bindings):
    log.info("tou-price: %s binding(s)", len(bindings))
    base = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    points = []
    for b in bindings:
        tou_uri = b.get("tou_uri", _uri(f"{TM}/tou/day-ahead"))
        for i in range(96):  # 96 × 15-min ISPs
            ts = base + timedelta(minutes=15 * i)
            epoch_ms = int(ts.timestamp() * 1000)
            points.append({
                "tou_uri": tou_uri,
                "dp": _uri(f"{TM}/dp/{epoch_ms}"),
                "ts": _dt_literal(ts),
                "dpr": _uri(f"{TM}/dp/{epoch_ms}/result"),
                "value": _double_literal(_price_eur_mwh(i)),
            })
    return points


def main():
    logging.basicConfig(level=logging.INFO)
    configure_ki()
    client = KEClient.build(logger=log)
    client.include(ki_holder=tm_ki)
    client.register()
    while not client.is_registered:
        log.info("waiting for TM stand-in registration…")
        time.sleep(1)
    log.info("TM stand-in registered as %s", os.environ["KE_KNOWLEDGE_BASE_ID"])
    client.start_sync()  # blocking handler loop


if __name__ == "__main__":
    main()
