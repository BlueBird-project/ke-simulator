"""Temporary Flexibility Manager stand-in (decision D-Q2).

Registers the FM Knowledge Base (http://fm.bluebird.com) with the Knowledge
Engine and ANSWERs the consumption patterns the simulator bridge ASKs, so the
whole KE path can be exercised before the real FM gains KE support.

Run (needs the real ke_client and a reachable KE Smart Connector):
    pip install -r ../requirements.txt
    python fm_standin.py
"""

import logging
import os
import time
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))

# ke_client reads KE_* from the environment at import time, so set them first.
os.environ.setdefault("KE_REST_ENDPOINT", "http://tm-ke-service:8280/rest/")
os.environ.setdefault("KE_KNOWLEDGE_BASE_ID", "http://fm.bluebird.com")
os.environ.setdefault("KE_KI_CONFIG_PATH", os.path.join(_HERE, "resources", "ke_config.yml"))
os.environ.setdefault("KE_ALLOW_PARTIAL_KI", "true")

from ke_client import KEClient, KIHolder, configure_ki  # noqa: E402

log = logging.getLogger("fm-standin")

XSD = "http://www.w3.org/2001/XMLSchema#"
SAREF4ENER = "https://saref.etsi.org/saref4ener/"
FM = "http://fm.bluebird.com"

fm_ki = KIHolder()


def _uri(value: str) -> str:
    return f"<{value}>"


def _dt_literal(dt: datetime) -> str:
    return f'"{dt.isoformat()}"^^<{XSD}dateTime>'


def _double_literal(value: float) -> str:
    return f'"{round(value, 3)}"^^<{XSD}double>'


def _consumption_mwh(isp_index: int) -> float:
    """A plausible diurnal consumption shape summing to ~500 MWh/day."""
    import math
    # Baseline ~5.2 MWh per 15-min ISP, with a daytime bump.
    hour = (isp_index * 15) / 60.0
    shape = 1.0 + 0.35 * math.sin((hour - 6) / 24.0 * 2 * math.pi)
    return max(0.5, 5.2 * shape)


@fm_ki.answer("fm-ts-info-request")
def on_ts_info(ki_id, bindings):
    log.info("fm-ts-info-request: %s binding(s)", len(bindings))
    now = datetime.now(timezone.utc)
    ts_uri = _uri(f"{FM}/ts/consumption/day-ahead")
    responses = []
    for b in bindings:
        responses.append({
            "ts_interval_uri": b.get("ts_interval_uri", _uri(f"{FM}/interval/day-ahead")),
            "ts_date_from": b.get("ts_date_from", _dt_literal(now)),
            "ts_date_to": b.get("ts_date_to", _dt_literal(now + timedelta(days=1))),
            "ts_uri": ts_uri,
            "ts_usage": _uri(f"{SAREF4ENER}Consumption"),
            "time_create": _dt_literal(now),
        })
    return responses


@fm_ki.answer("fm-ts")
def on_ts(ki_id, bindings):
    log.info("fm-ts: %s binding(s)", len(bindings))
    base = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    points = []
    for b in bindings:
        ts_uri = b.get("ts_uri", _uri(f"{FM}/ts/consumption/day-ahead"))
        for i in range(96):  # 96 × 15-min ISPs
            ts = base + timedelta(minutes=15 * i)
            epoch_ms = int(ts.timestamp() * 1000)
            points.append({
                "ts_uri": ts_uri,
                "dp": _uri(f"{FM}/dp/{epoch_ms}"),
                "ts": _dt_literal(ts),
                "dpr": _uri(f"{FM}/dp/{epoch_ms}/result"),
                "value": _double_literal(_consumption_mwh(i)),
            })
    return points


def main():
    logging.basicConfig(level=logging.INFO)
    configure_ki()
    client = KEClient.build(logger=log)
    client.include(ki_holder=fm_ki)
    client.register()
    while not client.is_registered:
        log.info("waiting for FM stand-in registration…")
        time.sleep(1)
    log.info("FM stand-in registered as %s", os.environ["KE_KNOWLEDGE_BASE_ID"])
    client.start_sync()  # blocking handler loop


if __name__ == "__main__":
    main()
