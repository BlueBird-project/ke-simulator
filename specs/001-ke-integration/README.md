# 001 · KE Simulator — Real Knowledge Engine Integration

Spec-driven **planning** package (no implementation). Goal: connect the
`ke-simulator` to the real `trading-manager` and `flexibility-manager` modules,
with **all** communication going through the Knowledge Engine.

Read in this order:

1. [spec.md](spec.md) — WHAT & WHY: scenarios, requirements, principles, open
   questions, risks.
2. [research.md](research.md) — factual survey of `ke-pyclient`, `trading-manager`,
   `flexibility-manager`, and the resulting design decisions.
3. [plan.md](plan.md) — HOW: architecture (KE Bridge), components, per-module
   connection plan, phasing, testing, traceability.
4. Contracts (the per-module connection detail):
   - [contracts/knowledge-engine.md](contracts/knowledge-engine.md) — shared KE
     transport (connection, lifecycle, bindings).
   - [contracts/trading-manager.md](contracts/trading-manager.md) — reuse of TM's
     `tm-info` / `tou-price` / `tm-market-offer` patterns.
   - [contracts/flexibility-manager.md](contracts/flexibility-manager.md) —
     `fm-consumption-forecast` (with interim stand-in).
5. [tasks.md](tasks.md) — ordered, dependency-aware work breakdown.

**Key constraints:** KE-only communication; reuse BlueBird ontologies
(SAREF / SAREF4ENER / ubmarket); a server-side **KE Bridge** (Python + `ke_client`)
is required because the browser can't use the Python client; graceful fallback to
the current simulated behaviour.

**Decisions taken** (see [spec.md §7](spec.md)): simulator KB id
`http://simulator.bluebird.com` on the shared `local_tm-net` network (D-Q1);
build an **FM stand-in KB** (D-Q2); prices flow **via KE** from TM's `tou-price`,
ENTSO-E as fallback only (D-Q3); **SSE** transport to the UI (D-Q4); offer scope
is **read-only first**, write path optional later (D-Q5).

**Remaining to confirm with owners** ([spec.md §7.2](spec.md)): exact FM pattern
shape, TM go-ahead for the optional write path, and the FM team's timeline to
replace the stand-in.
