import React, { useCallback, useState } from 'react';
import { TradingCycleResult, TradingFlowEvent, TradingScenario, TradingStage } from '../types';
import { tradingManagerService } from '../services/TradingManagerService';
import { TradingFlowDiagram } from './TradingFlowDiagram';
import { EventTimeline } from './EventTimeline';
import { ModuleResultCard } from './ModuleResultCard';
import { Activity, Building2, FileText, LineChart, TrendingDown, TrendingUp } from 'lucide-react';

export const TradingManagerUI: React.FC = () => {
  const [events, setEvents] = useState<TradingFlowEvent[]>([]);
  const [currentStage, setCurrentStage] = useState<TradingStage | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TradingCycleResult | null>(null);

  const runScenario = useCallback(async (scenario: TradingScenario) => {
    setIsRunning(true);
    setEvents([]);
    setCurrentStage(null);
    setResult(null);

    tradingManagerService.onFlowEvent(event => {
      setCurrentStage(event.stage);
      setEvents(prev => [...prev, event]);
    });

    try {
      const cycleResult = await tradingManagerService.runCycle(scenario);
      setResult(cycleResult);
    } finally {
      setIsRunning(false);
    }
  }, []);

  return (
    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-300 shadow-lg mb-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-purple-900 mb-2">
          Trading Manager &amp; Flexibility Manager
        </h2>
        <p className="text-sm text-purple-700">
          Market Service ASKs the external market and POSTs prices to the KE; the price-forecast
          Digital Twin and the Trading Manager both REACT to them. The Trading Manager then ASKs the
          Flexibility Manager for the predicted consumption and POSTs a Share Offer on the day-ahead
          market, before correcting the position on the intraday market once the (different)
          consumption Digital Twin reveals the actual usage.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => runScenario('shortfall')}
          disabled={isRunning}
          className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <TrendingUp size={18} />
          Simulate day-ahead shortfall
        </button>
        <button
          onClick={() => runScenario('surplus')}
          disabled={isRunning}
          className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <TrendingDown size={18} />
          Simulate day-ahead surplus
        </button>
      </div>

      <div className="mb-6">
        <TradingFlowDiagram currentStage={currentStage} isAnimating={isRunning} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EventTimeline events={events} title="Event log (Trading Manager)" />

        <div>
          <h4 className="text-sm font-semibold text-purple-900 mb-3">Modules</h4>
          {result ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModuleResultCard
                title="Price-forecast Digital Twin"
                icon={LineChart}
                accent="teal"
                lines={[{ label: 'Forecast avg. price', value: `${result.priceForecastAvg} EUR/MWh` }]}
              />
              <ModuleResultCard
                title="Flexibility Manager"
                icon={Building2}
                accent="blue"
                lines={[{ label: 'Predicted consumption', value: `${result.predictedConsumptionMWh} MWh` }]}
              />
              <ModuleResultCard
                title="Trading Manager (Share Offer)"
                icon={FileText}
                accent="purple"
                lines={[
                  { label: 'Volume', value: `${result.shareOffer.volumeMWh} MWh` },
                  { label: 'Max price', value: `${result.shareOffer.maxPrice} EUR/MWh` },
                  { label: 'Day-ahead clearing', value: `${result.shareOffer.clearingPrice} EUR/MWh` }
                ]}
              />
              <ModuleResultCard
                title="Consumption Digital Twin"
                icon={Activity}
                accent="green"
                lines={[
                  { label: 'Actual consumption', value: `${result.actualConsumptionMWh} MWh` },
                  {
                    label: 'Intraday correction',
                    value: `${result.intraday.side} ${result.intraday.volumeMWh} MWh @ ${result.intraday.avgPrice} EUR/MWh`
                  },
                  { label: 'Total cost', value: `${result.totalCost} EUR` }
                ]}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Run a scenario to see each module's result...</p>
          )}
        </div>
      </div>
    </div>
  );
};
