import { PricePoint } from '../types';

/**
 * Simulates the *price-forecast* Digital Twin from Tomek's "KE Simulator 2"
 * slide (distinct from the consumption Digital Twin from the Spanish
 * meeting with Edu): REACTs to the Market Service's day-ahead price POST
 * and then POSTs its own price forecast, which the Trading Manager combines
 * with the Flexibility Manager's demand forecast to build its Share Offer.
 */
export class PriceForecastDigitalTwinService {
  forecastDayAheadPrices(marketPrices: PricePoint[]): PricePoint[] {
    return marketPrices.map(point => ({
      ...point,
      // The forecast is never perfect: +/-15% noise around the real price.
      price: Math.max(10, Math.round(point.price * (0.85 + Math.random() * 0.3) * 100) / 100)
    }));
  }
}

export const priceForecastDigitalTwinService = new PriceForecastDigitalTwinService();
