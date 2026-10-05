export interface PricePoint {
  startTime: string;
  endTime: string;
  price: number;
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
