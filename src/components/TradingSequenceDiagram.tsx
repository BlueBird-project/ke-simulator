import React, { useEffect, useMemo, useState } from 'react';
import { PriceForecastRunDetail, TradingStage } from '../types';
import { getPriceForecastRun } from '../services/KeBridgeService';
import { RunDetailPanel } from './RunDetailPanel';

interface TradingSequenceDiagramProps {
  currentStage: TradingStage | null;
  isAnimating: boolean;
  // Set only once the price-forecast step of THIS run has actually
  // completed (manual-ask trigger) - never inferred from stageOrder index,
  // always from the real TradingFlowEvent's own fields (see
  // TradingManagerService.getPriceForecast()).
  forecastCorrelationId?: string | null;
  forecastDataLabel?: 'REAL' | 'MOCK' | null;
  // Latest independent automatic (POST→REACT) run, e.g. from
  // market-service-standin - tracked via SSE in TradingManagerUI, never the
  // same execution as forecastCorrelationId above.
  latestAutoCorrelationId?: string | null;
}

// 9 participants, all in ONE diagram - the Trading/Flexibility business
// actors plus two independent real components: KE Bridge (integration
// adapter, talks to the KE via Knowledge Interactions) and Forecast Service
// (performs the inference, called over HTTP by KE Bridge). Forecast Consumer
// (TEST) is intentionally NOT drawn here (see note near the legend below) -
// its REACT is real and traced in run data, but never attributed to another
// actor. Horizontal scroll handles the extra width.
type ActorId = 'EXT' | 'MS' | 'UI' | 'KE' | 'TM' | 'BR' | 'TAI' | 'FM' | 'CT';

const ACTORS: { id: ActorId; lines: string[] }[] = [
  { id: 'EXT', lines: ['ENTSO-E'] },
  { id: 'MS', lines: ['Market', 'Service'] },
  { id: 'UI', lines: ['KE Simulator', '/ UI'] },
  { id: 'KE', lines: ['Knowledge', 'Engine'] },
  { id: 'TM', lines: ['Trading', 'Manager'] },
  { id: 'BR', lines: ['KE Bridge'] },
  { id: 'TAI', lines: ['Forecast', 'Service'] },
  { id: 'FM', lines: ['Flexibility', 'Manager'] },
  { id: 'CT', lines: ['Consumption', 'Twin'] }
];

const ACTOR_INDEX = ACTORS.reduce((acc, a, i) => {
  acc[a.id] = i;
  return acc;
}, {} as Record<ActorId, number>);

// Hover tooltips - the only place internal implementation details (Taimu /
// Chronos-2) are disclosed for the Forecast Service, per requirement to keep
// them out of the main participant naming.
const ACTOR_TOOLTIP: Partial<Record<ActorId, string>> = {
  BR: 'KE Bridge — integration adapter: exposes the HTTP endpoints used by the UI and talks to the Knowledge Engine via Knowledge Interactions (ASK/ANSWER/POST/REACT). Does not run inference itself.',
  TAI: 'Forecast Service — performs the real forecasting inference, called over plain HTTP by KE Bridge. Internally implemented with Taimu / Chronos-2 (see run detail below for stage-level traceability).'
};

interface Msg {
  from: ActorId;
  to: ActorId;
  verb: string;
  label: string;
  dashed?: boolean; // return messages (ANSWER / REACT) are drawn dashed
  self?: boolean;
}

const stageOrder: TradingStage[] = [
  'market-service-ask-external',
  'market-service-post-prices',
  'trading-manager-react-prices',
  'price-forecast-twin-react-prices',
  'price-forecast-twin-post-forecast',
  'trading-manager-react-forecast',
  'trading-manager-ask-fm',
  'flexibility-manager-answer',
  'trading-manager-share-offer',
  'market-day-ahead-cleared',
  'consumption-twin-actual-usage',
  'trading-manager-intraday-correction',
  'market-intraday-cleared'
];

// Business steps BEFORE and AFTER the forecasting block (stages 4-5), which
// is rendered inline below as either a 2-row placeholder or the full real
// hop-by-hop breakdown - never as a separate diagram/panel.
const BEFORE_FORECAST: TradingStage[] = ['market-service-ask-external', 'market-service-post-prices', 'trading-manager-react-prices'];
const AFTER_FORECAST: TradingStage[] = [
  'trading-manager-react-forecast',
  'trading-manager-ask-fm',
  'flexibility-manager-answer',
  'trading-manager-share-offer',
  'market-day-ahead-cleared',
  'consumption-twin-actual-usage',
  'trading-manager-intraday-correction',
  'market-intraday-cleared'
];

