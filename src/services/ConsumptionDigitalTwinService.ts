import { TradingScenario } from '../types';

/**
 * Simulates the *consumption* Digital Twin from the Spanish meeting with
 * Edu (distinct from the price-forecast Digital Twin in Tomek's slide):
 * reveals how much energy is actually consumed once the delivery day
 * arrives, deviating from the day-ahead plan. The scenario picks the
 * deviation direction so both cases (shortfall / surplus) can be
 * demonstrated on demand.
 */
export class ConsumptionDigitalTwinService {
  simulateActualConsumption(plannedMWh: number, scenario: TradingScenario): number {
    const deviationRatio = 0.1 + Math.random() * 0.1; // 10-20% deviation
    const delta = plannedMWh * deviationRatio;
    const actual = scenario === 'shortfall' ? plannedMWh + delta : plannedMWh - delta;
    return Math.round(Math.max(0, actual));
  }
}

export const consumptionDigitalTwinService = new ConsumptionDigitalTwinService();
