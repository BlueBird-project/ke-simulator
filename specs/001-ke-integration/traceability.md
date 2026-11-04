# Traceability — UI stages → Knowledge Interactions

Task **T063**. Maps each of the Trading Manager cycle's 13 UI stages
([TradingStage](../../src/types/index.ts)) to a concrete KE interaction or an
explicit **local/simulated** label (requirement **FR-5**). Contracts:
[contracts/trading-manager.md](contracts/trading-manager.md),
[contracts/flexibility-manager.md](contracts/flexibility-manager.md).

| # | UI stage | KE interaction | Kind | Counterpart |
|---|----------|----------------|------|-------------|
| 1 | `market-service-ask-external` | KI-TM-2 `tou-price-info-filtered` + KI-TM-3 `tou-price` (ASK) | **KE** | TM (price producer) |
| 2 | `market-service-post-prices` | KI-TM-3 `tou-price` result | **KE** | TM |
| 3 | `trading-manager-react-prices` | — | local | — |
| 4 | `price-forecast-twin-react-prices` | — | local (twin) | — |
| 5 | `price-forecast-twin-post-forecast` | — | local (twin) | — |
| 6 | `trading-manager-react-forecast` | — | local | — |
| 7 | `trading-manager-ask-fm` | KI-FM-1 `fm-ts-info-request` + `fm-ts` (ASK) | **KE** | FM (stand-in, D-Q2) |
| 8 | `flexibility-manager-answer` | KI-FM-1 ANSWER | **KE** | FM stand-in |
| 9 | `trading-manager-share-offer` | KI-TM-4 `tm-market-offer` (read, D-Q5); offer computed locally | KE-read / local | TM |
| 10 | `market-day-ahead-cleared` | KI-TM-4 result (read) | KE-read / local | TM |
| 11 | `consumption-twin-actual-usage` | — | local (twin) | — |
| 12 | `trading-manager-intraday-correction` | intraday price not served over KE yet → computed locally | local | — |
| 13 | `market-intraday-cleared` | — | local | — |

## Summary
- **KE-backed:** stages 1, 2 (prices), 7, 8 (FM forecast). Stages 9–10 read TM
  market info via KE while the offer/clearing value is computed locally (D-Q5
  read-only default).
- **Local/simulated:** the two Digital Twins (price-forecast, consumption), the
  TM/forecast REACT acknowledgements, and the intraday correction — none has a
  real counterpart module today. The UI labels these as simulated (FR-5/FR-7).

## Current wiring status
- Price path (1–2): implemented in [MarketDataService.ts](../../src/services/MarketDataService.ts)
  (KE-first, ENTSO-E/mock fallback). Verified in the browser.
- FM path (7–8): bridge ASK + FM stand-in ANSWER authored; runs once the KE
  stack is up ([../../ke-bridge/compose/](../../ke-bridge/compose/)).
- Offer path (9–10): read contract defined; bridge endpoint pending (task T040).

---

## On-demand price forecast (2026-10-30) — separate flow, not a UI stage

Added `POST /ke/price-forecast/run` on the bridge plus a dedicated frontend
panel ([PriceForecastKePanel.tsx](../../src/components/PriceForecastKePanel.tsx)),
**independent of the 13-stage Trading Manager cycle above**. Contract:
[contracts/price-forecast.md](contracts/price-forecast.md).

| Step | Mechanism | Kind | Counterpart |
|------|-----------|------|-------------|
| ASK day-ahead prices | KI-TM-2/KI-TM-3 (reused, unchanged) | **KE** | `tm-standin` (declared test producer) |
| Call Taimu/FAST (Chronos-2) | plain HTTP, not a KI | HTTP | `taimu-prices` (real Chronos-2, price-specific config) |
| Publish forecast | **new** KI-FORECAST-1 `price-forecast` (POST) | **KE** | any REACT consumer |
| Receive forecast | KI-FORECAST-1 (REACT) | **KE** | `forecast-consumer-standin` (declared test consumer) |

