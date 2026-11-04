# Contract — Simulator (Forecast Smart Connector) ↔ Taimu ↔ Consumer (via KE)

New Knowledge Interaction added 2026-10-30 to wire a **real** day-ahead
price forecast through the Knowledge Engine. **Updated same day** with a
second, fully reactive revision (see "Reactive revision" below) once the
first version's ASK-triggered design was found not to match the originally
requested flow (`POST prices → REACT → forecast → POST → REACT`).

Shared transport details: [knowledge-engine.md](knowledge-engine.md).
Price retrieval reuses **KI-TM-2/KI-TM-3** from
[trading-manager.md](trading-manager.md) unchanged.

---

## Reactive revision (2026-10-30, same day) — the requested flow

**Audit findings before implementing:**
- The existing ASK (`app/interactions/trading_manager.py::_ask_tou_price`,
  KI-TM-3) and the new POST (`price_forecast.py`, KI-FORECAST-1 below) were
  the only two KIs touching prices/forecasts; **no REACT on prices existed
  anywhere** in `ke-bridge` or the stand-ins.
- `resources/ki/trading-manager.yaml`'s `tou-price` graph pattern has
  `required_bindings: [tou_uri]` and a fixed (non-variable) `producedBy
  <http://tm.bluebird.com/service>` triple - a KI **name** can be registered
  with *any* interaction type (`ki_name = f"{ki_type}-{name}"`, confirmed in
  `ke_client/ki_model.py`), so the **same pattern already used for ASK/ANSWER
  can be reused verbatim for POST/REACT** - no new semantic protocol needed,
  per the task's explicit instruction.
- No real producer currently POSTs prices (`trading-manager` only
  `.answer()`s, confirmed earlier) - a declared TEST producer was required.

**What changed:**
- `app/interactions/trading_manager.py`: added `@tm_ki.react("tou-price")`
  (`_react_tou_price`) - reuses the **exact same pattern** as the existing
  ASK, in the **same KIHolder**. Refactored the ASK's row-parsing into a
  shared `_points_from_tou_price_rows()` used by both paths.
- `app/ke_bridge.py`: added `handle_incoming_tou_price_react()` (de-dupes by
  `tou_uri`, bounded LRU of 50) and `_run_forecast_from_prices()` (shared
  core extracted from the old `run_price_forecast`, now reused by **both**
  the manual ASK path, `trigger="manual-ask"`, and the automatic REACT path,
  `trigger="react-auto"`). **Historical series source for the reactive
  path**: the incoming POST's own 96 DataPoint bindings *are* the historical
  series (same shape/volume as the ASK path) - no separate history lookup
  needed, since the producer publishes the full day-ahead curve in one POST.
