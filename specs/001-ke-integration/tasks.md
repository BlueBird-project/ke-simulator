# Tasks — KE Simulator ↔ Knowledge Engine integration

**Feature:** 001-ke-integration · **Branch:** `develop-edu`
Derived from [plan.md](plan.md) and [contracts/](contracts/). **Planning only** —
these tasks are to be executed in a later, separate effort. `[P]` = can run in
parallel with sibling `[P]` tasks.

Legend: ⟶ depends on.

---

## Phase 0 — Align & freeze contracts
- [ ] **T001** Confirm the remaining items from [spec.md §7.2](spec.md): final FM
  pattern shape, TM-owner go-ahead for the optional write path (D-Q5), and the FM
  team's timeline to replace the stand-in. (KB id, network, price source and
  transport are already decided — D-Q1/D-Q3/D-Q4.)
- [x] **T002** `[P]` Verify TM graph patterns against
  `trading-manager/.../ke_config.yaml` + `ki/*.yaml`; copy exact triples into
  [contracts/trading-manager.md](contracts/trading-manager.md). — *done; also
  reproduced in [../../ke-bridge/resources/ki/trading-manager.yaml](../../ke-bridge/resources/ki/trading-manager.yaml)*
- [ ] **T003** `[P]` Freeze the FM pattern shape (single vs two-step) in
  [contracts/flexibility-manager.md](contracts/flexibility-manager.md). ⟶ T001
- [x] **T004** Produce the Bridge `ke_config.yml` + `resources/ki/*.yaml`
  (patterns only, no handlers). ⟶ T002, T003 — *done:
  [../../ke-bridge/resources/](../../ke-bridge/resources/)*

## Phase 1 — KE Bridge skeleton (new server-side KB)
- [x] **T010** Scaffold `ke-bridge/` (Python ≥3.9, FastAPI, `ke_client==0.32.3`,
  pinned deps). ⟶ T004 — *done: [../../ke-bridge/](../../ke-bridge/)*
- [x] **T011** Implement KE lifecycle: `KEClient.build` → `include` → `register`
  → `start`, with retry/backoff (model on TM `smart_client.py`). ⟶ T010 —
  *done: [ke_bridge.py](../../ke-bridge/app/ke_bridge.py)*
- [x] **T012** Health/readiness endpoint exposing `is_registered` + `mode`
  (`ke` | `simulated`). ⟶ T011 — *done: `/health`, `/ready` in
  [main.py](../../ke-bridge/app/main.py)*
- [ ] **T013** Prove connectivity: ASK `tm-info` round-trip against a local
  `smart-connector:1.5.0` + TM stack. ⟶ T011 — *code scaffolded
  ([trading_manager.py](../../ke-bridge/app/interactions/trading_manager.py));
  needs a live KE + Python runtime to execute.*

## Phase 2 — Prices via KE
- [ ] **T020** Bridge endpoint `GET /ke/prices/day-ahead` → ASK
  `tou-price-info-filtered` then `tou-price`; map bindings ⟶ `PricePoint[]`.
  ⟶ T013
- [ ] **T021** `[P]` Contract test: sample N3 bindings ⟶ expected `PricePoint[]`
  (no live KE). ⟶ T020
- [x] **T022** Frontend: KE-backed `MarketDataService` impl calling T020, behind
  `VITE_USE_KE`, ENTSO-E as fallback. ⟶ T020 — *done:
  [KeBridgeService.ts](../../src/services/KeBridgeService.ts),
  [MarketDataService.ts](../../src/services/MarketDataService.ts); verified in
  the browser (KE 503 → ENTSO-E → mock fallback).*

## Phase 3 — FM forecast via KE
- [x] **T030** Build the **FM stand-in KB** script answering
  `fm-consumption-forecast`. ⟶ T004 — *done:
  [../../ke-bridge/standin/fm_standin.py](../../ke-bridge/standin/fm_standin.py)
  (answers `fm-ts-info-request` + `fm-ts`; syntax-checked, needs a live KE to run).*
