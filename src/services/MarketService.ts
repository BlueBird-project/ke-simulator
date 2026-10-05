import { PricePoint } from '../types';

/**
 * Service to handle Market Side price data
 */
export class MarketService {
  private prices: PricePoint[] = [];

  setPrices(prices: PricePoint[]): void {
    this.prices = [...prices];
  }

  getPrices(): PricePoint[] {
    return [...this.prices];
  }

  updatePrice(index: number, price: number): void {
    if (index >= 0 && index < this.prices.length) {
      this.prices[index] = {
        ...this.prices[index],
        price
      };
    }
  }

  clearPrices(): void {
    this.prices = [];
  }
}

export const marketService = new MarketService();