const FLOW: Partial<Record<TradingStage, Msg>> = {
  'market-service-ask-external': { from: 'MS', to: 'EXT', verb: 'ASK', label: 'day-ahead prices' },
  'market-service-post-prices': { from: 'MS', to: 'KE', verb: 'POST', label: 'prices' },
  'trading-manager-react-prices': { from: 'KE', to: 'TM', verb: 'REACT', label: 'prices', dashed: true },
  'trading-manager-react-forecast': { from: 'KE', to: 'TM', verb: 'REACT', label: 'forecast', dashed: true },
  'trading-manager-ask-fm': { from: 'TM', to: 'FM', verb: 'ASK', label: 'predicted consumption' },
  'flexibility-manager-answer': { from: 'FM', to: 'TM', verb: 'ANSWER', label: 'predicted consumption', dashed: true },
  'trading-manager-share-offer': { from: 'TM', to: 'MS', verb: 'POST', label: 'Share Offer' },
  'market-day-ahead-cleared': { from: 'MS', to: 'KE', verb: 'POST', label: 'day-ahead clearing' },
  'consumption-twin-actual-usage': { from: 'CT', to: 'CT', verb: 'reveals', label: 'actual consumption', self: true },
  'trading-manager-intraday-correction': { from: 'TM', to: 'MS', verb: 'POST', label: 'intraday correction' },
  'market-intraday-cleared': { from: 'MS', to: 'KE', verb: 'POST', label: 'intraday clearing' }
};

// Real forecasting hops, built from run_store's own stage names - a hop is
// drawn "verified" (solid, timestamped) only when that stage is present in
// the fetched run detail; everything else is "contextual" (dashed, no claim
// of independent verification - see docker logs). Manual and automatic hops
// are never mixed: only one set is ever shown, chosen by `mode`.
interface ForecastHop {
  from: ActorId;
  to: ActorId;
  label: string;
  verifiedBy?: string;
}

// KE<->BR hops are Knowledge Interactions (ASK/ANSWER/POST/REACT); BR<->TAI
// hops are plain HTTP (KE Bridge calling the Forecast Service's API). The
// delivery to Forecast Consumer (TEST) is real but intentionally not drawn
// here - see the note near the legend below for its traceability.
const MANUAL_HOPS: ForecastHop[] = [
  { from: 'UI', to: 'BR', label: 'HTTP POST /ke/price-forecast/run' },
  { from: 'BR', to: 'KE', label: 'ASK tou-price' },
  { from: 'KE', to: 'TM', label: 'ASK (relayed to TM stand-in)' },
  { from: 'TM', to: 'KE', label: 'ANSWER (96 pts)' },
  { from: 'KE', to: 'BR', label: 'ANSWER (relayed)', verifiedBy: 'prices_received' },
  { from: 'BR', to: 'TAI', label: 'HTTP POST /forecast/day-ahead (96 pts)', verifiedBy: 'taimu_request' },
  { from: 'TAI', to: 'BR', label: 'HTTP response (16 pts, real inference)', verifiedBy: 'taimu_response' },
  { from: 'BR', to: 'KE', label: 'POST price-forecast', verifiedBy: 'forecast_published' },
  { from: 'BR', to: 'UI', label: 'HTTP response (correlation_id)' }
];

const AUTO_HOPS: ForecastHop[] = [
  { from: 'MS', to: 'KE', label: 'POST tou-price (96 pts, TEST producer)' },
  { from: 'KE', to: 'BR', label: 'REACT tou-price', verifiedBy: 'prices_received' },
  { from: 'BR', to: 'TAI', label: 'HTTP POST /forecast/day-ahead (96 pts)', verifiedBy: 'taimu_request' },
  { from: 'TAI', to: 'BR', label: 'HTTP response (16 pts, real inference)', verifiedBy: 'taimu_response' },
  { from: 'BR', to: 'KE', label: 'POST price-forecast', verifiedBy: 'forecast_published' },
  { from: 'BR', to: 'UI', label: 'SSE event (no HTTP wait - independent of any button)' }
];

