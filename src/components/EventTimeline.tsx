import React from 'react';
import { BaseFlowEvent } from '../types';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface EventTimelineProps {
  events: BaseFlowEvent[];
  title: string;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events, title }) => {
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
          events.slice(-20).reverse().map(event => (
            <div
              key={event.id}
              className="flex items-start gap-2 text-xs pb-2 border-b border-gray-100 last:border-b-0"
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
                <p className="text-gray-700 font-medium">{event.message}</p>
                <p className="text-gray-400 text-xs">
                  {formatTime(event.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
