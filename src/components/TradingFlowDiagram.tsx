import React, { useEffect, useState } from 'react';
import { TradingStage } from '../types';

interface TradingFlowDiagramProps {
  currentStage: TradingStage | null;
  isAnimating: boolean;
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

const stageLabels: Record<TradingStage, string> = {
  'market-service-ask-external': 'Market Service\n(ASK external)',
  'market-service-post-prices': 'Market Service\n(POST prices)',
  'trading-manager-react-prices': 'Trading Manager\n(REACT prices)',
  'price-forecast-twin-react-prices': 'Price-forecast Twin\n(REACT prices)',
  'price-forecast-twin-post-forecast': 'Price-forecast Twin\n(POST forecast)',
  'trading-manager-react-forecast': 'Trading Manager\n(REACT forecast)',
  'trading-manager-ask-fm': 'Trading Manager\n(ASK FM)',
  'flexibility-manager-answer': 'Flexibility Manager\n(ANSWER)',
  'trading-manager-share-offer': 'Trading Manager\n(POST Share Offer)',
  'market-day-ahead-cleared': 'Market Service\n(day-ahead cleared)',
  'consumption-twin-actual-usage': 'Consumption Twin\n(actual usage)',
  'trading-manager-intraday-correction': 'Trading Manager\n(POST intraday)',
  'market-intraday-cleared': 'Market Service\n(intraday cleared)'
};

export const TradingFlowDiagram: React.FC<TradingFlowDiagramProps> = ({ currentStage, isAnimating }) => {
  const [completedStages, setCompletedStages] = useState<TradingStage[]>([]);

  useEffect(() => {
    if (currentStage && !completedStages.includes(currentStage)) {
      setCompletedStages(prev => [...prev, currentStage]);
    }
  }, [currentStage, completedStages]);

  useEffect(() => {
    if (!isAnimating) {
      setCompletedStages([]);
    }
  }, [isAnimating]);

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-6 border-2 border-purple-200">
      <h3 className="text-base font-semibold text-gray-800 mb-4 text-center">
        Day-ahead / Intraday Trading Cycle
      </h3>

      <div className="flex items-center justify-between gap-2 mb-4 overflow-x-auto pb-4">
        {stageOrder.map((stage, index) => {
          const isCompleted = completedStages.includes(stage);
          const isCurrent = currentStage === stage && isAnimating;

          return (
            <div key={stage} className="flex items-center gap-1 flex-shrink-0">
              <div
                className={`
                  flex items-center justify-center w-16 h-16 rounded-full font-semibold text-center
                  transition-all duration-300 transform
                  ${isCurrent ? 'scale-110 ring-4 ring-yellow-400' : 'scale-100'}
                  ${isCompleted ? 'bg-purple-500 text-white ring-2 ring-purple-400' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-gray-300 text-gray-600' : ''}
                  ${isCurrent ? 'bg-yellow-400 text-gray-800 animate-pulse' : ''}
                `}
              >
                <span className="text-[9px] whitespace-pre-line leading-tight">{stageLabels[stage]}</span>
              </div>

              {index < stageOrder.length - 1 && (
                <div
                  className={`
                    h-1 w-4 transition-all duration-300
                    ${isCompleted ? 'bg-purple-500' : 'bg-gray-300'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-sm text-gray-600">
        {isAnimating && currentStage ? (
          <p className="font-semibold text-purple-600">
            Running: {stageLabels[currentStage].replace('\n', ' ')}
          </p>
        ) : completedStages.length > 0 ? (
          <p className="text-purple-600 font-semibold">Cycle completed</p>
        ) : (
          <p className="text-gray-500">Waiting for a scenario to run...</p>
        )}
      </div>
    </div>
  );
};
