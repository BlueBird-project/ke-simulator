# Research — KE Simulator ↔ BlueBird modules

Factual survey of the existing repositories under `c:\proyectos\bluebird`, used
as input for [spec.md](spec.md) and [plan.md](plan.md). Everything here was read
from the repos; no code was modified.

> **Layout gotcha:** each sibling repo nests its real content one level deeper,
> e.g. `c:\proyectos\bluebird\trading-manager\trading-manager\…`.

---

## 1. Knowledge Engine & `ke-pyclient`

- **Package:** `ke_client==0.32.3`, Poetry, `requires-python >=3.9`.
  Deps: `pydantic`, `rdflib`, `pytz`, `orjson`, `unidecode`.
- **KE runtime:** TNO **Smart Connector**, image
  `ghcr.io/tno/knowledge-engine/smart-connector:1.5.0`, REST Developer API.
  - `KE_RUNTIME_PORT: 8280`; reached at `http://<host>:8280/rest/`
    (**must end with `/rest/`**).
- **Client public API (as used by TM):**
  - `KEClient.build(kb_id=None, logger=None)` — factory from global settings.
  - `client.include(ki_holder=<KIHolder>)` — attach interactions.
  - `client.register(bg=False)` / `client.start()` / `client.stop()` /
    `client.is_registered`.
  - Decorators on a `KIHolder`: `@holder.ask(name)`, `@holder.answer(name)`,
    `@holder.post(name)`, `@holder.react(name)`.
  - Direct ops: `client.ask_ke(bindings, ki_id, ki_name) -> KIAskResponse`,
    `client.post_ke(bindings, ki_id, ki_name) -> KIPostResponse`.
  - Handler loop polls `GET {endpoint}sc/handle` (200 handle / 202 heartbeat /
    410 stop); `ask`→`POST sc/ask`, `post`→`POST sc/post`. Headers include
    `Knowledge-Base-Id` and `Knowledge-Interaction-Id`.
- **KI definition:** YAML graph patterns (`ke_config.yml`) with `prefixes`,
  `graph_patterns` (list of RDF triple patterns), `required_bindings`, optional
  `result_pattern` (for ANSWER/REACT), and `include:` of sub-files.
- **Bindings:** `List[Dict[str, str]]`; values are RDF nodes in **N3**
  (`<uri>` or `"value"^^<xsd:…>`). Helper Pydantic models subclass
  `BindingsBase`; `TargetedBindings(bindings=[...], knowledge_bases=[kb_id])`
  targets a specific KB.
- **Config env vars:** `KE_REST_ENDPOINT`, `KE_KNOWLEDGE_BASE_ID`,
  `KE_KI_CONFIG_PATH`, `KE_REASONER_LEVEL` (1–4), `KE_ALLOW_PARTIAL_KI`,
  `KE_VERIFY_SERVER_CERT`, plus ontology validation/extension vars.

---

## 2. Trading Manager (TM) — already KE-integrated

- **Path:** `trading-manager\trading-manager\tm-service` (Python / FastAPI).
- **Deps:** `fastapi`, `uvicorn`, `pydantic`, `rdflib==7.5.0`,
  **`ke_client==0.32.3`**, **`ubflex==0.5`** (BlueBird KI config),
  `effi_onto_tools==0.19.16`, `sqlalchemy`, `psycopg2`, `apscheduler`.
- **KB id:** `http://tm.bluebird.com` (config also shows
  `https://tm.pcss.pl/ke/smartconnector`).
- **KE config:** `tm-service/resources/deployment/ke_config.yaml`, which
  `include`s `ki/dam.yaml` (Day-Ahead Market), `ki/fm.yaml` (FM interaction),
  `ki/dt.yaml` (Digital Twin).
- **Known graph patterns (reusable seams):**
  - `tm-info` — discover TM service, its operations and observed markets.
  - `tou-price` — time-of-use price data points (per 15-min ISP, EUR/MWh).
  - `tou-price-info-filtered` — locate price time-series URIs + metadata.
  - `tm-market-offer` — market offer time-series (price bids).
- **Prefixes in use:** `rdf`, `s4ener` (SAREF4ENER), `saref`, `time`,
  `ubmarket` (`https://ubflex.bluebird.eu/market/`), `kb` (`${KB_ID}/`).
