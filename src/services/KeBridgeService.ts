import { PricePoint } from '../types';

// Dev calls go through the Vite proxy (/bridge -> http://localhost:8090) to
// avoid CORS; override with VITE_KE_BRIDGE_URL in other environments.
const BRIDGE_URL = import.meta.env.VITE_KE_BRIDGE_URL || '/bridge';

/** Whether the frontend should prefer the KE bridge over the mock/ENTSO-E path. */
export const keBridgeEnabled = import.meta.env.VITE_USE_KE === 'true';

export interface BridgeStatus {
  mode: 'starting' | 'ke' | 'simulated';
  registered: boolean;
  kb_id: string;
  ke_endpoint: string;
}

export interface BridgeEvent {
  type: string;
  [key: string]: unknown;
}

export async function getBridgeStatus(): Promise<BridgeStatus> {
  const res = await fetch(`${BRIDGE_URL}/ready`);
  if (!res.ok) throw new Error(`bridge /ready returned ${res.status}`);
  return res.json();
}

/** ASK day-ahead prices through the KE for tomorrow (UTC). */
export async function getDayAheadPricesViaKe(): Promise<PricePoint[]> {
  const { from, to } = tomorrowUtcRange();
  const url = `${BRIDGE_URL}/ke/prices/day-ahead?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bridge day-ahead prices returned ${res.status}`);
  const data = await res.json();
  return (data.prices ?? []).map((p: { ts: string; endTime?: string; price: number }) => ({
    startTime: p.ts,
    endTime: p.endTime ?? '',
    price: p.price
  }));
}

/** ASK the predicted consumption (MWh) through the KE for tomorrow (UTC). */
export async function getFlexibilityForecastViaKe(): Promise<number> {
  const { from, to } = tomorrowUtcRange();
  const url = `${BRIDGE_URL}/ke/flexibility/forecast?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bridge flexibility forecast returned ${res.status}`);
  const data = await res.json();
  return Number(data.predictedConsumptionMWh);
}

/** Subscribe to the bridge's live KE exchange events (SSE). Returns an unsubscribe fn. */
export function subscribeBridgeEvents(onEvent: (event: BridgeEvent) => void): () => void {
  const source = new EventSource(`${BRIDGE_URL}/events`);
  source.onmessage = ev => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {
      /* ignore malformed frames */
    }
  };
  return () => source.close();
}

function tomorrowUtcRange(): { from: string; to: string } {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() + 1);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}
