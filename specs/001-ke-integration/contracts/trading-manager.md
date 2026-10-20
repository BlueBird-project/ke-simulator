# Contract — Simulator ↔ Trading Manager (via KE)

Knowledge Interactions between the simulator (consumer/producer) and the
**already KE-integrated** Trading Manager (`http://tm.bluebird.com`). Reuses TM's
**existing** published patterns — we do not invent parallel ones (principle #9).
Shared transport details: [knowledge-engine.md](knowledge-engine.md).

Planning only. Pattern bodies below mirror TM's
`tm-service/resources/deployment/ke_config.yaml` and `ki/*.yaml`; confirm exact
triples against that file before implementation.

---

## KI-TM-1 · Discover TM — `tm-info` (ASK)

- **Simulator role:** consumer (ASK). **TM role:** ANSWER.
- **Purpose:** bootstrap — learn TM's KB id, service URI, operations, observed
  markets, so later interactions can target it.
- **Pattern (TM-published):**
  ```
  kb:service rdf:type saref:Service .
  kb:service saref:hasOperation ?command_uri .
  ?command_uri saref:observes ?market_uri .
  ```
- **Returns:** `{ tm_uri, market_uri, command_uri, kb_id }` (cf. TM `find_tm()`).
- **UI stage:** bootstrap (not shown as a numbered stage).

---

## KI-TM-2 · Locate price series — `tou-price-info-filtered` (ASK)

- **Simulator role:** consumer. **TM role:** ANSWER.
- **Purpose:** find the time-series URI + metadata (period, creation time,
  update rate) for the day-ahead prices before fetching points.
- **Pattern (TM-published):**
  ```
  ?tou_uri rdf:type ?ts_type .
  ?tou_uri s4ener:producedBy kb:service .
  ?tou_uri s4ener:hasUpdateRate ${ISP_UNIT} .
  ?tou_uri s4ener:hasCreationTime ?time_create .
  ?tou_uri s4ener:hasEffectivePeriod ?tou_period_uri .
  ?tou_period_uri rdf:type time:Interval ; time:hasXSDDuration ?tou_period .
  ```
- **Returns:** one or more `?tou_uri` with metadata.

---

## KI-TM-3 · Fetch prices — `tou-price` (ASK)

- **Simulator role:** consumer. **TM role:** ANSWER.
- **Purpose:** retrieve the 96 × 15-min day-ahead price data points for a series.
- **Required binding:** `tou_uri`.
- **Pattern (TM-published):**
  ```
  ?tou_uri rdf:type ?ts_type .
  ?tou_uri s4ener:producedBy kb:service .
  ?dp s4ener:belongsToTimeSeries ?tou_uri ; rdf:type s4ener:DataPoint ;
      saref:hasTimestamp ?ts ; s4ener:hasEffectivePeriod ubmarket:period_15m .
  ubmarket:period_15m time:hasXSDDuration ${ISP_UNIT} .
  ?dpr saref:hasValue ?value ; saref:isMeasuredIn ubmarket:EURPerMegawattHour .
  ```
- **Mapping to simulator type:**
  | RDF | `PricePoint` |
  |-----|--------------|
  | `?ts` (xsd:dateTime) | `startTime` (+ 15 min ⇒ `endTime`) |
  | `?value` (EUR/MWh) | `price` |
- **UI stages:** `market-service-ask-external`, `market-service-post-prices`
  (both resolve to this real ASK instead of the current ENTSO-E direct call;
  per decision **D-Q3**, ENTSO-E is kept as **fallback only**).

---

## KI-TM-4 · Market offer — `tm-market-offer` (POST / observe)

- **Simulator role:** producer (POST) and/or consumer of the result.
  **TM role:** REACT/ANSWER.
- **Purpose:** submit the Share Offer and read the day-ahead clearing outcome.
- **Required binding:** `command_uri` (from KI-TM-1).
- **Pattern (TM-published):**
  ```
  ?market_uri rdf:type ?market_type .
  ?offer_uri rdf:type ubmarket:MarketTimeSeries .
  ?offer_uri ubmarket:hasMarketSequence ?sequence .
  ?offer_uri s4ener:producedBy ?market_uri .
  kb:service saref:hasOperation ?command_uri .
  ```
- **Mapping:** simulator `ShareOffer { volumeMWh, maxPrice, clearingPrice }`
  ⇄ offer time-series + sequence; clearing read back from the result bindings.
- **UI stages:** `trading-manager-share-offer`, `market-day-ahead-cleared`,
  `market-intraday-cleared`.
- **Scope note:** per decision **D-Q5**, the demo defaults to **read-only**
  (read market info + clearing, compute the Share Offer locally). The **write**
  path (actually POSTing an offer) is an optional later phase behind a flag,
  pending TM-owner confirmation it accepts simulator offers in a sandbox market.

---

## Stage → interaction map (TM side)

| UI stage | KI |
|----------|----|
| (bootstrap) | KI-TM-1 `tm-info` |
| `market-service-ask-external` | KI-TM-2 + KI-TM-3 |
| `market-service-post-prices` | KI-TM-3 result |
| `trading-manager-share-offer` | KI-TM-4 (POST) |
| `market-day-ahead-cleared` | KI-TM-4 (result) |
| `market-intraday-cleared` | KI-TM-4 (result, intraday seq) |
| `trading-manager-react-*`, twin stages | **local/simulated** (§3.3 of plan) |
