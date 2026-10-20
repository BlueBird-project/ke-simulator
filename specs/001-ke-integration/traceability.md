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
