import { PricePoint, PriceForecastKeResult, PriceForecastRunDetail } from '../types';

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

/**
 * Runs the full price-forecast vertical slice on the bridge: ASK TM for
 * day-ahead prices through the KE, call the Taimu forecasting API over HTTP,
 * POST the forecast back onto the KE (price-forecast KI). This is the
 * "via Knowledge Engine" path - distinct from ForecastingApiService, which
 * calls Taimu directly over HTTP with no KE involved at all.
 */
export async function runPriceForecastViaKe(horizonSpan = 16): Promise<PriceForecastKeResult> {
  const { from, to } = tomorrowUtcRange();
  const res = await fetch(`${BRIDGE_URL}/ke/price-forecast/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date_from: from, date_to: to, horizon_span: horizonSpan })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`bridge price-forecast run returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

/**
 * Full detail for one price-forecast run (manual ASK or automatic REACT):
 * the real historical price series, the real forecast points, timestamps,
 * unit, data origin and the stages actually reached. Backed by ke-bridge's
 * in-memory run_store (bounded, lost on backend restart).
 */
export async function getPriceForecastRun(correlationId: string): Promise<PriceForecastRunDetail> {
  const res = await fetch(`${BRIDGE_URL}/ke/price-forecast/runs/${encodeURIComponent(correlationId)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`bridge run detail returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

/**
 * Recent runs (manual ASK and automatic REACT), newest first - reuses the
 * SAME GET /ke/price-forecast/runs already used to back run_store, just not
 * previously wrapped on the frontend. Used to let the UI show the latest
 * automatic (POST→REACT) run as an independent view, never mixed with a
 * specific scenario's own manual run.
 */
export async function listPriceForecastRuns(): Promise<PriceForecastRunDetail[]> {
  const res = await fetch(`${BRIDGE_URL}/ke/price-forecast/runs`);
  if (!res.ok) throw new Error(`bridge run list returned ${res.status}`);
  const data = await res.json();
  return data.runs ?? [];
}
