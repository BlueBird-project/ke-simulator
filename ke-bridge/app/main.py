"""FastAPI app exposing the KE bridge to the React frontend (REST + SSE)."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .events import broker
from .ke_bridge import bridge

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


@app.get("/events")
async def events():
    async def event_stream():
        async for event in broker.subscribe():
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
