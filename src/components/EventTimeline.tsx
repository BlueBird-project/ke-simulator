import React, { useState } from 'react';
import { BaseFlowEvent } from '../types';
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { RunDetailPanel } from './RunDetailPanel';

// Optional fields present only on events that reused a real price-forecast
// run (see TradingManagerService.getPriceForecast()) - other event lists
// (MarketSideUI/EnergyManagerUI's plain FlowEvent[]) simply never set them.
type TimelineEvent = BaseFlowEvent & { correlationId?: string; dataLabel?: 'REAL' | 'MOCK' };

interface EventTimelineProps {
  events: TimelineEvent[];
  title: string;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events, title }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 h-64 overflow-y-auto">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 sticky top-0 bg-white">
        {title}
      </h4>

      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            Waiting for events...
          </p>
        ) : (
          events.slice(-20).reverse().map(event => {
            const hasDetail = Boolean(event.correlationId);
            const isExpanded = expandedId === event.id;
            return (
              <div key={event.id} className="pb-2 border-b border-gray-100 last:border-b-0">
                <div
                  className={`flex items-start gap-2 text-xs ${hasDetail ? 'cursor-pointer' : ''}`}
                  onClick={hasDetail ? () => setExpandedId(isExpanded ? null : event.id) : undefined}
                >
                  <div className="flex-shrink-0 pt-0.5">
                    {event.status === 'success' && (
                      <CheckCircle size={14} className="text-green-500" />
                    )}
                    {event.status === 'error' && (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                    {event.status === 'pending' && (
                      <Clock size={14} className="text-yellow-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 font-medium">
                      {event.message}
                      {event.dataLabel && (
                        <span
                          className={`ml-1.5 px-1 py-0.5 rounded text-[10px] font-semibold ${
                            event.dataLabel === 'REAL' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {event.dataLabel}
                        </span>
                      )}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {formatTime(event.timestamp)}
                    </p>
                  </div>

                  {hasDetail && (
                    <div className="flex-shrink-0 pt-0.5 text-gray-400">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  )}
                </div>

                {hasDetail && isExpanded && (
                  <div className="mt-2">
                    <RunDetailPanel correlationId={event.correlationId as string} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