const VIEW_W = 1080;
const LEFT = 64;
const RIGHT = 60;
const BOX_HW = 46;
const HEADER_TOP = 8;
const HEADER_H = 46;
const ROW_H = 32;
const FIRST_ROW = HEADER_TOP + HEADER_H + 26;

const colX = (id: ActorId) => LEFT + ACTOR_INDEX[id] * ((VIEW_W - LEFT - RIGHT) / (ACTORS.length - 1));

type State = 'pending' | 'completed' | 'current';
const LINE: Record<State, string> = { pending: '#cbd5e1', completed: '#7c3aed', current: '#f59e0b' };
const TEXT: Record<State, string> = { pending: '#94a3b8', completed: '#6d28d9', current: '#b45309' };
const VERIFIED_LINE = '#059669';
const VERIFIED_TEXT = '#047857';
const CONTEXTUAL_LINE = '#cbd5e1';
const CONTEXTUAL_TEXT = '#94a3b8';

type Mode = 'scenario' | 'automatic';

export const TradingSequenceDiagram: React.FC<TradingSequenceDiagramProps> = ({
  currentStage,
  isAnimating,
  forecastCorrelationId,
  forecastDataLabel,
  latestAutoCorrelationId
}) => {
  const [completed, setCompleted] = useState<TradingStage[]>([]);
  const [mode, setMode] = useState<Mode>('scenario');
  const [showRunData, setShowRunData] = useState(false);

  useEffect(() => {
    if (currentStage && !completed.includes(currentStage)) {
      setCompleted(prev => [...prev, currentStage]);
    }
  }, [currentStage, completed]);

  useEffect(() => {
    if (!isAnimating) setCompleted([]);
  }, [isAnimating]);

  // The run_store-backed correlationId for whichever mode is active - never
  // mixed: scenario mode only ever shows forecastCorrelationId (manual-ask),
  // automatic mode only ever shows latestAutoCorrelationId (react-auto).
  const activeCorrelationId =
    mode === 'scenario' ? (forecastDataLabel === 'REAL' ? forecastCorrelationId ?? null : null) : latestAutoCorrelationId ?? null;

  const [forecastDetail, setForecastDetail] = useState<PriceForecastRunDetail | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    if (!activeCorrelationId) {
      setForecastDetail(null);
      return;
    }
    let cancelled = false;
    setForecastLoading(true);
    getPriceForecastRun(activeCorrelationId)
      .then(data => {
        if (!cancelled) setForecastDetail(data);
      })
      .catch(() => {
        if (!cancelled) setForecastDetail(null);
      })
      .finally(() => {
        if (!cancelled) setForecastLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCorrelationId]);

  const reachedStages = useMemo(() => new Set((forecastDetail?.stages ?? []).map(s => s.name)), [forecastDetail]);
  const stageTime = (name: string) => forecastDetail?.stages.find(s => s.name === name)?.at;

  const stateOf = (stage: TradingStage): State =>
    currentStage === stage && isAnimating ? 'current' : completed.includes(stage) ? 'completed' : 'pending';

  // --- Row layout: before-forecast business steps, the forecast block
  // (either a 2-row pending/mock placeholder or the real hop breakdown),
  // then after-forecast business steps. In automatic mode there are no
  // business steps - just the automatic hops for the active run. ---
  const showRealHops = mode === 'automatic' ? Boolean(forecastDetail) : forecastDataLabel === 'REAL' && Boolean(forecastDetail);
  const forecastHops = forecastDetail?.trigger === 'react-auto' ? AUTO_HOPS : MANUAL_HOPS;

  const forecastBlockRows = showRealHops ? forecastHops.length : mode === 'automatic' ? 0 : 2;
  const businessRowCount = mode === 'scenario' ? BEFORE_FORECAST.length + AFTER_FORECAST.length : 0;
  const totalRows = businessRowCount + forecastBlockRows;
  const totalH = FIRST_ROW + totalRows * ROW_H + 16;

  let rowIndex = 0;
  const nextY = () => FIRST_ROW + rowIndex++ * ROW_H;

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-2 border-purple-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-gray-800 text-center flex-1">
          Day-ahead / Intraday Trading Cycle — sequence
        </h3>
        <div className="flex rounded-lg border border-purple-300 overflow-hidden text-xs font-semibold flex-shrink-0">
          <button
            onClick={() => setMode('scenario')}
            className={`px-3 py-1 ${mode === 'scenario' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700'}`}
          >
            Scenario
          </button>
          <button
            onClick={() => setMode('automatic')}
            className={`px-3 py-1 ${mode === 'automatic' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700'}`}
          >
            Automatic
          </button>
        </div>
      </div>

      {mode === 'automatic' && (
        <p className="text-xs text-emerald-700 text-center mb-2">
          Automatic POST→REACT path - an INDEPENDENT run (e.g. from <code>market-service-standin</code>, a
          TEST producer), never the same execution as the scenario below.
          {latestAutoCorrelationId && <span className="font-mono ml-1">[{latestAutoCorrelationId}]</span>}
        </p>
      )}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${VIEW_W} ${totalH}`} style={{ width: '100%', height: 'auto', minWidth: 900 }}>
          <defs>
            {(['pending', 'completed', 'current'] as State[]).map(st => (
              <marker key={st} id={`seq-arrow-${st}`} markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="8" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill={LINE[st]} />
              </marker>
            ))}
            <marker id="seq-arrow-verified" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="8" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill={VERIFIED_LINE} />
            </marker>
            <marker id="seq-arrow-contextual" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="8" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill={CONTEXTUAL_LINE} />
            </marker>
          </defs>

          {ACTORS.map(a => (
            <g key={a.id}>
              <rect x={colX(a.id) - BOX_HW} y={HEADER_TOP} width={BOX_HW * 2} height={HEADER_H} rx={8} fill="#1f4e79">
                {ACTOR_TOOLTIP[a.id] && <title>{ACTOR_TOOLTIP[a.id]}</title>}
              </rect>
              {a.lines.map((ln, i) => (
                <text key={i} x={colX(a.id)} y={HEADER_TOP + (a.lines.length === 1 ? 28 : 20 + i * 15)} textAnchor="middle" fontSize="10" fontWeight="600" fill="#ffffff">
                  {ln}
                </text>
              ))}
              <line x1={colX(a.id)} y1={HEADER_TOP + HEADER_H} x2={colX(a.id)} y2={totalH - 8} stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 4" />
            </g>
          ))}

          {mode === 'scenario' &&
            BEFORE_FORECAST.map(stage => {
              const msg = FLOW[stage]!;
              const st = stateOf(stage);
              const y = nextY();
              return renderBusinessRow(stage, msg, st, y, stageOrder.indexOf(stage) + 1);
            })}

          {/* Forecasting block (steps 4-5 in scenario mode; the whole diagram in automatic mode) */}
          {forecastLoading && mode === 'scenario' && forecastDataLabel === 'REAL' ? (
            <text x={LEFT} y={nextY() + 4} fontSize="10" fill="#6b7280">
              Loading real forecast sequence…
            </text>
          ) : showRealHops ? (
            forecastHops.map((hop, i) => {
              const isVerified = hop.verifiedBy ? reachedStages.has(hop.verifiedBy) : false;
              const at = hop.verifiedBy ? stageTime(hop.verifiedBy) : undefined;
              const y = nextY();
              const line = isVerified ? VERIFIED_LINE : CONTEXTUAL_LINE;
              const text = isVerified ? VERIFIED_TEXT : CONTEXTUAL_TEXT;
              const x1 = colX(hop.from);
              const x2 = colX(hop.to);
              const isForecastServiceHop = hop.from === 'TAI' || hop.to === 'TAI';
              return (
                <g key={`fh-${i}`} style={isForecastServiceHop && activeCorrelationId ? { cursor: 'pointer' } : undefined} onClick={isForecastServiceHop && activeCorrelationId ? () => setShowRunData(v => !v) : undefined}>
                  {i === 0 && (
                    <text x={30} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={VERIFIED_TEXT}>
                      {mode === 'scenario' ? '4–5' : ''}
                    </text>
                  )}
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={line} strokeWidth={isVerified ? 2.2 : 1.4} strokeDasharray={isVerified ? undefined : '5 4'} markerEnd={`url(#seq-arrow-${isVerified ? 'verified' : 'contextual'})`} />
                  <text x={(x1 + x2) / 2} y={y - 7} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={text}>
                    {hop.label}
                    {at && ` · ${new Date(at * 1000).toLocaleTimeString()}`}
                    {!hop.verifiedBy && ' (contextual)'}
                  </text>
                </g>
              );
            })
          ) : mode === 'scenario' ? (
            // Placeholder: the step hasn't produced real run data (yet), or
            // this run fell back to the local MOCK forecast.
            [
              { stage: 'price-forecast-twin-react-prices' as TradingStage, from: 'KE' as ActorId, to: 'BR' as ActorId, verb: 'REACT', label: 'prices' },
              {
                stage: 'price-forecast-twin-post-forecast' as TradingStage,
                from: 'BR' as ActorId,
                to: 'KE' as ActorId,
                verb: 'POST',
                label: forecastDataLabel === 'MOCK' ? 'forecast (MOCK fallback)' : 'forecast'
              }
            ].map(row => {
              const st = stateOf(row.stage);
              const y = nextY();
              return renderBusinessRow(row.stage, { from: row.from, to: row.to, verb: row.verb, label: row.label, dashed: row.verb === 'REACT' }, st, y, stageOrder.indexOf(row.stage) + 1);
            })
          ) : (
            <text x={VIEW_W / 2} y={nextY() + 4} textAnchor="middle" fontSize="11" fill="#6b7280">
              Waiting for an automatic POST → REACT run…
            </text>
          )}

          {mode === 'scenario' &&
            AFTER_FORECAST.map(stage => {
              const msg = FLOW[stage]!;
              const st = stateOf(stage);
              const y = nextY();
              return renderBusinessRow(stage, msg, st, y, stageOrder.indexOf(stage) + 1);
            })}
        </svg>
      </div>

      {mode === 'scenario' && (
        <div className="text-center text-sm text-gray-600 mt-2">
          {isAnimating && currentStage ? (
            <p className="font-semibold text-purple-600">Running step {stageOrder.indexOf(currentStage) + 1} / {stageOrder.length}</p>
          ) : completed.length > 0 ? (
            <p className="text-purple-600 font-semibold">Cycle completed</p>
          ) : (
            <p className="text-gray-500">Waiting for a scenario to run...</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-gray-500 mt-3 border-t border-purple-100 pt-2">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-purple-600" /> business step (completed)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: VERIFIED_LINE }} /> verified (run_store stage)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t border-dashed" style={{ borderColor: CONTEXTUAL_LINE }} /> contextual (no per-hop evidence)</span>
        <span className="px-1.5 rounded bg-amber-100 text-amber-800 font-semibold">MOCK = local fallback</span>
        <span className="px-1.5 rounded bg-sky-100 text-sky-800 font-semibold">TEST = stand-in producer/consumer</span>
      </div>

      <p className="text-center text-[10px] text-gray-500 mt-1 italic">
        Not drawn above: the published forecast is also delivered to a Forecast Consumer (TEST) via REACT - a real
        exchange, traced in run data and backend logs, but omitted here to avoid attributing it to another actor.
      </p>

      {activeCorrelationId && (
        <div className="mt-2 text-center">
          <button onClick={() => setShowRunData(v => !v)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">
            {showRunData ? 'Hide' : 'View'} full run data (click a Forecast Service arrow, or here) · [{activeCorrelationId}]
          </button>
          {showRunData && (
            <div className="mt-2 text-left">
              <RunDetailPanel correlationId={activeCorrelationId} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  function renderBusinessRow(stage: TradingStage, msg: Msg, st: State, y: number, stepNumber: number) {
    const x1 = colX(msg.from);
    const x2 = colX(msg.to);
    const sw = st === 'current' ? 2.5 : 1.8;
    return (
      <g key={stage}>
        {st === 'current' && <rect x={2} y={y - 16} width={VIEW_W - 4} height={ROW_H - 4} rx={6} fill="#fef3c7" opacity={0.7} />}
        <text x={30} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={TEXT[st]}>
          {stepNumber}
        </text>
        {msg.self ? (
          <>
            <path d={`M ${x1} ${y - 6} h 34 v 14 h -34`} fill="none" stroke={LINE[st]} strokeWidth={sw} markerEnd={`url(#seq-arrow-${st})`} />
            <text x={x1 + 42} y={y - 2} fontSize="10" fontWeight="600" fill={TEXT[st]}>
              {msg.verb} · {msg.label}
            </text>
          </>
        ) : (
          <>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={LINE[st]} strokeWidth={sw} strokeDasharray={msg.dashed ? '6 4' : undefined} markerEnd={`url(#seq-arrow-${st})`} />
            <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill={TEXT[st]}>
              {msg.verb} · {msg.label}
            </text>
          </>
        )}
      </g>
    );
  }
};

