"""Thin HTTP client for the Taimu forecasting API (FAST pipeline).

Plain REST call via `requests` - NOT a Knowledge Engine interaction. Used by
the price-forecast Knowledge Interaction (app/interactions/price_forecast.py)
to turn prices obtained from the KE into a forecast, which is then published
back to the KE. Kept separate from KeBridgeService's frontend-facing proxy.
"""

from typing import Any, Dict, List

import requests

from .config import settings


class ForecastingApiError(RuntimeError):
    """Raised when the Taimu forecasting API is unreachable or returns an error."""


def get_health(timeout: float = 5.0) -> Dict[str, Any]:
    try:
        res = requests.get(f"{settings.price_forecast_api_url}/health", timeout=timeout)
        res.raise_for_status()
        return res.json()
    except requests.RequestException as exc:
        raise ForecastingApiError(f"Taimu /health unreachable: {exc}") from exc


def run_day_ahead_forecast(
    ds: List[str],
    unique_id: List[str],
    y: List[float],
    horizon_span: int = 96,
    timeout: float = 120.0,
) -> Dict[str, List[Any]]:
    """POST /forecast/day-ahead on the Taimu API. Raises ForecastingApiError on failure.

    Never returns fabricated data: any HTTP/network error propagates as an
    exception instead of a silent fallback value.
    """
    payload = {
        "horizon_span": horizon_span,
        "data": {"ds": ds, "unique_id": unique_id, "y": y},
    }
    try:
        res = requests.post(
            f"{settings.price_forecast_api_url}/forecast/day-ahead",
            json=payload,
            timeout=timeout,
        )
        res.raise_for_status()
        return res.json()
    except requests.RequestException as exc:
        detail = getattr(exc.response, "text", "") if getattr(exc, "response", None) else ""
        raise ForecastingApiError(f"Taimu /forecast/day-ahead failed: {exc} {detail}") from exc