- `standin/market_service_standin.py` (**new**, declared `[TEST]` in every
  log line): independent KB `http://test-market-producer.bluebird.com`
  POSTing a **synthetic** day-ahead curve (96 pts, includes negative prices
  overnight - unlike `tm_standin`'s clamped curve) every 90s via a **real**
  `@market_ki.post("tou-price")`, reusing
  `standin/resources_market_service/ki/trading-manager.yaml` (byte-identical
  pattern to ke-bridge's).
- `ke-bridge/compose/compose.yaml`: added the `market-service-standin`
  service.
- Kept **unchanged**: the manual `/ke/price-forecast/run` endpoint + UI
  button (now labelled "Manual/diagnostic path"), the direct-HTTP Taimu
  panel, `fm-standin`, the price-appropriate Taimu config (no `positive_pv`).

**Real bug found and fixed while testing (not in the original 5-phase task):**
the KE's POST/REACT exchange enforces its own ack timeout, shorter than
Taimu's ~15-25s inference time. A REACT handler that blocks until the
forecast is fully published caused the **producer's** `post_ke()` call to
fail with `TimeoutException` even though the bridge eventually succeeded.
Fix: `handle_incoming_tou_price_react()` now does the de-dupe check
synchronously (must happen before acking, to reject genuine duplicates) then
runs `_run_forecast_from_prices()` in a background `daemon` thread so the
REACT ack returns immediately. Verified: ack now happens in milliseconds,
Taimu/publish finishes afterward on its own correlation_id.

**Verified end-to-end (fully automatic, zero frontend interaction)** with
correlation ids `7c1f11e6bd5f` and `ca9b4f349f26`: TEST producer POST →
ke-bridge REACT ack (immediate) → Taimu HTTP (background) → POST
`price-forecast` → `forecast-consumer-standin` REACT, all traced by log line
and surfaced live in the frontend panel via the existing SSE `/events`
stream (`trigger: "react-auto"`).

---

## Deviation from the task's conceptual diagram (justified)

The original task brief sketched `Market Service --POST--> KE --REACT-->
Forecast SC`. The **real** `trading-manager` code
(`tm-service/tm/modules/ke_interaction/interactions/tm_interactions.py`)
registers `tou-price` and `tou-price-info-filtered` **only** via
`@tm_ki.answer(...)` — an **ASK/ANSWER (pull)** model, not POST/REACT. This
also matches Eduardo's pre-existing `ke_bridge.py`, which already used
`.ask()` for these patterns before this change.

So: **price retrieval stays ASK/ANSWER** (ke-bridge asks, TM/stand-in
answers) — no new pattern, no deviation from real TM behaviour. **POST/REACT
is used for the genuinely new capability**: publishing the *computed
forecast*, for which no official KI existed before.

---

## KI-FORECAST-1 · Publish price forecast — `price-forecast` (POST)

- **ke-bridge role:** producer (POST), via the **Forecast Smart Connector**
  (`app/interactions/price_forecast.py`). **Consumer role:** REACT (any KB,
  e.g. `standin/forecast_consumer_standin.py`).
- **Status:** **new pattern** (2026-10-30). Confirmed absent from UBFlex's
  `ke.graph-patterns/` and from `trading-manager`/`flexibility-manager`'s own
  KI configs (`grep` across both repos returned no `Forecast`/`forecast`
  graph pattern). Reuses only **existing** ontology terms already used by
  `tou-price`/`tm-market-offer` (`s4ener:TimeSeries`, `s4ener:DataPoint`,
  `saref:hasResult`/`hasValue`/`hasTimestamp`,
  `s4ener:producedBy`/`belongsToTimeSeries`, `ubmarket:EURPerMegawattHour`).
  No new RDFS class or property is introduced.
- **Required binding:** `forecast_uri`.
- **Pattern (new, defined in `resources/ki/price-forecast.yaml`, byte-identical
  copy in `standin/resources_forecast_consumer/ki/price-forecast.yaml` so the
  KE reasoner matches POST↔REACT):**
  ```
  ?forecast_uri rdf:type s4ener:TimeSeries ;
      s4ener:producedBy <http://simulator.bluebird.com/service> .
  ?forecast_uri s4ener:hasCreationTime ?time_create .
  ?dp s4ener:belongsToTimeSeries ?forecast_uri ; rdf:type s4ener:DataPoint ;
      saref:hasTimestamp ?ts ; saref:hasResult ?dpr .
  ?dpr saref:hasValue ?value ; saref:isMeasuredIn ubmarket:EURPerMegawattHour .
  ```
- **One binding per forecast point** (not one binding for the whole series):
  `forecast_uri`, `time_create` repeat; `dp`/`dpr` are unique per point
  (`{forecast_uri}/dp/{index}` / `.../dp/{index}/result`); `ts`/`value` carry
  the point's timestamp and EUR/MWh forecast value.
- **Verified end-to-end** 2026-10-30 (correlation ids `c82f90341544`,
  `e27abb7b6c72`, ...): KE server log shows
  `InteractionProcessorImpl-forecast-consumer-standin - Contacting my KB to
  react to KI <.../REACT-price-forecast>` immediately after
  `POST-price-forecast`, proving real reasoner-mediated POST↔REACT matching
  (not just the producer's own log).

---

## Taimu/FAST HTTP call (not a Knowledge Interaction)

Between the ASK (prices in) and the POST (forecast out), `ke-bridge` makes a
**plain HTTP call** (`app/forecasting_client.py`) to the Taimu/FAST API
(`taimu-prices` service, reusing the already-built `fast-forecast-api:latest`
image with a **price-appropriate config**,
`resources/taimu/price_forecast_api_config.json`):
`forges: ["coerce_numeric_y", "interpolate_15min"]`, `translate: ["chronos_2"]`.
Deliberately **excludes** `positive_pv` (would clip negative electricity
prices to 0 — real day-ahead prices can be negative) and `weather_vals`
(irrelevant to price data).

### Two real third-party bugs found and worked around (not in our code)

1. **Timezone-aware timestamps crash the pipeline.** `ChronosTranslate.predict`
   (`FAST/translate/chronos_2.py`) fails with `Cannot change data-type for
   array of references` when `ds` carries a `+00:00` offset (confirmed by
   reproducing it directly against the API with real KE-sourced prices, with
   and without sorting). Fix: `app/interactions/price_forecast.py` strips the
   offset before sending to Taimu (`_to_naive_utc_iso`, prices are UTC-only so
   nothing is lost) and reattaches `+00:00` when parsing Taimu's response
   before publishing to the KE (`_to_utc_iso`, since `xsd:dateTime` requires a
   `T` separator and Taimu returns pandas' space-separated format).
2. **`future_df`'s placeholder `None` values aren't numeric.**
   `ModelInference.run()` (`FAST/fast_inference.py`) builds the forecast
   horizon frame with `future_df["y"] = None` (object dtype). The demo config
   works around this incidentally via `positive_pv`'s `except: return 0`, but
   that forge also clips real negative prices — unacceptable here. Fix: a new,
   **external, minimal forge** (`resources/taimu/forge/coerce_numeric_y.py`,
   `pd.to_numeric(..., errors="coerce")`) is volume-mounted into the existing
   image at `/app/api/forge/coerce_numeric_y.py` — no clipping, no fabricated
   values, `flexibility-manager` repo untouched (confirmed via `git status`
   staying clean throughout).

---

## Test-producer/consumer declaration (per task's explicit requirement)

- **`tm-standin`** (`standin/tm_standin.py`) answers `tm-info`,
  `tou-price-info-filtered`, `tou-price` with a **synthetic** price curve
  (`max(5.0, ...)`-clamped — i.e. **never negative** in this specific test
  run, even though the transform code itself preserves negative prices, as
  covered by `tests/test_price_forecast.py::test_preserves_negative_prices`).
  This stands in for the real, private `trading-manager` service, which is
  not part of this stack. Used only by the manual/diagnostic ASK path.
- **`market-service-standin`** (`standin/market_service_standin.py`, **new**)
  is the TEST producer for the reactive path: POSTs a synthetic day-ahead
  curve (96 pts, deliberately includes negative values overnight) as
  `http://test-market-producer.bluebird.com` every 90s, clearly logged as
  `[TEST]`. Stands in for a real Market Service, which does not yet POST
  prices through the KE.
- **`forecast-consumer-standin`** (`standin/forecast_consumer_standin.py`) is
  a throwaway third KB that only exists to prove decentralised delivery; it
  is not a real BlueBird component.
- **`fm-standin`** is unrelated to this flow (Flexibility Manager has no real
  KE integration yet — confirmed via `ke_integration_options.py` — so this
  forecast flow never touches it).
- Adrián's specialised `PriceFM_Plus` model (TensorFlow, WIP as of
  2026-10-29/30) is **not used**; the generic, already-verified Chronos-2
  pipeline is used instead with a price-specific config. This is a known
  limitation, not a hidden shortcut.

## What's pending to replace the TEST producer with the real Market Service

- Real `trading-manager` would need to add a `.post("tou-price")`
  registration alongside its existing `.answer(...)` ones (same pattern, no
  protocol change) - or a dedicated Market Service component would need to
  own that responsibility instead of TM.
- The reused `tou-price` pattern hardcodes `producedBy
  <http://tm.bluebird.com/service>` - whichever real component POSTs would
  need to either adopt that URI or the pattern would need a (minor,
  coordinated) change to parametrise `producedBy`.
- No changes needed on the Forecast Smart Connector side - it already reacts
  to the pattern regardless of which KB sends it.

