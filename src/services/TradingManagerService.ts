import { PricePoint, TradingCycleResult, TradingFlowEvent, TradingScenario, TradingStage } from '../types';
import { marketDataService } from './MarketDataService';
import { flexibilityManagerService } from './FlexibilityManagerService';
import { priceForecastDigitalTwinService } from './PriceForecastDigitalTwinService';
import { consumptionDigitalTwinService } from './ConsumptionDigitalTwinService';

type TradingFlowEventCallback = (event: TradingFlowEvent) => void;

function averagePrice(points: PricePoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((acc, p) => acc + p.price, 0) / points.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Orchestrates one day-ahead + intraday trading cycle across the Market
 * Service, the price-forecast Digital Twin, the Trading Manager, the
 * Flexibility Manager and the consumption Digital Twin - all mediated,
 * conceptually, by ASK/POST/ANSWER/REACT Knowledge Interactions on the
 * Knowledge Engine.
 *
 * The day-ahead steps (1-9) follow Tomek's "KE Simulator 2" slide, as
 * confirmed in Edu's email to Tomek:
 *   1. Market Service ASKs the external market (ENTSO-E) for day-ahead prices.
 *   2. Market Service POSTs those prices to the KE.
 *   3. Trading Manager and the price-forecast Digital Twin both REACT to it.
 *   4. The price-forecast Digital Twin POSTs its price forecast to the KE.
 *   5. Trading Manager REACTs to the forecast.
 *   6. Trading Manager ASKs the Flexibility Manager for the predicted demand.
 *   7. Flexibility Manager ANSWERs.
 *   8. Trading Manager POSTs a "Share Offer" (day-ahead) to the Market Service.
 *   9. Market Service POSTs the day-ahead clearing result.
 *
 * The intraday steps (10-12) follow the Spanish meeting with Edu: once the
 * (different) consumption Digital Twin reveals the actual consumption, the
 * Trading Manager corrects the position on the intraday market.
 */
export class TradingManagerService {
  private flowEventCallback: TradingFlowEventCallback | null = null;

  onFlowEvent(callback: TradingFlowEventCallback): void {
    this.flowEventCallback = callback;
  }

  async runCycle(scenario: TradingScenario): Promise<TradingCycleResult> {
    // 1-2. Market Service ASKs the external market and POSTs prices to the KE.
    await this.emit('market-service-ask-external', 'Market Service ASKs the external market (ENTSO-E) for day-ahead prices');
    await this.delay(400);
    const marketPrices = await marketDataService.getDayAheadPrices();
    await this.emit('market-service-post-prices', 'Market Service POSTs day-ahead prices to the Knowledge Engine');
    await this.delay(400);

    // 3. Both Trading Manager and the price-forecast Digital Twin REACT to it.
    await this.emit('trading-manager-react-prices', 'Trading Manager REACTs to the day-ahead prices');
    await this.delay(300);
    await this.emit('price-forecast-twin-react-prices', 'Price-forecast Digital Twin REACTs to the day-ahead prices');
    await this.delay(400);

    // 4-5. The price-forecast Digital Twin POSTs its forecast; TM REACTs to it.
    const forecastPrices = priceForecastDigitalTwinService.forecastDayAheadPrices(marketPrices);
    await this.emit('price-forecast-twin-post-forecast', 'Price-forecast Digital Twin POSTs its price forecast to the Knowledge Engine');
    await this.delay(400);
    await this.emit('trading-manager-react-forecast', 'Trading Manager REACTs to the price forecast');
    await this.delay(400);

    // 6-7. Trading Manager ASKs the Flexibility Manager; it ANSWERs.
    await this.emit('trading-manager-ask-fm', 'Trading Manager ASKs Flexibility Manager for predicted consumption');
    await this.delay(500);
    const forecast = flexibilityManagerService.getPredictedConsumption();
    await this.emit(
      'flexibility-manager-answer',
      `Flexibility Manager ANSWERs: ${forecast.predictedConsumptionMWh} MWh predicted`
    );
    await this.delay(500);

    // 8-9. Trading Manager combines the price forecast + demand forecast into
    // a Share Offer (with a safety-filter max price), then the Market Service
    // clears it at the real day-ahead price.
    const priceForecastAvg = round2(averagePrice(forecastPrices));
    const marketDayAheadAvg = round2(averagePrice(marketPrices));
    const shareOffer = {
      volumeMWh: forecast.predictedConsumptionMWh,
      maxPrice: round2(priceForecastAvg * 1.2),
      clearingPrice: marketDayAheadAvg,
      cost: round2(forecast.predictedConsumptionMWh * marketDayAheadAvg)
    };
    await this.emit(
      'trading-manager-share-offer',
      `Trading Manager POSTs Share Offer: buy ${shareOffer.volumeMWh} MWh, max price ${shareOffer.maxPrice} EUR/MWh`
    );
    await this.delay(500);
    await this.emit(
      'market-day-ahead-cleared',
      `Market Service POSTs day-ahead clearing: ${shareOffer.clearingPrice} EUR/MWh`
    );
    await this.delay(500);

    // 10. The consumption Digital Twin reveals the actual usage on delivery day.
    const actualConsumptionMWh = consumptionDigitalTwinService.simulateActualConsumption(
      forecast.predictedConsumptionMWh,
      scenario
    );
    await this.emit(
      'consumption-twin-actual-usage',
      `Consumption Digital Twin reports actual consumption: ${actualConsumptionMWh} MWh`
    );
    await this.delay(500);

    // 11-12. Trading Manager corrects the position on the intraday market.
    const intradayPrices = await marketDataService.getIntradayPrices();
    const intradayAvgPrice = round2(averagePrice(intradayPrices));
    const deltaMWh = round2(actualConsumptionMWh - forecast.predictedConsumptionMWh);
    const side: 'buy' | 'sell' = deltaMWh >= 0 ? 'buy' : 'sell';
    const volumeMWh = round2(Math.abs(deltaMWh));
    const amount = round2(volumeMWh * intradayAvgPrice);

    await this.emit(
      'trading-manager-intraday-correction',
      `Trading Manager POSTs intraday correction: ${side} ${volumeMWh} MWh @ ${intradayAvgPrice} EUR/MWh`
    );
    await this.delay(500);
    await this.emit('market-intraday-cleared', 'Market Service POSTs the intraday clearing result');

    const totalCost = round2(side === 'buy' ? shareOffer.cost + amount : shareOffer.cost - amount);

    return {
      scenario,
      priceForecastAvg,
      marketDayAheadAvg,
      predictedConsumptionMWh: forecast.predictedConsumptionMWh,
      shareOffer,
      actualConsumptionMWh,
      intraday: { side, volumeMWh, avgPrice: intradayAvgPrice, amount },
      totalCost
    };
  }

  private async emit(stage: TradingStage, message: string): Promise<void> {
    const event: TradingFlowEvent = {
      id: `trading-event-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      stage,
      message,
      status: 'success'
    };
    if (this.flowEventCallback) {
      this.flowEventCallback(event);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const tradingManagerService = new TradingManagerService();
