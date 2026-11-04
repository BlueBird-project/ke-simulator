export interface PricePoint {
  startTime: string;
  endTime: string;
  price: number;
}

// --- Taimu forecasting API (flexibility-manager/forecasting, FAST + Chronos-2) ---
// Plain HTTP types for ForecastingApiService. Unrelated to the KE/ENTSO-E types
// above - this is a direct REST integration, not a Knowledge Interaction.

export interface ForecastingHealth {
  status: string;
}

export interface DayAheadForecastRequest {
  horizon_span: number;
  data: {
    ds: string[];
    unique_id: string[];
    y: number[];
  };
}

export interface ForecastResult {
  ds: string[];
  unique_id: string[];
  yhat: number[];
}

// --- Price forecast delivered through the Knowledge Engine (ke-bridge) ---
// Returned by POST /bridge/ke/price-forecast/run. Distinct from
// ForecastResult above (which is the direct-HTTP Taimu panel's own type):
// this one also carries the KE-specific correlation_id/price_points/sources
// so the UI can clearly label it as "via KE", not "HTTP directo".

export interface PriceForecastPoint {
  ds: string;
  yhat: number;
}

export interface PriceForecastKeResult {
  correlation_id: string;
  forecast_uri: string;
  price_points: number;
  forecast: PriceForecastPoint[];
  price_source: string;
  forecast_source: string;
}

// Emitted over the bridge's SSE /events stream when the Forecast Smart
// Connector's `tou-price` REACT auto-triggers a forecast (trigger: react-auto)
// - i.e. with NO frontend button involved. See ke-bridge/app/ke_bridge.py.
export interface PriceForecastAutoEvent {
  type: 'ke';
  ki: 'price-forecast';
  trigger: 'react-auto';
  correlation_id: string;
  price_points?: number;
  forecast_points?: number;
  error?: string;
}

// --- Full run detail: GET /ke/price-forecast/runs/{correlation_id} ---
// Backed by ke-bridge's in-memory run_store (bounded, lost on backend
// restart - see app/run_store.py). Real data only: the actual historical
// points sent to Taimu and the actual yhat points it returned.

export interface PriceForecastInputPoint {
  ts: string; // ISO 8601, UTC
  price: number;
  unit: string; // 'EUR/MWh', confirmed by the tou-price graph pattern
}

export interface PriceForecastOutputPoint {
  ds: string; // ISO 8601, UTC
  yhat: number;
  unit: string;
}

export interface PriceForecastRunStage {
  name: 'prices_received' | 'taimu_request' | 'taimu_response' | 'forecast_published' | string;
  at: number; // unix seconds
  [key: string]: unknown;
}

export interface PriceForecastRunDetail {
  correlation_id: string;
  status: 'running' | 'ok' | 'error';
  trigger: 'manual-ask' | 'react-auto';
  price_source: 'ke-ask' | 'ke-react';
  data_origin: string; // e.g. "market-service-standin (TEST, POST)"
  started_at: number;
  completed_at?: number;
  stages: PriceForecastRunStage[];
  prices?: PriceForecastInputPoint[];
  forecast?: PriceForecastOutputPoint[];
  forecast_uri?: string;
  forecast_source?: string;
  tou_uri?: string; // only present for trigger: react-auto
  date_from?: string; // only present for trigger: manual-ask
  date_to?: string;
  error?: string;
}

export interface PriceSignal {
  id: string;
  timestamp: string;
  pricePoints: PricePoint[];
}

export interface BaseFlowEvent {
  id: string;
  timestamp: string;
  message: string;
  status: 'pending' | 'success' | 'error';
}

export interface FlowEvent extends BaseFlowEvent {
  stage: FlowStage;
}

export type FlowStage = 
  | 'prices-loaded'
  | 'market-connector-processing'
  | 'knowledge-engine-received'
  | 'knowledge-engine-routing'
  | 'energy-connector-received'
  | 'energy-manager-updated';

// --- Trading Manager / Flexibility Manager / Digital Twin cycle ---
// Modeled after Tomek's "KE Simulator 2" slide (English WP5 meeting, relayed
// by Edu's confirmation email) plus the Spanish meeting with Edu:
//
//   1. Market Service ASKs the external market (ENTSO-E) for day-ahead prices.
//   2. Market Service POSTs those prices to the KE.
//   3. Trading Manager and the price-forecast Digital Twin both REACT to it.
//   4. The price-forecast Digital Twin POSTs its price forecast to the KE.
//   5. Trading Manager REACTs to the forecast.
//   6. Trading Manager ASKs the Flexibility Manager for the predicted demand.
//   7. Flexibility Manager ANSWERs.
//   8. Trading Manager POSTs a "Share Offer" (day-ahead) to the Market Service.
//   9. Market Service POSTs the day-ahead clearing result.
//  10. Once delivery day arrives, the consumption Digital Twin reveals the
//      actual consumption (this is a *different* twin than the price one).
//  11. Trading Manager POSTs an intraday correction to close the gap.
//  12. Market Service POSTs the intraday clearing result.

export type TradingStage =
  | 'market-service-ask-external'
  | 'market-service-post-prices'
  | 'trading-manager-react-prices'
  | 'price-forecast-twin-react-prices'
  | 'price-forecast-twin-post-forecast'
  | 'trading-manager-react-forecast'
  | 'trading-manager-ask-fm'
  | 'flexibility-manager-answer'
  | 'trading-manager-share-offer'
  | 'market-day-ahead-cleared'
  | 'consumption-twin-actual-usage'
  | 'trading-manager-intraday-correction'
  | 'market-intraday-cleared';

export interface TradingFlowEvent extends BaseFlowEvent {
  stage: TradingStage;
  // Present only when this stage reused a real price-forecast run (Taimu/
  // Chronos-2 via the KE) instead of the local mock - links back to the
  // SAME run_store/RunDetailPanel used by PriceForecastKePanel (no new
  // detail view). 'REAL' = Chronos-2 via KE, 'MOCK' = local random noise.
  correlationId?: string;
  dataLabel?: 'REAL' | 'MOCK';
}

// A day-ahead shortfall means less was bought than actually needed (topped
// up on intraday); a surplus means more was bought than needed (sold back).
export type TradingScenario = 'shortfall' | 'surplus';

export interface FlexibilityForecast {
  predictedConsumptionMWh: number;
}

export interface ShareOffer {
  volumeMWh: number;
  // Safety-filter ceiling price included in the offer (per the WP5 meeting:
  // "we don't care about the bidding, we just set the highest price").
  maxPrice: number;
  // Actual day-ahead auction clearing price returned by the Market Service.
  clearingPrice: number;
  cost: number;
}

export interface IntradayCorrection {
  side: 'buy' | 'sell';
  volumeMWh: number;
  avgPrice: number;
  amount: number;
}

export interface TradingCycleResult {
  scenario: TradingScenario;
  priceForecastAvg: number;
  marketDayAheadAvg: number;
  predictedConsumptionMWh: number;
  shareOffer: ShareOffer;
  actualConsumptionMWh: number;
  intraday: IntradayCorrection;
  totalCost: number;
}

export interface ConnectorStatus {
  connected: boolean;
  lastUpdated: string;
  messagesProcessed: number;
}
