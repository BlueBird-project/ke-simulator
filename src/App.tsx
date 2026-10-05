import { useState, useEffect, useCallback } from 'react';
import { PricePoint, FlowEvent, FlowStage, PriceSignal } from './types';
import { MarketSideUI } from './components/MarketSideUI';
import { EnergyManagerUI } from './components/EnergyManagerUI';
import { FlowDiagram } from './components/FlowDiagram';
import { TradingManagerUI } from './components/TradingManagerUI';
import { simulationService } from './services/SimulationService';
import { energyManagerService } from './services';
import './App.css';

function App() {
  const [marketEvents, setMarketEvents] = useState<FlowEvent[]>([]);
  const [energyEvents, setEnergyEvents] = useState<FlowEvent[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [currentStage, setCurrentStage] = useState<FlowStage | null>(null);
  const [receivedSignal, setReceivedSignal] = useState<PriceSignal | null>(null);

  // Setup event listeners
  useEffect(() => {
    const handleFlowEvent = (event: FlowEvent) => {
      setCurrentStage(event.stage);
      
      // Add event to both timelines
      setMarketEvents(prev => [...prev, event]);
      setEnergyEvents(prev => [...prev, event]);
    };

    const handlePriceUpdate = (signal: PriceSignal) => {
      energyManagerService.receiveSignal(signal);
      setReceivedSignal(signal);
    };

    simulationService.onFlowEvent(handleFlowEvent);
    simulationService.onPriceUpdate(handlePriceUpdate);

    // Do not return cleanup to avoid issues with multiple listeners
  }, []);

  const handlePublish = useCallback(async (prices: PricePoint[]) => {
    setIsPublishing(true);
    setCurrentStage(null);
    
    // Clear previous events
    setMarketEvents([]);
    setEnergyEvents([]);

    try {
      await simulationService.publishPrices(prices);
    } finally {
      setIsPublishing(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            KE Simulator
          </h1>
          <p className="text-gray-300 text-lg">
            Visual demonstration of the energy price flow through Smart Connectors and the Knowledge Engine
          </p>
        </div>

        {/* Trading Manager / Flexibility Manager day-ahead + intraday cycle */}
        <TradingManagerUI />

        {/* Flow Diagram */}
        <div className="mb-8">
          <FlowDiagram
            currentStage={currentStage}
            isAnimating={isPublishing}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Market Side */}
          <div>
            <MarketSideUI
              onPublish={handlePublish}
              isPublishing={isPublishing}
              flowEvents={marketEvents}
            />
          </div>

          {/* Energy Manager Side */}
          <div>
            <EnergyManagerUI
              currentSignal={receivedSignal}
              flowEvents={energyEvents}
            />
          </div>
        </div>

        {/* Footer - Architecture Info */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-white font-semibold mb-3">System Architecture</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-300">
            <div>
              <p className="font-semibold text-blue-400 mb-1">Market Side UI</p>
              <p>Interface for loading and editing prices. Starts the publication.</p>
            </div>
            <div>
              <p className="font-semibold text-purple-400 mb-1">Trading &amp; Flexibility Manager</p>
              <p>Day-ahead purchase against the Flexibility Manager's forecast, corrected on intraday.</p>
            </div>
            <div>
              <p className="font-semibold text-indigo-400 mb-1">Smart Connectors &amp; KE</p>
              <p>Adapters and routing. Transform and transmit data between systems.</p>
            </div>
            <div>
              <p className="font-semibold text-green-400 mb-1">Energy Manager UI</p>
              <p>Receives prices and shows statistics. Ready for future optimization.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
