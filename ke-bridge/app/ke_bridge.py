"""KE client lifecycle for the simulator bridge.

Builds, registers and starts a ke_client.KEClient in a background thread with
retry/backoff (modelled on trading-manager/.../examples/ki/smart_client.py).
If ke_client is unavailable or registration ultimately fails, the bridge reports
mode="simulated" so the frontend can fall back gracefully (principle #5).
"""

import logging
import threading
import time
from typing import Any, Dict, List, Optional

from .config import settings
from .events import broker

log = logging.getLogger("ke-bridge")


class KEBridge:
    def __init__(self) -> None:
        self._client: Optional[Any] = None
        self._thread: Optional[threading.Thread] = None
        self._mode: str = "starting"  # starting | ke | simulated

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


bridge = KEBridge()
