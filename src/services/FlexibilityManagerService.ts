import { FlexibilityForecast } from '../types';

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
}

export const flexibilityManagerService = new FlexibilityManagerService();
