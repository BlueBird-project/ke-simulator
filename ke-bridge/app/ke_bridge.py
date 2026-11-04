"""KE client lifecycle for the simulator bridge.

Builds, registers and starts a ke_client.KEClient in a background thread with
retry/backoff (modelled on trading-manager/.../examples/ki/smart_client.py).
If ke_client is unavailable or registration ultimately fails, the bridge reports
mode="simulated" so the frontend can fall back gracefully (principle #5).
"""

import logging
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .config import settings
from .events import broker
from .run_store import run_store

log = logging.getLogger("ke-bridge")

# Confirmed by the reused tou-price/price-forecast graph patterns
# (ubmarket:EURPerMegawattHour) - not guessed.
_PRICE_UNIT = "EUR/MWh"

# Bounded de-dupe cache for REACT-triggered forecasts: a producer re-posting
# (retry/redelivery) the same tou_uri must not re-trigger Taimu/publish again.
_MAX_SEEN_TOU_URIS = 50


class KEBridge:
    def __init__(self) -> None:
        self._client: Optional[Any] = None
        self._thread: Optional[threading.Thread] = None
        self._mode: str = "starting"  # starting | ke | simulated
        self._seen_tou_uris: "OrderedDict[str, None]" = OrderedDict()
        self._seen_lock = threading.Lock()

    # ---- status -----------------------------------------------------------
    @property
    def mode(self) -> str:
        return self._mode

    def status(self) -> Dict[str, Any]:
        registered = bool(self._client is not None and getattr(self._client, "is_registered", False))
        return {
            "mode": self._mode,
            "registered": registered,
            "kb_id": settings.ke_knowledge_base_id,
            "ke_endpoint": settings.ke_rest_endpoint,
        }

    # ---- lifecycle --------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="ke-bridge", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        try:
            if self._client is not None:
                self._client.stop()
        except Exception:  # best-effort shutdown
            log.debug("KE client stop raised", exc_info=True)

    def _run(self) -> None:
        try:
            import ke_client
            from ke_client import KEClient, configure_ki
        except Exception as exc:  # ke_client not installed in this environment
            log.warning("ke_client unavailable (%s); running in SIMULATED mode", exc)
            self._set_mode("simulated")
            return

        try:
            ke_client.VERIFY_SERVER_CERT = settings.ke_verify_server_cert
            configure_ki()  # loads graph patterns from KE_KI_CONFIG_PATH

            from . import interactions

            self._client = KEClient.build(logger=log)
            for holder in interactions.holders():
                self._client.include(ki_holder=holder)

            self._register_with_backoff()
            self._client.start()  # background ANSWER/REACT handler loop
            self._set_mode("ke")
        except Exception:
            log.exception("KE bridge failed to start; falling back to SIMULATED mode")
            self._set_mode("simulated")

    def _register_with_backoff(self, max_attempts: int = 20) -> None:
        wait = 5
        for attempt in range(1, max_attempts + 1):
            try:
                self._client.register()
                for _ in range(30):
                    if self._client.is_registered:
                        log.info("KE client registered")
                        return
                    time.sleep(1)
                raise TimeoutError("registration timeout")
            except Exception as exc:
                log.warning("register attempt %s/%s failed: %s; retry in %ss",
                            attempt, max_attempts, exc, wait)
                time.sleep(wait)
                wait = min(wait * 2, 300)
        raise ConnectionError("cannot register with the Knowledge Engine")

    def _set_mode(self, mode: str) -> None:
        self._mode = mode
        broker.publish_threadsafe({"type": "bridge", "mode": mode})

    # ---- domain operations ------------------------------------------------
    def _require_ke(self) -> None:
        if self._mode != "ke":
            raise RuntimeError(f"Knowledge Engine not available (mode={self._mode})")

    def get_tm_info(self) -> List[Dict[str, Any]]:
        self._require_ke()
        from .interactions import trading_manager
        result = trading_manager.get_tm_info()
        broker.publish_threadsafe({"type": "ke", "ki": "tm-info", "count": len(result)})
        return result

    def get_day_ahead_prices(self, date_from: str, date_to: str) -> List[Dict[str, Any]]:
        self._require_ke()
        from .interactions import trading_manager
        prices = trading_manager.get_day_ahead_prices(date_from, date_to)
        broker.publish_threadsafe({"type": "ke", "ki": "tou-price", "count": len(prices)})
        return prices

    def get_flexibility_forecast(self, date_from: str, date_to: str) -> Dict[str, Any]:
        self._require_ke()
        from .interactions import flexibility_manager
        result = flexibility_manager.get_predicted_consumption(date_from, date_to)
        broker.publish_threadsafe({
            "type": "ke", "ki": "fm-ts",
            "value": result.get("predictedConsumptionMWh"),
        })
        return result

    def run_price_forecast(self, date_from: str, date_to: str, horizon_span: int = 16) -> Dict[str, Any]:
        """Manual/diagnostic path: ASK TM (real or stand-in) for day-ahead
        prices through the KE, then run the shared forecast pipeline. Kept
        exactly as before (same endpoint, same button) for compatibility -
        the automatic path is `handle_incoming_tou_price_react` below.
        """
        self._require_ke()
        from .interactions import trading_manager

        correlation_id = uuid.uuid4().hex[:12]
        log.info("[%s] price-forecast: ASK TM for day-ahead prices %s..%s", correlation_id, date_from, date_to)
        run_store.start(
            correlation_id, trigger="manual-ask", price_source="ke-ask",
            data_origin="tm-standin (TEST, ASK/ANSWER)", date_from=date_from, date_to=date_to,
        )
        prices = trading_manager.get_day_ahead_prices(date_from, date_to)
        if not prices:
            run_store.finish(correlation_id, status="error", error="no day-ahead prices available via the KE for this range")
            raise RuntimeError(f"[{correlation_id}] no day-ahead prices available via the KE for this range")
        log.info("[%s] price-forecast: got %s price point(s) via KE ASK", correlation_id, len(prices))
        run_store.add_stage(correlation_id, "prices_received", count=len(prices), source="ke-ask")

        return self._run_forecast_from_prices(
            prices, horizon_span=horizon_span, trigger="manual-ask",
            price_source="ke-ask", correlation_id=correlation_id,
        )

    def handle_incoming_tou_price_react(self, tou_uri: str, prices: List[Dict[str, Any]]) -> None:
        """Automatic path: called by the `tou-price` REACT handler
        (app/interactions/trading_manager.py) when a Market Service (real or
        TEST producer) POSTs a price series through the KE. No frontend
        button involved. De-dupes on `tou_uri` so redelivery/retries of the
        same series don't re-trigger Taimu or double-publish.

        Real bug found by testing: the KE's POST/REACT exchange has its own
        internal ack timeout, shorter than Taimu's inference time (~15-25s).
        A REACT handler that blocks until the forecast is published causes
        the PRODUCER's `post_ke()` to fail with a `TimeoutException` even
        though the bridge eventually finishes successfully. So: de-dupe
        synchronously (must happen before the REACT ack, to reject true
        duplicates), then run the actual Taimu/publish pipeline in a
        background thread so the REACT ack returns immediately.
        """
        with self._seen_lock:
            if tou_uri in self._seen_tou_uris:
                log.info("price-forecast (react): duplicate tou_uri %s, skipping", tou_uri)
                return
            self._seen_tou_uris[tou_uri] = None
            while len(self._seen_tou_uris) > _MAX_SEEN_TOU_URIS:
                self._seen_tou_uris.popitem(last=False)

        if not prices:
            log.warning("price-forecast (react): tou_uri %s had no price points, skipping", tou_uri)
            return

        correlation_id = uuid.uuid4().hex[:12]
        data_origin = (
            "market-service-standin (TEST, POST)" if "test-market-producer" in tou_uri
            else "unknown producer (POST)"
        )
        log.info("[%s] price-forecast (react): triggered by POST tou_uri=%s (%s price point(s)), "
                 "running forecast in the background so the REACT ack isn't delayed",
                 correlation_id, tou_uri, len(prices))
        run_store.start(
            correlation_id, trigger="react-auto", price_source="ke-react",
            data_origin=data_origin, tou_uri=tou_uri,
        )
        run_store.add_stage(correlation_id, "prices_received", count=len(prices), source="ke-react", tou_uri=tou_uri)
        thread = threading.Thread(
            target=self._run_forecast_from_prices_background,
            args=(prices, tou_uri, correlation_id),
            name=f"price-forecast-react-{correlation_id}",
            daemon=True,
        )
        thread.start()

    def _run_forecast_from_prices_background(self, prices: List[Dict[str, Any]], tou_uri: str, correlation_id: str) -> None:
        try:
            self._run_forecast_from_prices(
                prices, horizon_span=16, trigger="react-auto",
                price_source="ke-react", correlation_id=correlation_id,
            )
        except Exception as exc:
            log.exception("[%s] price-forecast (react): failed, no forecast published (tou_uri=%s)",
                         correlation_id, tou_uri)
            run_store.finish(correlation_id, status="error", error=str(exc))
            broker.publish_threadsafe({
                "type": "ke", "ki": "price-forecast", "trigger": "react-auto",
                "correlation_id": correlation_id, "error": str(exc),
            })

    def _run_forecast_from_prices(
        self, prices: List[Dict[str, Any]], horizon_span: int, trigger: str,
        price_source: str, correlation_id: str,
    ) -> Dict[str, Any]:
        """Shared core reused by both the manual ASK path and the automatic
        REACT path: Taimu HTTP call + publish forecast back onto the KE.
        Never fabricates data: any failed stage raises instead of returning
        mock values. Records real-data detail (series, timestamps, unit,
        stages) into `run_store` for GET /ke/price-forecast/runs/{id}.
        """
        from . import forecasting_client
        from .interactions import price_forecast

        priced_points = [{"ts": p["ts"], "price": p["price"], "unit": _PRICE_UNIT} for p in prices]
        run_store.update(correlation_id, prices=priced_points)

        payload = price_forecast.prices_to_taimu_payload(prices)
        log.info("[%s] price-forecast: calling Taimu HTTP API (%s history point(s), horizon=%s, trigger=%s)",
                 correlation_id, len(payload["ds"]), horizon_span, trigger)
        run_store.add_stage(correlation_id, "taimu_request", history_points=len(payload["ds"]), horizon_span=horizon_span)
        try:
            result = forecasting_client.run_day_ahead_forecast(
                ds=payload["ds"], unique_id=payload["unique_id"], y=payload["y"], horizon_span=horizon_span,
            )
            points = price_forecast.taimu_result_to_points(result)
        except Exception as exc:
            run_store.finish(correlation_id, status="error", error=str(exc))
            raise
        log.info("[%s] price-forecast: Taimu returned %s forecast point(s)", correlation_id, len(points))
        run_store.add_stage(correlation_id, "taimu_response", count=len(points))

        time_create = datetime.now(timezone.utc).isoformat()
        forecast_uri = f"{settings.ke_knowledge_base_id}/forecast/{correlation_id}"
        try:
            published = price_forecast.publish_price_forecast(forecast_uri, points, time_create)
        except Exception as exc:
            run_store.finish(correlation_id, status="error", error=str(exc))
            raise
        log.info("[%s] price-forecast: POSTed %s point(s) to the KE as %s", correlation_id, published, forecast_uri)
        run_store.add_stage(correlation_id, "forecast_published", count=published, forecast_uri=forecast_uri)

        forecast_points = [{"ds": p["ds"], "yhat": p["yhat"], "unit": _PRICE_UNIT} for p in points]
        run_store.finish(
            correlation_id, status="ok", forecast_uri=forecast_uri,
            forecast=forecast_points, forecast_source="taimu-http",
        )

        broker.publish_threadsafe({
            "type": "ke", "ki": "price-forecast", "trigger": trigger, "correlation_id": correlation_id,
            "price_points": len(prices), "forecast_points": published,
        })

        return {
            "correlation_id": correlation_id,
            "forecast_uri": forecast_uri,
            "price_points": len(prices),
            "forecast": points,
            "price_source": price_source,
            "forecast_source": "taimu-http",
            "trigger": trigger,
        }


bridge = KEBridge()
