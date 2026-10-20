# Contract — Simulator ↔ Flexibility Manager (via KE)

Knowledge Interaction for the simulator to obtain the **predicted consumption**
from the Flexibility Manager through the KE, replacing the current random value
in [FlexibilityManagerService.ts](../../../src/services/FlexibilityManagerService.ts).
Shared transport details: [knowledge-engine.md](knowledge-engine.md).

> **Dependency (D-Q2, committed):** FM currently has **no** KE integration (see
> [../research.md](../research.md) §3). We therefore build a **temporary FM
> stand-in KB** that answers this pattern, so the simulator progresses
> independently; replacing it with the real FM KB is an external dependency. The
> pattern below intentionally mirrors TM's FM-facing conventions
> (`fm-ts-info-request`, `fm-ts`) so the real FM can adopt it with minimal work.

Planning only.

---

## KI-FM-1 · Predicted consumption — `fm-consumption-forecast` (ASK)

- **Simulator role:** consumer (ASK). **FM role (or stand-in):** ANSWER.
- **Purpose:** the Trading Manager cycle's "ASK Flexibility Manager" step —
  retrieve predicted consumption (MWh) per 15-min ISP for the target day.
- **Required bindings:** `period_start`, `period_end` (xsd:dateTime).
- **Pattern (proposed, SAREF4ENER time-series shape, aligned with TM `fm-ts`):**
  ```
  ?ts_uri rdf:type s4ener:TimeSeries .
  ?ts_uri s4ener:producedBy kb:service .
  ?ts_uri s4ener:hasUsageType s4ener:Consumption .
  ?dp s4ener:belongsToTimeSeries ?ts_uri ; rdf:type s4ener:DataPoint ;
      saref:hasTimestamp ?ts ; s4ener:hasEffectivePeriod ubmarket:period_15m .
  ?dpr saref:hasValue ?value ; saref:isMeasuredIn ubmarket:MegawattHour .
  ```
- **Returns:** data points `{ ?ts, ?value }` (predicted MWh per ISP).
- **Mapping to simulator type:**
  | RDF | `FlexibilityForecast` |
  |-----|-----------------------|
  | Σ `?value` over the horizon (or per-ISP series) | `predictedConsumptionMWh` |
- **UI stages:** `trading-manager-ask-fm` (ASK), `flexibility-manager-answer`
  (FM's ANSWER → value rendered).

---

## Alternative shape (if FM mirrors TM's request/response pair)

TM's examples use a two-step `fm-ts-info-request` (discover series) then `fm-ts`
(fetch points). If FM adopts the same convention, KI-FM-1 splits into:

1. **`fm-ts-info-request` (ASK)** → returns `?ts_uri` for `s4ener:Consumption`
   over `[period_start, period_end]`.
2. **`fm-ts` (ASK)** with `ts_uri` → returns the `{ ?ts, ?value }` data points.

Decision between the single-pattern and two-step shapes is **frozen with the FM
owner** before implementation; the Bridge code path is the same either way.

---

## Stand-in behaviour (interim)

While real FM KE support is pending, a minimal `ke_client` script registers KB
`http://fm.bluebird.com` and `@answer("fm-consumption-forecast")` returns a
plausible consumption series (e.g. baseline 500 MWh/day shaped per ISP). This
lets the simulator exercise the **real KE path** end-to-end without FM code.

---

## Stage → interaction map (FM side)

| UI stage | KI |
|----------|----|
| `trading-manager-ask-fm` | KI-FM-1 (ASK) |
| `flexibility-manager-answer` | KI-FM-1 ANSWER (FM / stand-in) |
| `consumption-twin-*` | **local/simulated** (no real module) |