- **Example handlers:** `tm-service/examples/ki/fm_interactions.py` shows
  `@fm_ki.answer("fm-ts-info-request")`, `@fm_ki.answer("fm-ts")`,
  `@fm_ki.ask("tm-info")`, `@fm_ki.post("fm-ts-evaluate")`, and a `find_tm()`
  discovery helper. `smart_client.py` shows `KEClient.build()` + background
  register/start.
- **Runtime (compose/local_dev/compose.yaml):**
  - `tm-service` REST `9090:8080`, depends on `tm-ke-service`, `tm-db`,
    `entsoe-service`; env `KE_REST_ENDPOINT=http://tm-ke-service:8280/rest/`.
  - `tm-ke-service` = `smart-connector:1.5.0`, ports `8280:8280`.
  - `tm-db` = `postgres`, `5432`. `entsoe-service` (price source) `11001:8080`.
  - External Docker network `local_tm-net`.
  - App flags: `APP_USE_KE_API=True`, `APP_USE_REST_API=True`,
    `APP_USE_SCHEDULER=True`.

---

## 3. Flexibility Manager (FM) — **no KE yet**

- **Path:** `flexibility-manager\flexibility-manager`.
- **Make-up:** `FlexOPTi/` (Julia MPC controller, port 8080),
  `control_room/` (Python **Flask** dashboard + REST, port 9000),
  `forecasting/dummy/` (Python synthetic forecast, port 5000),
  `dt/` (R Digital Twin), `db/` (SQLite). Orchestrated by
  `docker-compose.ewh.yml` on Docker network `tm-net`.
- **Current integration:** **direct HTTP to TM**, not KE —
  `.env`: `TM_BASE_URL=http://tm-service:9090` (fallback: on-disk price cache,
  valid ~36 h).
- **Control Room REST:** `GET /health`, `/status`, `/metrics`, `/services`,
  `/setpoints`, `/forecasts`, `POST /clear`. `/status` returns MPC state,
  `cost`, control vector `u`, last setpoints.
- **Data:** consumes electricity prices + disturbance forecasts + DT model;
  produces setpoints (compressor power / room temps) and MPC status.
- **KE findings:** no `ke_client` dependency, no `KE_*` env vars, no
  `@ask/@answer/@post/@react`, no `ke_config.yml`. ⇒ To satisfy principle #1,
  FM must be given a KB + KI, **or** be fronted by a temporary stand-in KB.

---

## 4. KE Simulator (this repo) — current state

- React 18 + TS + Vite (dev `5173`, docker `8081` via nginx).
- Everything KE-related is **simulated in memory**:
  - [TradingManagerService.ts](../../src/services/TradingManagerService.ts)
    orchestrates the 13-stage cycle, emitting fabricated events with delays.
  - [FlexibilityManagerService.ts](../../src/services/FlexibilityManagerService.ts)
    returns `500 ± 20 MWh` random.
  - Price/consumption twins apply random noise.
- **Only real external call:**
  [MarketDataService.ts](../../src/services/MarketDataService.ts) → ENTSO-E
  (`A44` day-ahead) via the Vite dev proxy `/entsoe-api`, token server-side
  (`ENTSOE_API_TOKEN`), with mock fallback. Country selectable
  (`BIDDING_ZONES`).
- **Key constraint:** browser JS **cannot** import the Python `ke_client`;
  a server-side companion is required to join the KE.

---

## 5. Design decisions derived from the survey

- **D1 — Server-side KE bridge (REQUIRED).** Add a small Python service using
  `ke_client==0.32.3` that registers the simulator KB and exposes a thin
  API (+ event stream) to the React frontend. Rationale: `ke_client` is Python;
  browsers can't speak the KE Developer API with the required RDF handling.
  Alternatives rejected: (a) re-implement a KE client in TS — large, duplicative,
  risky vs the official pinned client; (b) call TM/FM REST directly — violates
  principle #1.
- **D2 — Reuse TM patterns.** Start from `tm-info`, `tou-price`,
  `tm-market-offer` rather than new vocabulary. Rationale: principle #2/#9 and
  TM already publishes them.
- **D3 — FM stand-in until real FM KE exists.** Model the FM interaction against
  the agreed pattern; back it initially with a stand-in KB so the simulator can
  progress independently (ties to Q2).
- **D4 — Keep ENTSO-E as fallback, prefer KE price producer.** Where TM /
  entsoe-service publishes prices over KE, consume them via KE; otherwise fall
  back to the existing ENTSO-E path (ties to Q3, principle #5).
- **D5 — Pin versions** `ke_client==0.32.3`, `smart-connector:1.5.0`, matching
  TM, to avoid protocol drift.
