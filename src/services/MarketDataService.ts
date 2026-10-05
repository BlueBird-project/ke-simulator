import { PricePoint } from '../types';
import { generateExamplePrices } from '../utils/priceUtils';

/**
 * Abstraction over the external day-ahead/intraday price source (ENTSO-E
 * Transparency Platform in production). The real API token lives server-side
 * only (see vite.config.ts's dev proxy at /entsoe-api) and is never bundled
 * into client code. If the real call fails for any reason (proxy/token not
 * configured, network error, zone has no data yet), this falls back to a
 * mock generator so the demo never breaks.
 */
export interface MarketDataProvider {
  getDayAheadPrices(): Promise<PricePoint[]>;
  getIntradayPrices(): Promise<PricePoint[]>;
}

// Non-secret: ENTSO-E bidding zone EIC code. Defaults to Spain (REE), matching
// the pilot discussed in the WP5 meetings.
const BIDDING_ZONE = import.meta.env.VITE_ENTSOE_BIDDING_ZONE || '10YES-REE------0';

function toEntsoeTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

function formatHHmm(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function parseResolutionMinutes(resolution: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(resolution);
  if (!match) return 60;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes || 60;
}

/**
 * Parses an ENTSO-E "Publication_MarketDocument" (documentType A44, day-ahead
 * prices) XML response into our PricePoint[] shape. Throws if the document
 * is an error response (e.g. Acknowledgement_MarketDocument) or has no
 * points, which the caller treats as "no real data available".
 */
function parseEntsoeDayAheadXml(xml: string): PricePoint[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Could not parse the ENTSO-E response as XML');
  }
  if (doc.documentElement.tagName.includes('Acknowledgement')) {
    const reason = doc.getElementsByTagName('text')[0]?.textContent;
    throw new Error(reason || 'ENTSO-E returned no day-ahead price data');
  }

  const points: PricePoint[] = [];
  const periods = doc.getElementsByTagName('Period');

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const start = period.getElementsByTagName('start')[0]?.textContent;
    const resolution = period.getElementsByTagName('resolution')[0]?.textContent || 'PT60M';
    if (!start) continue;

    const baseTime = new Date(start);
    const resolutionMinutes = parseResolutionMinutes(resolution);
    const pointEls = period.getElementsByTagName('Point');

    for (let j = 0; j < pointEls.length; j++) {
      const pointEl = pointEls[j];
      const position = Number(pointEl.getElementsByTagName('position')[0]?.textContent || '0');
      const price = Number(pointEl.getElementsByTagName('price.amount')[0]?.textContent || '0');
      if (!position) continue;

      const pointStart = new Date(baseTime.getTime() + (position - 1) * resolutionMinutes * 60000);
      const pointEnd = new Date(pointStart.getTime() + resolutionMinutes * 60000);

      points.push({
        startTime: formatHHmm(pointStart),
        endTime: formatHHmm(pointEnd),
        price
      });
    }
  }

  if (points.length === 0) {
    throw new Error('ENTSO-E day-ahead response contained no price points');
  }

  return points.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

class EntsoeMarketDataProvider implements MarketDataProvider {
  async getDayAheadPrices(): Promise<PricePoint[]> {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      documentType: 'A44',
      processType: 'A01',
      in_Domain: BIDDING_ZONE,
      out_Domain: BIDDING_ZONE,
      periodStart: toEntsoeTimestamp(tomorrow),
      periodEnd: toEntsoeTimestamp(dayAfter)
    });

    // Only works through `vite dev` (the proxy is dev-server only, see
    // vite.config.ts) - not after a static `vite build`.
    const response = await fetch(`/entsoe-api?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`ENTSO-E request failed with status ${response.status}`);
    }
    return parseEntsoeDayAheadXml(await response.text());
  }

  async getIntradayPrices(): Promise<PricePoint[]> {
    // ENTSO-E does not expose one standardized "intraday clearing price"
    // document across bidding zones (still an open question with the
    // Spanish pilot - see WP5 meeting notes), so intraday stays simulated:
    // a volatility markup on top of the real day-ahead curve.
    const dayAhead = await this.getDayAheadPrices();
    return dayAhead.map(point => ({
      ...point,
      price: Math.max(10, Math.round(point.price * (1.1 + Math.random() * 0.2) * 100) / 100)
    }));
  }
}

class MockEntsoeProvider implements MarketDataProvider {
  async getDayAheadPrices(): Promise<PricePoint[]> {
    return generateExamplePrices();
  }

  async getIntradayPrices(): Promise<PricePoint[]> {
    // Intraday trades close to delivery tend to be pricier and more
    // volatile than day-ahead (per WP5 KE Simulator meeting notes).
    return generateExamplePrices().map(point => ({
      ...point,
      price: Math.max(10, Math.round(point.price * (1.1 + Math.random() * 0.2) * 100) / 100)
    }));
  }
}

/**
 * Falls back to the mock provider whenever the real ENTSO-E call fails
 * (dev proxy/token not configured, zone has no data yet, network error,
 * etc.) so the demo never breaks.
 */
class FallbackMarketDataProvider implements MarketDataProvider {
  constructor(private readonly primary: MarketDataProvider, private readonly fallback: MarketDataProvider) {}

  async getDayAheadPrices(): Promise<PricePoint[]> {
    try {
      return await this.primary.getDayAheadPrices();
    } catch (error) {
      console.warn('[MarketDataService] Falling back to mock day-ahead prices:', error);
      return this.fallback.getDayAheadPrices();
    }
  }

  async getIntradayPrices(): Promise<PricePoint[]> {
    try {
      return await this.primary.getIntradayPrices();
    } catch (error) {
      console.warn('[MarketDataService] Falling back to mock intraday prices:', error);
      return this.fallback.getIntradayPrices();
    }
  }
}

export const marketDataService: MarketDataProvider = new FallbackMarketDataProvider(
  new EntsoeMarketDataProvider(),
  new MockEntsoeProvider()
);