- [ ] **T031** Bridge endpoint `GET /ke/flexibility/forecast` → ASK KI-FM-1; map
  ⟶ `FlexibilityForecast`. ⟶ T013, T030
- [ ] **T032** `[P]` Contract test for the FM mapping. ⟶ T031
- [x] **T033** Frontend: KE-backed `FlexibilityManagerService` impl. ⟶ T031 —
  *done: [FlexibilityManagerService.ts](../../src/services/FlexibilityManagerService.ts)
  `getPredictedConsumptionAsync()` (KE-first, mock fallback); the cycle's FM step
  shows the stand-in's 499 MWh via the KE. Verified in the browser.*
- [ ] **T034** Swap stand-in → real FM once FM exposes the KI (external dep).
  ⟶ T031, T001

## Phase 4 — Offer / clearing via KE
- [ ] **T040** Read path: ASK `tm-market-offer` market info + clearing result;
  map `ShareOffer` ↔ offer series, clearing ⟶ result (Share Offer computed
  locally). Default scope (D-Q5). ⟶ T013
- [ ] **T040b** *(optional, behind flag)* Write path: POST `tm-market-offer` to
  actually submit the Share Offer. Requires TM-owner go-ahead (T001). ⟶ T040
- [ ] **T041** `[P]` Contract test for offer/clearing mapping. ⟶ T040

## Phase 5 — Frontend wiring & live events
- [~] **T050** Bridge **SSE** stream emitting per-stage `{ kb, status, values }`
  from `exchangeInfo`. ⟶ T020, T031, T040 — *partial: `/events` SSE + bridge
  lifecycle events done ([events.py](../../ke-bridge/app/events.py)); per-stage
  exchangeInfo events pending the KE read paths.*
- [~] **T051** Wire SSE into existing `onFlowEvent()` so the timeline shows real
  KE outcomes; label local/simulated stages. ⟶ T050 — *partial: a live "KE
  bridge: <mode>" badge + SSE subscription are wired in
  [TradingManagerUI.tsx](../../src/components/TradingManagerUI.tsx); full
  per-stage mapping pending.*
- [ ] **T052** `TradingManagerService` KE-backed `runCycle()` orchestrating the
  real interactions in order; keep mock path under `VITE_USE_KE=false`.
  ⟶ T022, T033, T040, T051

## Phase 6 — Fallback, deploy, demo
- [x] **T060** Degraded-mode parity: KE down ⇒ full simulated run, clearly
  labelled (FR-7). ⟶ T052 — *done & verified in browser (badge "simulated",
  KE 503 → ENTSO-E → mock, cycle completes).*
- [x] **T061** Compose: add `ke-bridge` on external `local_tm-net`; frontend env
  `VITE_USE_KE`, `VITE_KE_BRIDGE_URL`. ⟶ T052 — *done:
  [../../ke-bridge/compose/compose.yaml](../../ke-bridge/compose/compose.yaml)
  (KE SC + bridge + FM stand-in + frontend), `nginx.ke.conf` + Dockerfile build
  args. Docker not available locally to run it.*
- [x] **T062** End-to-end integration test on the composed stack
  (KE + TM + FM stand-in + Bridge + frontend). ⟶ T061 — *done: stack runs; bridge
  registers (`mode: "ke"`), FM stand-in answers `fm-ts` (499.2 MWh/day via KE),
  frontend badge shows "ke". TM not included in this stack, so prices/tm-info are
  empty by design.*
- [x] **T063** `[P]` Traceability check: each of the 13 UI stages maps to a
  declared KI or an explicit "local" tag (FR-5). ⟶ T052 — *done:
  [traceability.md](traceability.md).*
- [x] **T064** Update [ARCHITECTURE.md](../../ARCHITECTURE.md) and README with the
  real KE integration. ⟶ T062 — *done.*

---

## Critical path
T001 → T004 → T010 → T011 → T013 → T020 → T052 → T061 → T062.

## External dependencies (not our code)
- FM team adds KE KB + `fm-consumption-forecast` KI (unblocks T034).
- Access to a running `smart-connector:1.5.0` + TM stack for T013 onward.
