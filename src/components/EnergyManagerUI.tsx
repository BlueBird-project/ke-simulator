import React, { useEffect, useState } from 'react';
import { PriceSignal, FlowEvent } from '../types';
import { PriceTable } from './PriceTable';
import { EventTimeline } from './EventTimeline';
import { calculatePriceStats } from '../utils/priceUtils';

interface EnergyManagerUIProps {
  currentSignal: PriceSignal | null;
  flowEvents: FlowEvent[];
}

export const EnergyManagerUI: React.FC<EnergyManagerUIProps> = ({
  currentSignal,
  flowEvents
}) => {
  const [isWaiting, setIsWaiting] = useState(true);

  useEffect(() => {
    setIsWaiting(currentSignal === null);
  }, [currentSignal]);

  const stats = currentSignal ? calculatePriceStats(currentSignal.pricePoints) : null;

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-6 border-2 border-green-300 shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-green-900 mb-2">
          Energy Manager
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-green-700 font-medium">Smart Connector connected</span>
        </div>
      </div>

      {/* Last received signal card */}
      <div className="bg-white rounded-lg border-2 border-green-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-green-900 mb-3">
          Last received signal
        </h3>

        {isWaiting ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-gray-300 border-t-green-500 rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-500 text-sm">Waiting for market prices...</p>
            </div>
          </div>
        ) : currentSignal ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <p className="text-gray-600">Signal ID</p>
                <p className="font-mono text-blue-600 break-all">{currentSignal.id}</p>
              </div>
              <div>
                <p className="text-gray-600">Timestamp</p>
                <p className="font-mono text-blue-600">
                  {new Date(currentSignal.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </p>
              </div>
            </div>

            {/* Statistics summary */}
            {stats && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-gray-600">Points</p>
                    <p className="font-bold text-lg text-green-700">{stats.count}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Min</p>
                    <p className="font-bold text-lg text-blue-600">{stats.min}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Avg</p>
                    <p className="font-bold text-lg text-purple-600">{stats.average}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Max</p>
                    <p className="font-bold text-lg text-red-600">{stats.max}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Received prices table */}
      {currentSignal && currentSignal.pricePoints.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-green-900 mb-3">
            Received prices
          </h3>
          <PriceTable prices={currentSignal.pricePoints} />
        </div>
      )}

      {/* Event timeline */}
      <EventTimeline
        events={flowEvents}
        title="Event log (Energy Manager)"
      />
    </div>
  );
};
