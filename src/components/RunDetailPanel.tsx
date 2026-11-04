import React, { useEffect, useState } from 'react';
import { PriceForecastRunDetail } from '../types';
import { getPriceForecastRun } from '../services/KeBridgeService';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { PriceForecastChart } from './PriceForecastChart';

interface RunDetailPanelProps {
  correlationId: string;
}

const STAGE_LABELS: Record<string, string> = {
  prices_received: 'Prices received (ASK result or POST→REACT payload)',
  taimu_request: 'Taimu HTTP request sent',
  taimu_response: 'Taimu HTTP response received',
  forecast_published: 'Forecast POSTed to the KE'
};

function formatUnixSeconds(value?: number): string {
  if (!value) return '—';
  return new Date(value * 1000).toISOString();
}

/**
 * Fetches and renders the full detail for one run (GET
 * /ke/price-forecast/runs/{id}): real input/output series, timestamps,
 * stages reached, and data-origin labelling. Rendered inline under a run's
 * summary row in PriceForecastKePanel.
 */
export const RunDetailPanel: React.FC<RunDetailPanelProps> = ({ correlationId }) => {
  const [detail, setDetail] = useState<PriceForecastRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPriceForecastRun(correlationId)
      .then(data => {
        if (!cancelled) setDetail(data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [correlationId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-sky-700 p-3">
        <Loader2 size={14} className="animate-spin" /> Loading run detail…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 text-xs">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Could not load run detail: {error ?? 'not found'}</span>
      </div>
    );
  }

  const isReactAuto = detail.trigger === 'react-auto';

  return (
    <div className="bg-white rounded-lg border border-sky-200 p-4 text-xs text-sky-900 space-y-4">
      {/* Origin / mode labels - requirement: clear TEST vs real labelling */}
      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">
          {isReactAuto ? 'Trigger: POST → REACT (automatic)' : 'Trigger: manual ASK (diagnostic)'}
        </span>
        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">{detail.data_origin}</span>
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Chronos-2: real inference</span>
        <span className={`px-2 py-0.5 rounded font-semibold ${
          detail.status === 'ok' ? 'bg-green-100 text-green-800'
          : detail.status === 'error' ? 'bg-red-100 text-red-800'
          : 'bg-gray-200 text-gray-700'
        }`}>
          status: {detail.status}
        </span>
      </div>

      {detail.error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg p-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>Run failed - no forecast was fabricated: {detail.error}</span>
        </div>
      )}

      {/* Identifiers */}
      <dl className="space-y-1">
        <div className="flex justify-between gap-3">
          <dt>Correlation id</dt>
          <dd className="font-mono">{detail.correlation_id}</dd>
        </div>
        {detail.forecast_uri && (
          <div className="flex justify-between gap-3">
            <dt>Forecast URI (published to the KE)</dt>
            <dd className="font-mono break-all text-right">{detail.forecast_uri}</dd>
          </div>
        )}
        {detail.tou_uri && (
          <div className="flex justify-between gap-3">
            <dt>Incoming tou_uri (POSTed by producer)</dt>
            <dd className="font-mono break-all text-right">{detail.tou_uri}</dd>
          </div>
        )}
      </dl>

      {/* Stages - only ones actually reached, per real events */}
      <div>
        <p className="font-semibold mb-1">Stages reached (real events only)</p>
        <ol className="space-y-0.5">
          {detail.stages.map((stage, i) => (
            <li key={`${stage.name}-${i}`} className="flex items-center gap-1.5 text-emerald-800">
              <CheckCircle2 size={12} className="flex-shrink-0" />
              {STAGE_LABELS[stage.name] ?? stage.name}
              <span className="text-sky-500">({formatUnixSeconds(stage.at as number)})</span>
            </li>
          ))}
          {detail.stages.length === 0 && <li className="text-gray-500 italic">No stage reached yet</li>}
        </ol>
        {detail.stages.some(s => s.name === 'forecast_published') && (
          <p className="text-[11px] text-sky-600 italic mt-1">
            After <code>forecast_published</code>, the Knowledge Engine also delivers this forecast to a Forecast
            Consumer (TEST) via a Knowledge Interaction REACT. That hand-off is real but is not drawn in the
            sequence diagram above (it belongs to the Consumer, not to KE Bridge or the Forecast Service) and is
            not tracked as its own run_store stage in this demo - see backend logs for its own trace.
          </p>
        )}
      </div>

      {/* Chart + tables - only if we actually have both series */}
      {detail.prices && detail.forecast && detail.prices.length > 0 && detail.forecast.length > 0 && (
        <>
          <div>
            <p className="font-semibold mb-1">
              Historical input ({detail.prices.length} pt, blue) → forecast ({detail.forecast.length} pt, green)
            </p>
            <PriceForecastChart prices={detail.prices} forecast={detail.forecast} />
          </div>

          <p className="text-[11px] text-sky-600 italic">
            FAST applies internal forges (coerce_numeric_y, interpolate_15min) before calling Chronos-2, but
            Taimu's HTTP response does not echo the transformed series back - only `ds`/`unique_id`/`yhat`.
            The table below is therefore the <strong>original</strong> input sent to Taimu, not FAST's
            internal intermediate representation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="font-semibold mb-1">Historical prices sent to Taimu ({detail.prices.length})</p>
              <div className="max-h-56 overflow-y-auto border border-sky-100 rounded">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-sky-50">
                    <tr className="text-left">
                      <th className="py-1 px-1.5">Date</th>
                      <th className="py-1 px-1.5">Time (UTC)</th>
                      <th className="py-1 px-1.5 text-right">Price</th>
                      <th className="py-1 px-1.5">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.prices.map(p => (
                      <tr key={p.ts} className="border-t border-sky-50">
                        <td className="py-0.5 px-1.5">{p.ts.slice(0, 10)}</td>
                        <td className="py-0.5 px-1.5">{p.ts.slice(11, 19)}</td>
                        <td className="py-0.5 px-1.5 text-right font-semibold">{p.price.toFixed(2)}</td>
                        <td className="py-0.5 px-1.5">{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="font-semibold mb-1">Forecast points from Taimu ({detail.forecast.length})</p>
              <div className="max-h-56 overflow-y-auto border border-emerald-100 rounded">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-emerald-50">
                    <tr className="text-left">
                      <th className="py-1 px-1.5">Date</th>
                      <th className="py-1 px-1.5">Time (UTC)</th>
                      <th className="py-1 px-1.5 text-right">yhat</th>
                      <th className="py-1 px-1.5">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.forecast.map(p => (
                      <tr key={p.ds} className="border-t border-emerald-50">
                        <td className="py-0.5 px-1.5">{p.ds.slice(0, 10)}</td>
                        <td className="py-0.5 px-1.5">{p.ds.slice(11, 19)}</td>
                        <td className="py-0.5 px-1.5 text-right font-semibold">{p.yhat.toFixed(3)}</td>
                        <td className="py-0.5 px-1.5">{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {detail.status === 'running' && (
        <div className="flex items-center gap-2 text-sky-700">
          <Loader2 size={14} className="animate-spin" /> Still running (Taimu inference takes ~15-25s)…
        </div>
      )}
    </div>
  );
};
