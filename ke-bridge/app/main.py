"""FastAPI app exposing the KE bridge to the React frontend (REST + SSE)."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .events import broker
from .ke_bridge import bridge
from .run_store import run_store

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    broker.bind_loop(asyncio.get_running_loop())
    bridge.start()
    yield
    bridge.stop()


app = FastAPI(title="KE Simulator Bridge", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return bridge.status()


@app.get("/ke/tm-info")
def tm_info():
    try:
        return {"tm": bridge.get_tm_info()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/ke/prices/day-ahead")
def day_ahead_prices(date_from: str, date_to: str):
    try:
        return {"prices": bridge.get_day_ahead_prices(date_from, date_to)}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/ke/flexibility/forecast")
def flexibility_forecast(date_from: str, date_to: str):
    try:
        return bridge.get_flexibility_forecast(date_from, date_to)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


class PriceForecastRunRequest(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    horizon_span: int = 16


@app.post("/ke/price-forecast/run")
def run_price_forecast(request: PriceForecastRunRequest = Body(default=PriceForecastRunRequest())):
    """Vertical slice: ASK TM for day-ahead prices via the KE, call the Taimu
    forecasting API over HTTP, POST the forecast back onto the KE. Returns
    503 if the KE or Taimu is unavailable - never a fabricated forecast."""
    now = datetime.now(timezone.utc)
    date_from = request.date_from or (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    date_to = request.date_to or (now + timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    try:
        return bridge.run_price_forecast(date_from, date_to, horizon_span=request.horizon_span)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/ke/price-forecast/runs")
def list_price_forecast_runs():
    """Recent runs (manual ASK and automatic REACT), newest first. In-memory
    only - see app/run_store.py docstring (lost on backend restart, bounded
    to the last 20 runs)."""
    return {"runs": run_store.list_recent()}


@app.get("/ke/price-forecast/runs/{correlation_id}")
def get_price_forecast_run(correlation_id: str):
    """Full detail for one run: the real historical price series sent to
    Taimu, the real forecast points returned, timestamps, EUR/MWh unit, data
    origin (TEST producer vs real), and the stages actually reached so far."""
    run = run_store.get(correlation_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"no run found for correlation_id={correlation_id}")
    return run


@app.get("/events")
async def events():
    async def event_stream():
        async for event in broker.subscribe():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
