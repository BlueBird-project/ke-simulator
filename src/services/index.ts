import { PriceSignal } from '../types';

/**
 * Service to handle price signals received on Energy Manager
 */
export class EnergyManagerService {
  private lastSignal: PriceSignal | null = null;
  private receivedSignals: PriceSignal[] = [];

  receiveSignal(signal: PriceSignal): void {
    this.lastSignal = signal;
    this.receivedSignals.push(signal);
    // Keep only the last 10 signals
    if (this.receivedSignals.length > 10) {
      this.receivedSignals = this.receivedSignals.slice(-10);
    }
  }

  getLastSignal(): PriceSignal | null {
    return this.lastSignal;
  }

  getReceivedSignals(): PriceSignal[] {
    return [...this.receivedSignals];
  }

  clearHistory(): void {
    this.lastSignal = null;
    this.receivedSignals = [];
  }
}

export const energyManagerService = new EnergyManagerService();
