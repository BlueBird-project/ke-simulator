# KE Bridge — simulator's Knowledge Base companion

Server-side companion that lets the **browser** `ke-simulator` participate in the
**Knowledge Engine (KE)**. The browser cannot use the Python `ke_client`
library, so this service registers the simulator's Knowledge Base, performs the
Knowledge Interactions (ASK/POST/ANSWER/REACT) and exposes a thin REST + SSE API
to the React frontend.

> **Status: Phase 1 scaffolding** (see
> [../specs/001-ke-integration/tasks.md](../specs/001-ke-integration/tasks.md)).
> Implements the KE client lifecycle (T010–T012), a `tm-info` connectivity probe
> (T013) and a day-ahead prices path skeleton (prep for T020). It is **not** yet
> wired into the frontend and some binding details are marked to be finalized in
> Phase 2 against a live TM.

## Design decisions reflected here
- **D-Q1** KB id `http://simulator.bluebird.com`; talks to the Smart Connector at
  `KE_REST_ENDPOINT` (default `http://tm-ke-service:8280/rest/`).
- **D-Q3** Prices come **through the KE** from TM's `tou-price` producer.
- **D-Q4** Live KE exchange events are pushed to the UI via **SSE** (`/events`).
- **D-Q5** Offer interactions are **read-only** for now (no `tm-market-offer` POST).
- **Fallback:** if `ke_client` or the KE is unavailable, the bridge reports
  `mode: "simulated"` so the frontend keeps working.

## Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | liveness |
| GET | `/ready` | `{ mode, registered, kb_id, ke_endpoint }` |
| GET | `/ke/tm-info` | ASK `tm-info` (connectivity probe) |
| GET | `/ke/prices/day-ahead?date_from=&date_to=` | ASK `tou-price-info-filtered` → `tou-price` |
| GET | `/events` | SSE stream of KE exchange events |

## Run (local)
```bash
cp .env.example .env            # adjust KE_REST_ENDPOINT if needed
pip install -r requirements.txt # installs the private ke_client 0.32.3
uvicorn app.main:app --host 0.0.0.0 --port 8090
```

## Run (Docker, on TM's network)
Build the image and attach it to the external `local_tm-net` network so it can
reach `tm-ke-service:8280` (decision D-Q1). A compose snippet will be added in
Phase 6 (task T061).

## Layout
```
ke-bridge/
  app/
    main.py                     FastAPI app + lifespan (starts the bridge)
    ke_bridge.py                KE client lifecycle (build/include/register/start, retry/backoff, mode)
    config.py                   env settings (KE_* + BRIDGE_*)
    events.py                   thread-safe SSE event broker
    rdf_utils.py                tiny N3 literal/URI helpers
    interactions/
      trading_manager.py        ASK tm-info / tou-price-info-filtered / tou-price
      flexibility_manager.py    ASK fm-ts-info-request / fm-ts (consumer side)
  resources/
    ke_config.yml               KB + prefixes + includes
    ki/trading-manager.yaml     graph patterns aligned with TM's producer side
    ki/flexibility-manager.yaml graph patterns aligned with FM (served by the stand-in in Phase 3)
    ki_vars.yml                 ${KB_ID}, ${ISP_UNIT} substitutions
  requirements.txt  Dockerfile  .env.example
```
