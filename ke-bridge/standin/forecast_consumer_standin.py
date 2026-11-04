"""Temporary price-forecast consumer stand-in.

Registers an independent Knowledge Base (http://forecast-consumer.bluebird.com)
and REACTs to the price-forecast Knowledge Interaction POSTed by the simulator
bridge, proving that the forecast is genuinely delivered through the Knowledge
Engine to a third, decoupled process (not just logged by the producer itself).

Run (needs the real ke_client and a reachable KE Smart Connector):
    python forecast_consumer_standin.py
"""

import logging
import os

_HERE = os.path.dirname(os.path.abspath(__file__))

# ke_client reads KE_* from the environment at import time, so set them first.
os.environ.setdefault("KE_REST_ENDPOINT", "http://tm-ke-service:8280/rest/")
os.environ.setdefault("KE_KNOWLEDGE_BASE_ID", "http://forecast-consumer.bluebird.com")
os.environ.setdefault(
    "KE_KI_CONFIG_PATH",
    os.path.join(_HERE, "resources_forecast_consumer", "ke_config.yml"),
)
os.environ.setdefault("KE_ALLOW_PARTIAL_KI", "true")

from ke_client import KEClient, KIHolder, configure_ki  # noqa: E402

log = logging.getLogger("forecast-consumer-standin")

consumer_ki = KIHolder()


@consumer_ki.react("price-forecast")
def on_price_forecast(ki_id, bindings):
    log.info("price-forecast REACT: received %s data point(s)", len(bindings))
    for b in bindings[:3]:
        log.info("  sample point: ts=%s value=%s forecast_uri=%s",
                 b.get("ts"), b.get("value"), b.get("forecast_uri"))
    # No result_pattern is declared for price-forecast, so REACT just
    # acknowledges receipt (empty list).
    return []


def main():
    # force=True: `ke_client`'s KESettings() already triggers an implicit
    # basicConfig() (via a bare logging.warning() at import time), which would
    # otherwise make this call a no-op and silently drop every .info() below.
    logging.basicConfig(level=logging.INFO, force=True)
    configure_ki()
    client = KEClient.build(logger=log)
    client.include(ki_holder=consumer_ki)
    client.register()
    import time
    while not client.is_registered:
        log.info("waiting for forecast-consumer-standin registration…")
        time.sleep(1)
    log.info("forecast-consumer-standin registered as %s", os.environ["KE_KNOWLEDGE_BASE_ID"])
    client.start_sync()  # blocking handler loop


if __name__ == "__main__":
    main()
