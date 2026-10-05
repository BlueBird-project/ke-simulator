import { PricePoint, PriceSignal } from '../types';

/**
 * Generates 96 price points for a full day (15-minute intervals)
 * with a realistic curve: low prices at night, peaks in morning/afternoon
 */
export function generateExamplePrices(): PricePoint[] {
  const pricePoints: PricePoint[] = [];
  const basePrice = 50;
  
  for (let i = 0; i < 96; i++) {
    const hour = Math.floor(i / 4);
    const minute = (i % 4) * 15;
    
    // Daily curve: low at night (0-6h), rises in the morning (6-12h),
    // afternoon peak (12-18h), drops at night (18-24h)
    let factor = 1;
    if (hour >= 6 && hour < 9) {
      factor = 1 + (hour - 6) * 0.3; // Morning rise
    } else if (hour >= 9 && hour < 12) {
      factor = 1.9 + (hour - 9) * 0.2; // High plateau
    } else if (hour >= 12 && hour < 15) {
      factor = 2.5; // Peak
    } else if (hour >= 15 && hour < 18) {
      factor = 2.3 - (hour - 15) * 0.2; // Decline
    } else if (hour >= 18 && hour < 21) {
      factor = 1.7 - (hour - 18) * 0.1; // Slow decline
    } else {
      factor = 1.4; // Low nights
    }
    
    // Add variability
    const noise = (Math.random() - 0.5) * 5;
    const price = Math.max(10, basePrice * factor + noise);
    
    const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const endHour = hour + (minute + 15 >= 60 ? 1 : 0);
    const endMinute = (minute + 15) % 60;
    const endTime = `${String(endHour % 24).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    
    pricePoints.push({
      startTime,
      endTime,
      price: Math.round(price * 100) / 100
    });
  }
  
  return pricePoints;
}

/**
 * Parses a CSV with format: startTime,endTime,price
 */
export function parseCSV(content: string): PricePoint[] {
  const lines = content.trim().split('\n');
  const pricePoints: PricePoint[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length >= 3) {
      pricePoints.push({
        startTime: parts[0],
        endTime: parts[1],
        price: parseFloat(parts[2])
      });
    }
  }
  
  return pricePoints;
}

/**
 * Creates a price signal as JSON that will be transmitted
 */
export function createPriceSignal(pricePoints: PricePoint[]): PriceSignal {
  return {
    id: `signal-${Date.now()}`,
    timestamp: new Date().toISOString(),
    pricePoints
  };
}

/**
 * Calculates price statistics
 */
export interface PriceStats {
  count: number;
  min: number;
  max: number;
  average: number;
}

export function calculatePriceStats(pricePoints: PricePoint[]): PriceStats {
  if (pricePoints.length === 0) {
    return { count: 0, min: 0, max: 0, average: 0 };
  }
  
  const prices = pricePoints.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  return {
    count: pricePoints.length,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    average: Math.round(average * 100) / 100
  };
}
