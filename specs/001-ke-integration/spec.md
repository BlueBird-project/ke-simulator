# Feature Specification: KE Simulator — Real Knowledge Engine Integration

**Feature ID:** 001-ke-integration
**Branch:** `develop-edu`
**Status:** Draft (planning only — no implementation)
**Created:** 2026-10-05

> This is a **spec-driven planning** document. It describes **WHAT** we want and
> **WHY**, independent of implementation details. The **HOW** lives in
> [plan.md](plan.md), the integration contracts in [contracts/](contracts/), and
> the work breakdown in [tasks.md](tasks.md). The factual survey of the existing
> modules is in [research.md](research.md).

---

## 1. Summary

Today the `ke-simulator` React app **simulates** the whole day-ahead / intraday
trading cycle in the browser using in-memory services with random data (see
[TradingManagerService.ts](../../src/services/TradingManagerService.ts),
[FlexibilityManagerService.ts](../../src/services/FlexibilityManagerService.ts)).

We want the simulator to **talk to the real BlueBird modules** —
`trading-manager` (TM) and `flexibility-manager` (FM) — and to do so **only
through the Knowledge Engine (KE)**, never via direct point-to-point HTTP to
those modules. The only "real" external call that already exists (ENTSO-E
day-ahead prices in [MarketDataService.ts](../../src/services/MarketDataService.ts))
stays, but even market prices should be obtainable through the KE where a
producer (TM / entsoe-service) publishes them.

---

## 2. Guiding principles (constitution)

These are hard constraints for every design decision in this feature:

1. **KE-only communication.** All inter-module data exchange happens through the
   Knowledge Engine via Knowledge Interactions (ASK / ANSWER / POST / REACT).
   No direct REST calls from the simulator to TM or FM business endpoints.
2. **Shared vocabulary.** Data is modelled with the agreed ontologies already in
   use by TM: SAREF, SAREF4ENER (`s4ener`), and the BlueBird market vocabulary
   (`ubmarket` / `ubflex`). We reuse existing graph patterns before inventing
   new ones.
3. **Each module keeps its identity.** Every participant registers its own
   Knowledge Base (KB) with the KE: TM = `http://tm.bluebird.com`,
   FM = `http://fm.bluebird.com`, simulator = a new KB id.
4. **Non-invasive to the UI contract.** The React components keep their current
   service-level interfaces; only the implementation behind them changes from
   "mock" to "KE-backed".
5. **Graceful degradation.** If the KE or a module is unavailable, the simulator
   falls back to the current mock behaviour so the demo never breaks (same
   philosophy as the ENTSO-E fallback that already exists).
6. **No secrets in the browser.** KE credentials / tokens stay server-side, as
   is already done for the ENTSO-E token.

---

## 3. Actors

| Actor | Description | KB id |
|-------|-------------|-------|
| **Simulator** | The React/TS app (and its server-side companion) acting as a KE participant | `http://simulator.bluebird.com` |
| **Trading Manager (TM)** | Existing module, already a KE participant | `http://tm.bluebird.com` |
| **Flexibility Manager (FM)** | Existing module, **not yet** a KE participant | `http://fm.bluebird.com` |
| **Knowledge Engine (KE)** | TNO Smart Connector runtime that routes Knowledge Interactions | — (REST at `:8280/rest/`) |
| **Market price source** | `entsoe-service` / ENTSO-E as a price producer | — |

---

## 4. User scenarios

### Scenario A — Run a trading cycle against the real TM
**As** a demo operator, **I want** to press "Simulate day-ahead shortfall/surplus"
**so that** the cycle uses real prices and a real Trading Manager response via the KE.

Acceptance (Given/When/Then):
- **Given** the KE and TM are running and registered,
- **When** I start a scenario in the simulator,
- **Then** the simulator obtains day-ahead prices and TM market/offer data
  **through KE Knowledge Interactions**, and the timeline shows real exchange
  outcomes (per-KB `SUCCEEDED`/`FAILED`) instead of fabricated messages.

### Scenario B — Get a real flexibility forecast from FM
**As** a demo operator, **I want** the "ASK Flexibility Manager" step to query the
real FM **through the KE** **so that** the predicted consumption is real, not random.

Acceptance:
- **Given** FM is registered as a KB and exposes a consumption/flexibility KI,
- **When** the cycle reaches the FM step,
- **Then** the simulator issues a KE **ASK** (or POST/REACT) and renders the
  value returned by FM.

### Scenario C — Observe KE routing live
**As** a viewer, **I want** the flow diagram/timeline to reflect **actual** KE
exchanges **so that** the educational value is preserved with real data.

Acceptance:
- Each stage maps to a concrete KE interaction and shows its real status and the
  responding KB id.

### Scenario D — Degraded mode
**As** an operator at a venue with no KE, **I want** the app to still run
**so that** the demo works offline.

Acceptance:
- **Given** the KE is unreachable,
- **When** I start a scenario,
- **Then** the app falls back to the current simulated behaviour and clearly
  labels the run as "simulated".

---

## 5. Functional requirements

- **FR-1** The simulator MUST register a Knowledge Base with the KE Smart
  Connector and register its Knowledge Interactions on startup.
