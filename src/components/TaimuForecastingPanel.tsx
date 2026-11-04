import React, { useEffect, useState } from 'react';
import { DayAheadForecastRequest, ForecastResult } from '../types';
import { forecastingApiService } from '../services/ForecastingApiService';
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react';

type HealthStatus = 'checking' | 'online' | 'unreachable';
type RunStatus = 'idle' | 'loading' | 'success' | 'error';

// Sample/test historical data - the exact payload used to verify the API
// manually (forecasting/api/api_smoke_test.py). Clearly test data, not a
// real asset reading.
const SAMPLE_REQUEST: DayAheadForecastRequest = {
  horizon_span: 4,
  data: {
    ds: ['2026-10-20 00:00:00', '2026-10-20 00:15:00', '2026-10-20 00:30:00', '2026-10-20 00:45:00'],
    unique_id: ['asset_1', 'asset_1', 'asset_1', 'asset_1'],
    y: [100.0, 101.5, 99.8, 102.1]
  }
};

export const TaimuForecastingPanel: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus>('checking');
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    forecastingApiService
      .getHealth()
      .then(() => {
        if (!cancelled) setHealth('online');
      })
      .catch(() => {
        if (!cancelled) setHealth('unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runForecast = async () => {
    setRunStatus('loading');
    setErrorMessage(null);
    setResult(null);
    const startedAt = performance.now();

    try {
      const forecast = await forecastingApiService.getDayAheadForecast(SAMPLE_REQUEST);
      setResult(forecast);
      setRunStatus('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setRunStatus('error');
    } finally {
      setElapsedSeconds((performance.now() - startedAt) / 1000);
    }
  };

  // Scaled by the result's own min-max range (not from zero): Chronos-2
  // forecasts for a single short series often cluster tightly (e.g. ~101-102),
  // so a from-zero scale makes every bar look the same height even though the
  // underlying values genuinely differ (see the exact numbers in the table).
  const minYhat = result ? Math.min(...result.yhat) : 0;
  const maxYhat = result ? Math.max(...result.yhat) : 1;
  const yhatRange = maxYhat - minYhat || 1;
  const barHeightPercent = (value: number) =>
    result && maxYhat !== minYhat ? 15 + ((value - minYhat) / yhatRange) * 85 : 60;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl p-6 border-2 border-amber-300 shadow-lg mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-amber-900 mb-1">Taimu Forecasting API</h2>
          <p className="text-sm text-amber-700">
            Direct HTTP call to Adrian's FAST + Chronos-2 forecasting service — <strong>not a Knowledge
            Engine interaction</strong>. Independent of the Trading Manager / KE Bridge / ENTSO-E flows above.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
            health === 'online'
              ? 'bg-green-100 text-green-800'
              : health === 'unreachable'
              ? 'bg-red-100 text-red-800'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          {health === 'online' && <CheckCircle2 size={12} />}
          {health === 'unreachable' && <XCircle size={12} />}
          API: {health === 'checking' ? 'checking…' : health}
        </span>
      </div>

      <div className="bg-white/70 rounded-lg border border-amber-200 p-3 mb-4 text-xs text-amber-900">
        <p className="font-semibold mb-1">Sample/test historical input (asset_1, 15-min steps):</p>
        <code className="block overflow-x-auto whitespace-pre text-[11px]">
          y = {JSON.stringify(SAMPLE_REQUEST.data.y)}, horizon_span = {SAMPLE_REQUEST.horizon_span}
        </code>
      </div>

      <button
        onClick={runForecast}
        disabled={runStatus === 'loading' || health === 'unreachable'}
        className="flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed mb-4"
      >
        {runStatus === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
        {runStatus === 'loading' ? 'Running Chronos-2 inference…' : 'Run real forecast (Chronos-2)'}
      </button>

      {runStatus === 'error' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 mb-4 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Forecast request failed - no data fabricated.</p>
            <p className="text-xs mt-1 break-words">{errorMessage}</p>
          </div>
        </div>
      )}

      {runStatus === 'success' && result && (
        <div className="bg-white rounded-lg border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-amber-700" />
            <h4 className="text-sm font-semibold text-amber-900">
              Chronos-2 forecast result {elapsedSeconds !== null && `(${elapsedSeconds.toFixed(1)}s)`}
            </h4>
          </div>

          {/* Simple bar visualization of yhat, scaled to this result's own
              min-max range - no charting library needed. */}
          <p className="text-[11px] text-amber-700 mb-1">
            Bars scaled to this result's range ({minYhat.toFixed(2)} – {maxYhat.toFixed(2)}), not from zero,
            so the small differences between points are visible.
          </p>
          <div className="flex items-end gap-2 h-24 mb-4">
            {result.yhat.map((value, index) => (
              <div key={result.ds[index]} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-[10px] text-amber-800 mb-0.5">{value.toFixed(2)}</span>
                <div
                  className="w-full bg-amber-500 rounded-t"
                  style={{ height: `${barHeightPercent(value)}%` }}
                  title={`${value}`}
                />
              </div>
            ))}
          </div>

          <table className="w-full text-xs text-amber-900">
            <thead>
              <tr className="border-b border-amber-200 text-left">
                <th className="py-1 pr-2">ds</th>
                <th className="py-1 pr-2">unique_id</th>
                <th className="py-1 text-right">yhat</th>
              </tr>
            </thead>
            <tbody>
              {result.ds.map((ds, index) => (
                <tr key={ds} className="border-b border-amber-100 last:border-0">
                  <td className="py-1 pr-2">{ds}</td>
                  <td className="py-1 pr-2">{result.unique_id[index]}</td>
                  <td className="py-1 text-right font-semibold">{result.yhat[index].toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