**Verified end-to-end 2026-10-30** with correlation ids `c82f90341544` (curl)
and `e27abb7b6c72` (from the actual UI button) traced through: `ke-bridge` logs
(ASK → HTTP → POST, all four stages), the KE server's own log (`POST-price-forecast`
immediately followed by `InteractionProcessorImpl-forecast-consumer-standin -
Contacting my KB to react to KI <.../REACT-price-forecast>`), the
`forecast-consumer-standin` REACT handler log, and the frontend panel
rendering the same `forecast_uri`/points. Two real third-party pipeline bugs
were found and fixed externally (see contract doc) without touching
`flexibility-manager` (`git status` confirmed clean throughout).

**Declared limitations:** `tm-standin`'s synthetic price curve never goes
negative in this run (unit tests cover negative-price handling separately);
FM is not touched by this flow (no real KE integration there yet); Adrián's
`PriceFM_Plus` model is WIP and not used (generic Chronos-2 used instead).

---

## Reactive price forecast (2026-10-30, same day) — supersedes the ASK-only version above for the "requested flow" criterion

The on-demand version above was ASK-triggered (orchestrated by the frontend
button), not matching the originally requested
`POST prices → REACT → forecast → POST → REACT` flow. This revision adds a
**fully automatic** path alongside it (manual ASK path kept, unchanged, for
diagnostics). Contract: [contracts/price-forecast.md](contracts/price-forecast.md)
("Reactive revision" section).

| Step | Mechanism | Kind | Counterpart |
|------|-----------|------|-------------|
| Publish day-ahead prices | **new** `@market_ki.post("tou-price")` - reuses KI-TM-3's pattern verbatim | **KE** | `market-service-standin` (declared TEST producer, publishes every 90s) |
| React to prices | **new** `@tm_ki.react("tou-price")` (same pattern, same KIHolder as the existing ASK) | **KE** | `ke-bridge` (Forecast Smart Connector) |
| Call Taimu/FAST (Chronos-2) | plain HTTP, run in a background thread (see below) | HTTP | `taimu-prices` |
| Publish forecast | KI-FORECAST-1 `price-forecast` (POST, reused unchanged) | **KE** | any REACT consumer |
| Receive forecast | KI-FORECAST-1 (REACT, reused unchanged) | **KE** | `forecast-consumer-standin` |

**Historical series source:** the incoming POST's own 96 DataPoint bindings
(same shape as the ASK path) - no separate lookup needed.

**Real bug found and fixed:** the KE's POST/REACT exchange has its own ack
timeout, shorter than Taimu's ~15-25s inference - a synchronous REACT handler
caused the producer's own `post_ke()` to fail with `TimeoutException`. Fixed
by de-duping synchronously (by `tou_uri`) then running the Taimu/publish
pipeline in a background daemon thread so the REACT ack returns immediately.

**Verified end-to-end, fully automatic (no frontend button pressed)** with
correlation ids `7c1f11e6bd5f` and `ca9b4f349f26`: `market-service-standin`
POST → `ke-bridge` REACT (ack in ms) → Taimu HTTP (background, ~15-20s) →
POST `price-forecast` → `forecast-consumer-standin` REACT, all logged with
the same correlation id and additionally surfaced live in
[PriceForecastKePanel.tsx](../../src/components/PriceForecastKePanel.tsx) via
the existing SSE `/events` stream (`trigger: "react-auto"`), confirmed by
browser screenshot showing `[ca9b4f349f26] 96 price pt(s) → 16 forecast pt(s)`
with the manual button untouched.

**Declared limitations:** same as above, plus: the TEST producer injects
data under the literal `http://tm.bluebird.com/service` URI (required by the
reused, unmodified `tou-price` pattern, not a new design choice); replacing
it with a real Market Service requires that service to add a `.post()`
registration (no protocol change needed on the Forecast Smart Connector
side) - see contract doc's "What's pending" section.


