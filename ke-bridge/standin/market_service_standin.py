"""TEST Market Service producer - POSTs synthetic day-ahead prices via the KE.

Registers an independent Knowledge Base (http://test-market-producer.bluebird.com)
and POSTs the SAME `tou-price` graph pattern tm-standin already ANSWERs (reused
verbatim, not a new protocol - see resources_market_service/ki/trading-manager.yaml,
byte-identical to ke-bridge/resources/ki/trading-manager.yaml). This lets the
Forecast Smart Connector's `tou-price` REACT (app/interactions/trading_manager.py)
fire automatically, with no frontend button involved.

Prices are CLEARLY SYNTHETIC/TEST data (see PRICE CURVE below, logged as such on
every publish) standing in for a real Market Service, which does not yet POST
prices through the KE (confirmed: trading-manager's tm_interactions.py only
registers tou-price/tou-price-info-filtered via `.answer()`, i.e. ASK/ANSWER).

Publishes once shortly after registering, then repeats on a timer
(PUBLISH_INTERVAL_SECONDS, default 90s) so the automatic flow can be observed
without any manual trigger. Each cycle uses a fresh `tou_uri` so the Forecast
Smart Connector's de-dupe (by tou_uri) treats it as new data, not a retry.

Run (needs the real ke_client and a reachable KE Smart Connector):
    python market_service_standin.py
"""

import logging
import math
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))

# ke_client reads KE_* from the environment at import time, so set them first.
os.environ.setdefault("KE_REST_ENDPOINT", "http://ke-service:8280/rest/")
os.environ.setdefault("KE_KNOWLEDGE_BASE_ID", "http://test-market-producer.bluebird.com")
os.environ.setdefault(
    "KE_KI_CONFIG_PATH",
    os.path.join(_HERE, "resources_market_service", "ke_config.yml"),
)
os.environ.setdefault("KE_ALLOW_PARTIAL_KI", "true")

from ke_client import KEClient, KIHolder, configure_ki  # noqa: E402

log = logging.getLogger("market-service-standin")

XSD = "http://www.w3.org/2001/XMLSchema#"
TM = "http://tm.bluebird.com"  # tou-price's producedBy is hardcoded to this URI in the reused pattern
PRODUCER = "http://test-market-producer.bluebird.com"
PUBLISH_INTERVAL_SECONDS = int(os.environ.get("PUBLISH_INTERVAL_SECONDS", "90"))

market_ki = KIHolder()


def _uri(value: str) -> str:
    return f"<{value}>"


def _dt_literal(dt: datetime) -> str:
    return f'"{dt.isoformat()}"^^<{XSD}dateTime>'


def _double_literal(value: float) -> str:
    return f'"{round(value, 2)}"^^<{XSD}double>'


def _price_eur_mwh(isp_index: int) -> float:
    """SYNTHETIC/TEST day-ahead curve (EUR/MWh) - deliberately includes
    negative prices overnight (unlike tm_standin's clamped curve), to prove
    the price-forecast pipeline preserves them end to end (no positive_pv
    clipping - see resources/taimu/price_forecast_api_config.json)."""
    hour = (isp_index * 15) / 60.0
    base = 55.0
    morning = 18.0 * math.exp(-((hour - 9) ** 2) / 6.0)
    evening = 22.0 * math.exp(-((hour - 20) ** 2) / 6.0)
    night_dip = -70.0 * math.exp(-((hour - 3) ** 2) / 4.0)
    return round(base + morning + evening + night_dip, 2)


@market_ki.post("tou-price")
def _post_tou_price(bindings):
    return bindings


def _build_tou_price_bindings(tou_uri: str):
    base = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    bindings = []
    for i in range(96):  # 96 x 15-min ISPs
        ts = base + timedelta(minutes=15 * i)
        epoch_ms = int(ts.timestamp() * 1000)
        bindings.append({
            "tou_uri": _uri(tou_uri),
            "dp": _uri(f"{PRODUCER}/dp/{epoch_ms}"),
            "ts": _dt_literal(ts),
            "dpr": _uri(f"{PRODUCER}/dp/{epoch_ms}/result"),
            "value": _double_literal(_price_eur_mwh(i)),
        })
    return bindings


def _publish_once():
    tou_uri = f"{PRODUCER}/tou/test-{uuid.uuid4().hex[:8]}"
    bindings = _build_tou_price_bindings(tou_uri)
    negative_count = sum(1 for b in bindings if float(b["value"].split('"')[1]) < 0)
    log.info(
        "[TEST] POSTing synthetic day-ahead prices tou_uri=%s (%s point(s), %s negative)",
        tou_uri, len(bindings), negative_count,
    )
    _post_tou_price(bindings=bindings)
    log.info("[TEST] POST sent for tou_uri=%s", tou_uri)


def main():
    # force=True: `ke_client`'s KESettings() already triggers an implicit
    # basicConfig() (via a bare logging.warning() at import time), which would
    # otherwise make this call a no-op and silently drop every .info() below.
    logging.basicConfig(level=logging.INFO, force=True)
    configure_ki()
    client = KEClient.build(logger=log)
    client.include(ki_holder=market_ki)
    client.register()
    while not client.is_registered:
        log.info("waiting for market-service-standin registration…")
        time.sleep(1)
    log.info("market-service-standin registered as %s", os.environ["KE_KNOWLEDGE_BASE_ID"])

    # Real bug found by testing: `post_ke()` asserts the client is "running",
    # even with no ANSWER/REACT handlers to dispatch. `start()` runs the
    # (idle) handler loop in the background so the foreground loop below can
    # just POST on a timer.
    client.start()

    while True:
        try:
            _publish_once()
        except Exception:
            log.exception("[TEST] publish failed, will retry next cycle")
        time.sleep(PUBLISH_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
