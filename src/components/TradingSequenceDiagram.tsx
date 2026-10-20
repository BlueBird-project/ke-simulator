import React, { useEffect, useState } from 'react';
import { TradingStage } from '../types';

interface TradingSequenceDiagramProps {
  currentStage: TradingStage | null;
  isAnimating: boolean;
}

type ActorId = 'EXT' | 'MS' | 'KE' | 'TM' | 'PT' | 'FM' | 'CT';

const ACTORS: { id: ActorId; lines: string[] }[] = [
  { id: 'EXT', lines: ['ENTSO-E'] },
  { id: 'MS', lines: ['Market', 'Service'] },
  { id: 'KE', lines: ['Knowledge', 'Engine'] },
  { id: 'TM', lines: ['Trading', 'Manager'] },
  { id: 'PT', lines: ['Price-fcast', 'Twin'] },
  { id: 'FM', lines: ['Flexibility', 'Manager'] },
  { id: 'CT', lines: ['Consumption', 'Twin'] }
];

const ACTOR_INDEX = ACTORS.reduce((acc, a, i) => {
  acc[a.id] = i;
  return acc;
}, {} as Record<ActorId, number>);

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

const FLOW: Record<TradingStage, Msg> = {
  'market-service-ask-external': { from: 'MS', to: 'EXT', verb: 'ASK', label: 'day-ahead prices' },
  'market-service-post-prices': { from: 'MS', to: 'KE', verb: 'POST', label: 'prices' },
  'trading-manager-react-prices': { from: 'KE', to: 'TM', verb: 'REACT', label: 'prices', dashed: true },
  'price-forecast-twin-react-prices': { from: 'KE', to: 'PT', verb: 'REACT', label: 'prices', dashed: true },
  'price-forecast-twin-post-forecast': { from: 'PT', to: 'KE', verb: 'POST', label: 'forecast' },
  'trading-manager-react-forecast': { from: 'KE', to: 'TM', verb: 'REACT', label: 'forecast', dashed: true },
  'trading-manager-ask-fm': { from: 'TM', to: 'FM', verb: 'ASK', label: 'predicted consumption' },
  'flexibility-manager-answer': { from: 'FM', to: 'TM', verb: 'ANSWER', label: 'predicted consumption', dashed: true },
  'trading-manager-share-offer': { from: 'TM', to: 'MS', verb: 'POST', label: 'Share Offer' },
  'market-day-ahead-cleared': { from: 'MS', to: 'KE', verb: 'POST', label: 'day-ahead clearing' },
  'consumption-twin-actual-usage': { from: 'CT', to: 'CT', verb: 'reveals', label: 'actual consumption', self: true },
  'trading-manager-intraday-correction': { from: 'TM', to: 'MS', verb: 'POST', label: 'intraday correction' },
  'market-intraday-cleared': { from: 'MS', to: 'KE', verb: 'POST', label: 'intraday clearing' }
};

const VIEW_W = 900;
const LEFT = 64;
const RIGHT = 52;
const BOX_HW = 48;
const HEADER_TOP = 8;
const HEADER_H = 46;
const ROW_H = 32;
const FIRST_ROW = HEADER_TOP + HEADER_H + 26;

const colX = (id: ActorId) => LEFT + ACTOR_INDEX[id] * ((VIEW_W - LEFT - RIGHT) / (ACTORS.length - 1));

type State = 'pending' | 'completed' | 'current';
const LINE: Record<State, string> = { pending: '#cbd5e1', completed: '#7c3aed', current: '#f59e0b' };
const TEXT: Record<State, string> = { pending: '#94a3b8', completed: '#6d28d9', current: '#b45309' };

export const TradingSequenceDiagram: React.FC<TradingSequenceDiagramProps> = ({ currentStage, isAnimating }) => {
  const [completed, setCompleted] = useState<TradingStage[]>([]);

  useEffect(() => {
    if (currentStage && !completed.includes(currentStage)) {
      setCompleted(prev => [...prev, currentStage]);
    }
  }, [currentStage, completed]);

  useEffect(() => {
    if (!isAnimating) setCompleted([]);
  }, [isAnimating]);

  const totalH = FIRST_ROW + stageOrder.length * ROW_H + 16;

  const stateOf = (stage: TradingStage): State =>
    currentStage === stage && isAnimating ? 'current' : completed.includes(stage) ? 'completed' : 'pending';

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-2 border-purple-200">
      <h3 className="text-base font-semibold text-gray-800 mb-3 text-center">
        Day-ahead / Intraday Trading Cycle — sequence
      </h3>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${VIEW_W} ${totalH}`} style={{ width: '100%', height: 'auto', minWidth: 680 }}>
          <defs>
            {(['pending', 'completed', 'current'] as State[]).map(st => (
              <marker
                key={st}
                id={`seq-arrow-${st}`}
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="8"
                refX="8"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6 Z" fill={LINE[st]} />
              </marker>
            ))}
          </defs>

          {ACTORS.map(a => (
            <g key={a.id}>
              <rect x={colX(a.id) - BOX_HW} y={HEADER_TOP} width={BOX_HW * 2} height={HEADER_H} rx={8} fill="#1f4e79" />
              {a.lines.map((ln, i) => (
                <text
                  key={i}
                  x={colX(a.id)}
                  y={HEADER_TOP + (a.lines.length === 1 ? 28 : 20 + i * 15)}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="600"
                  fill="#ffffff"
                >
                  {ln}
                </text>
              ))}
              <line
                x1={colX(a.id)}
                y1={HEADER_TOP + HEADER_H}
                x2={colX(a.id)}
                y2={totalH - 8}
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            </g>
          ))}

          {stageOrder.map((stage, k) => {
            const msg = FLOW[stage];
            const st = stateOf(stage);
            const y = FIRST_ROW + k * ROW_H;
            const x1 = colX(msg.from);
            const x2 = colX(msg.to);
            const sw = st === 'current' ? 2.5 : 1.8;
            return (
              <g key={stage}>
                {st === 'current' && (
                  <rect x={2} y={y - 16} width={VIEW_W - 4} height={ROW_H - 4} rx={6} fill="#fef3c7" opacity={0.7} />
                )}
                <text x={30} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={TEXT[st]}>
                  {k + 1}
                </text>
                {msg.self ? (
                  <>
                    <path
                      d={`M ${x1} ${y - 6} h 34 v 14 h -34`}
                      fill="none"
                      stroke={LINE[st]}
                      strokeWidth={sw}
                      markerEnd={`url(#seq-arrow-${st})`}
                    />
                    <text x={x1 + 42} y={y - 2} fontSize="10" fontWeight="600" fill={TEXT[st]}>
                      {msg.verb} · {msg.label}
                    </text>
                  </>
                ) : (
                  <>
                    <line
                      x1={x1}
                      y1={y}
                      x2={x2}
                      y2={y}
                      stroke={LINE[st]}
                      strokeWidth={sw}
                      strokeDasharray={msg.dashed ? '6 4' : undefined}
                      markerEnd={`url(#seq-arrow-${st})`}
                    />
                    <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill={TEXT[st]}>
                      {msg.verb} · {msg.label}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="text-center text-sm text-gray-600 mt-2">
        {isAnimating && currentStage ? (
          <p className="font-semibold text-purple-600">
            Running step {stageOrder.indexOf(currentStage) + 1} / {stageOrder.length}
          </p>
        ) : completed.length > 0 ? (
          <p className="text-purple-600 font-semibold">Cycle completed</p>
        ) : (
          <p className="text-gray-500">Waiting for a scenario to run...</p>
        )}
      </div>
    </div>
  );
};
