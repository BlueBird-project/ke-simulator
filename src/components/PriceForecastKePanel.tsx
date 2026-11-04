import React, { useEffect, useState } from 'react';
import { PriceForecastKeResult } from '../types';
import { keBridgeEnabled, runPriceForecastViaKe, subscribeBridgeEvents } from '../services/KeBridgeService';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Network, PlayCircle, Radio } from 'lucide-react';
import { RunDetailPanel } from './RunDetailPanel';

type RunStatus = 'idle' | 'asking-ke' | 'success' | 'error';

interface RunSummary {
  correlation_id: string;
  trigger: 'manual-ask' | 'react-auto';
  price_points?: number;
  forecast_points?: number;
  error?: string;
}

const MAX_RUNS = 8;

/**
 * Demonstrates the real vertical slice: Market Service (TM/stand-in) --ASK/ANSWER--
 * Knowledge Engine --> Forecast Smart Connector (ke-bridge) --HTTP--> Taimu API
 * --POST--> Knowledge Engine --REACT--> consumer. Everything here is labeled
 * "via Knowledge Engine" to keep it visually distinct from the direct-HTTP
 * TaimuForecastingPanel above, and from the simulated/stand-in modes.
 *
 * Every run (manual ASK button or automatic POST→REACT) is tracked in one
 * unified, newest-first list via the bridge's SSE `/events` stream. Clicking
 * a row expands a `RunDetailPanel` fetched from
 * GET /ke/price-forecast/runs/{correlation_id} - the real 96 historical
 * points and 16 forecast points, not just the summary counts the SSE event
 * carries.
 */
export const PriceForecastKePanel: React.FC = () => {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const upsertRun = (partial: RunSummary) => {
    setRuns(prev => {
      const withoutExisting = prev.filter(r => r.correlation_id !== partial.correlation_id);
      return [partial, ...withoutExisting].slice(0, MAX_RUNS);
    });
  };

  useEffect(() => {
    if (!keBridgeEnabled) return;
    const unsubscribe = subscribeBridgeEvents(event => {
      if (event.type !== 'ke' || event.ki !== 'price-forecast') return;
      const trigger = (event.trigger as 'manual-ask' | 'react-auto' | undefined) ?? 'react-auto';
      upsertRun({
        correlation_id: event.correlation_id as string,
        trigger,
        price_points: event.price_points as number | undefined,
        forecast_points: event.forecast_points as number | undefined,
        error: event.error as string | undefined
      });
    });
    return unsubscribe;
  }, []);

  const run = async () => {
    setStatus('asking-ke');
    setErrorMessage(null);
    try {
      const response: PriceForecastKeResult = await runPriceForecastViaKe();
      upsertRun({
        correlation_id: response.correlation_id,
        trigger: 'manual-ask',
        price_points: response.price_points,
        forecast_points: response.forecast.length
      });
      setExpandedId(response.correlation_id);
      setStatus('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  };

  if (!keBridgeEnabled) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border-2 border-gray-600 shadow-lg mb-8 text-sm text-gray-400">
        <div className="flex items-center gap-2 mb-1">
          <Network size={16} />
          <h2 className="text-lg font-semibold text-gray-300">Price Forecast — via Knowledge Engine</h2>
        </div>
        <p>Disabled: set <code className="text-gray-300">VITE_USE_KE=true</code> and run the KE bridge to enable this panel.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-sky-50 to-blue-100 rounded-xl p-6 border-2 border-sky-300 shadow-lg mb-8">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Network size={18} className="text-sky-700" />
          <h2 className="text-2xl font-bold text-sky-900">Price Forecast — via Knowledge Engine</h2>
        </div>
        <p className="text-sm text-sky-700 mt-1">
          Market Service (Trading Manager / stand-in) <strong>ANSWERs an ASK</strong> for day-ahead prices
          through the KE → the Forecast Smart Connector (KE bridge) calls the Taimu API over HTTP →
          the forecast is <strong>POSTed back onto the KE</strong>, where an independent consumer REACTs
          to it. Real Knowledge Interactions end to end - not a simulated/stand-in panel.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg p-3 text-sm mb-4">
        <Radio size={16} className="flex-shrink-0 mt-0.5 animate-pulse" />
        <div className="w-full">
          <p className="font-semibold">Automatic forecasts (REACT) - no button press</p>
          <p className="text-xs mt-1">
            When a Market Service (or the TEST producer stand-in) <strong>POSTs</strong> a price series onto
            the KE, the Forecast Smart Connector's <strong>`tou-price` REACT</strong> fires on its own and
            runs this same pipeline. Click a run below to see the real 96 historical points and 16
            predictions, with timestamps - live via SSE + GET /ke/price-forecast/runs/{'{id}'}.
          </p>

          {runs.length === 0 ? (
            <p className="text-xs mt-2 italic text-emerald-700">Waiting for a run (automatic or manual)…</p>
          ) : (
            <ul className="text-xs mt-2 space-y-1">
              {runs.map(r => {
                const isExpanded = expandedId === r.correlation_id;
                return (
                  <li key={r.correlation_id}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.correlation_id)}
                      className={`w-full flex items-center gap-1.5 text-left font-mono rounded px-1.5 py-1 hover:bg-emerald-100 transition-colors ${
                        r.error ? 'text-red-700' : 'text-emerald-800'
                      }`}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span className="px-1 rounded bg-white/60 text-[10px] font-sans font-semibold">
                        {r.trigger === 'react-auto' ? 'AUTO' : 'MANUAL'}
                      </span>
                      [{r.correlation_id}] {r.error
                        ? `failed: ${r.error}`
                        : `${r.price_points ?? '?'} price pt(s) \u2192 ${r.forecast_points ?? '?'} forecast pt(s)`}
                    </button>
                    {isExpanded && (
                      <div className="mt-1 mb-2">
                        <RunDetailPanel correlationId={r.correlation_id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-sky-600 mb-2">Manual/diagnostic path (ASK on demand, same pipeline):</p>
      <button
        onClick={run}
        disabled={status === 'asking-ke'}
        className="flex items-center justify-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed mb-2"
      >
        {status === 'asking-ke' ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
        {status === 'asking-ke' ? 'ASK → HTTP → POST in progress…' : 'Run price forecast via KE'}
      </button>

      {status === 'error' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Run failed - no data fabricated.</p>
            <p className="text-xs mt-1 break-words">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
};
