import { PricePoint, PriceSignal, FlowEvent, FlowStage } from '../types';

type FlowEventCallback = (event: FlowEvent) => void;
type PriceUpdateCallback = (signal: PriceSignal) => void;

/**
 * SimulationService orchestrates the entire simulated data flow:
 * Market Side -> Smart Connector Market -> Knowledge Engine -> Smart Connector Energy -> Energy Manager
 */
export class SimulationService {
  private flowEventCallback: FlowEventCallback | null = null;
  private priceUpdateCallback: PriceUpdateCallback | null = null;

  /**
   * Registers a callback to receive flow events
   */
  onFlowEvent(callback: FlowEventCallback): void {
    this.flowEventCallback = callback;
  }

  /**
   * Registers a callback to receive price updates on Energy Manager
   */
  onPriceUpdate(callback: PriceUpdateCallback): void {
    this.priceUpdateCallback = callback;
  }

  /**
   * Publishes prices: starts the data flow through all components
   */
  async publishPrices(pricePoints: PricePoint[]): Promise<void> {
    const signal = this.createSignal(pricePoints);

    // Stage 1: Prices loaded on Market Side
    await this.emitEvent('prices-loaded', `Prices loaded: ${pricePoints.length} intervals`);
    await this.delay(500);

    // Stage 2: Smart Connector Market Side processes
    await this.emitEvent('market-connector-processing', 'Market Side Smart Connector preparing message...');
    await this.delay(600);

    // Stage 3: Knowledge Engine receives
    await this.emitEvent('knowledge-engine-received', 'Knowledge Engine received price POST');
    await this.delay(600);

    // Stage 4: Knowledge Engine routes
    await this.emitEvent('knowledge-engine-routing', 'Knowledge Engine: compatible REACT found on Energy Manager');
    await this.delay(600);

    // Stage 5: Smart Connector Energy Manager receives
    await this.emitEvent('energy-connector-received', 'Energy Manager Smart Connector delivering message');
    await this.delay(600);

    // Stage 6: Energy Manager updates
    await this.emitEvent('energy-manager-updated', 'Energy Manager: prices updated and ready');
    
    // Notify the Energy Manager listener
    if (this.priceUpdateCallback) {
      this.priceUpdateCallback(signal);
    }
  }

  private createSignal(pricePoints: PricePoint[]): PriceSignal {
    return {
      id: `signal-${Date.now()}`,
      timestamp: new Date().toISOString(),
      pricePoints
    };
  }

  private async emitEvent(stage: FlowStage, message: string): Promise<void> {
    const event: FlowEvent = {
      id: `event-${Date.now()}-${Math.random()}`, // Use timestamp + random to avoid duplicates
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

export const simulationService = new SimulationService();
