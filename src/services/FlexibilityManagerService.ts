import { FlexibilityForecast } from '../types';
import { keBridgeEnabled, getFlexibilityForecastViaKe } from './KeBridgeService';

/**
 * Simulates the Flexibility Manager's ANSWER to the Trading Manager's ASK
 * for the predicted consumption of the next day.
 */
export class FlexibilityManagerService {
  private readonly baselineMWh = 500;

  getPredictedConsumption(): FlexibilityForecast {
    const noise = (Math.random() - 0.5) * 40; // +/- 20 MWh forecast noise
    return { predictedConsumptionMWh: Math.round(this.baselineMWh + noise) };
  }

  // Prefers the KE (decision D-Q2) when enabled, falling back to the local mock.
  async getPredictedConsumptionAsync(): Promise<FlexibilityForecast> {
    if (keBridgeEnabled) {
      try {
        const mwh = await getFlexibilityForecastViaKe();
        if (Number.isFinite(mwh) && mwh > 0) {
          return { predictedConsumptionMWh: Math.round(mwh) };
        }
      } catch (error) {
        console.warn('[FlexibilityManagerService] Falling back to mock forecast:', error);
      }
    }
    return this.getPredictedConsumption();
  }
}

export const flexibilityManagerService = new FlexibilityManagerService();