- **FR-2** The simulator MUST obtain day-ahead (and intraday where available)
  prices via a KE interaction with a price-producing KB (TM / entsoe-service).
- **FR-3** The simulator MUST obtain the predicted consumption / flexibility
  from FM via a KE interaction.
- **FR-4** The simulator MUST be able to submit/observe a market offer
  (Share Offer) and clearing result via KE interactions with TM.
- **FR-5** Every stage shown in the UI MUST correspond to a real KE interaction
  and display the real per-KB exchange status.
- **FR-6** The system MUST NOT call TM or FM business REST endpoints directly for
  data that is available through the KE.
- **FR-7** The system MUST fall back to simulated data when the KE or a required
  producer is not available, and MUST indicate this state in the UI.
- **FR-8** KE connection settings (endpoint, KB id, KI config path, any
  credentials) MUST be configurable via environment and MUST NOT be exposed to
  browser code.
- **FR-9** The integration MUST reuse existing TM graph patterns
  (`tm-info`, `tou-price`, `tm-market-offer`, …) and the shared BlueBird
  ontology terms rather than defining parallel ones.

---

## 6. Out of scope (this feature)

- Implementing **production** KE support **inside** the Flexibility Manager repo.
  FM currently has **no** KE integration; the real wiring is a separate task for
  the FM team (tracked as a risk, §8). We **do** build a lightweight **FM
  stand-in KB** (decision D-Q2) to unblock the simulator, but that is a test
  double, not the real FM.
- Changing TM's existing graph patterns or business logic.
- Production deployment hardening, auth between simulator-frontend and its
  server companion, and multi-tenant concerns.
- Writing any application code — this deliverable is **planning only**.

---

## 7. Resolved decisions

These were open questions; now decided (2026-10-05):

- **D-Q1 — Simulator KB id & network.** Register as
  `http://simulator.bluebird.com`. The KE Bridge **joins the existing external
  Docker network** (`local_tm-net`, shared with TM/FM) and reaches the Smart
  Connector by service name at `http://tm-ke-service:8280/rest/`. Rationale: a KB
  id is just a unique identifier following the `*.bluebird.com` convention;
  joining the shared network avoids exposing KE ports and lets the Bridge talk to
  the same SC as TM.
- **D-Q2 — FM stand-in (committed).** We build a **temporary FM stand-in KB** that
  answers the agreed consumption pattern, so the simulator is developed and
  demoed independently. Swapping to the real FM remains an external dependency.
- **D-Q3 — Prices via KE.** Day-ahead (and intraday where available) prices come
  **through the KE** from TM's `tou-price` producer. The existing direct ENTSO-E
  call is demoted to a **fallback only** (degraded mode, principle #5).
- **D-Q4 — Transport: SSE.** The Bridge pushes live KE exchange events to the
  React UI via **Server-Sent Events**.
- **D-Q5 — Offer scope: read-only first, write optional.** For the demo the
  simulator **reads** TM market/price/clearing info (ASK) and computes the Share
  Offer locally. Actually **writing** a Share Offer to TM (POST `tm-market-offer`)
  is an **optional later phase** behind a flag, pending TM-owner confirmation that
  it accepts simulator offers in a sandbox market. See §7.1.

### 7.1 Offer scope — implications

| Option | Pros | Cons |
|--------|------|------|
| **Read-only** (default) | No side effects on TM; safe for repeated live demos; no auth / market-session timing; simplest | Share Offer & clearing shown are computed locally, not a real TM transaction (partially simulated) |
| **Write path** (optional) | Fully real end-to-end bidding + clearing via KE; highest fidelity / educational value | Mutates TM state (orders/offers); needs TM to accept offers from the simulator KB; day-ahead gate-closure timing; handling of rejected offers; idempotency across demo runs; coordination/permissions with TM owner; higher live-demo failure risk |

**Chosen:** start read-only; add the write path later behind a Bridge/frontend
flag.

### 7.2 Still to confirm with owners

- Exact FM consumption pattern shape (single-pattern vs TM's two-step
  `fm-ts-info-request` + `fm-ts`) — see
  [contracts/flexibility-manager.md](contracts/flexibility-manager.md).
- TM-owner go-ahead for the optional write path (D-Q5) in a sandbox market.
- FM team's timeline to replace the stand-in with the real FM KB.

---

## 8. Risks & dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| FM has **no** KE integration yet | Scenario B can't use a real FM | Temporary FM stand-in KB (Q2); track FM KE work as external dependency |
| Browser can't run Python `ke_client` | Direct integration impossible | Introduce a server-side KE bridge (see [plan.md](plan.md)) |
| Ontology/pattern mismatch | Interactions silently return no bindings | Reuse TM's published patterns; validate graph patterns against BlueBird ontology |
| KE/module version drift | Interactions fail at runtime | Pin `ke_client==0.32.3` and `smart-connector:1.5.0` as TM does |

---

## 9. Success criteria

- A documented, reviewed plan and KI contracts that the team agrees on.
- A traceable mapping from each of the simulator's 13 UI stages to a concrete KE
  interaction (or an explicit "local/simulated" label).
- Clear, ordered tasks that can be executed later without re-deciding
  architecture.
