import React, { useEffect, useState } from 'react';
import { FlowStage } from '../types';

interface FlowDiagramProps {
  currentStage: FlowStage | null;
  isAnimating: boolean;
}

const stageOrder: FlowStage[] = [
  'prices-loaded',
  'market-connector-processing',
  'knowledge-engine-received',
  'knowledge-engine-routing',
  'energy-connector-received',
  'energy-manager-updated'
];

const stageLabels: Record<FlowStage, string> = {
  'prices-loaded': 'Market Side UI',
  'market-connector-processing': 'Smart Connector\n(Market)',
  'knowledge-engine-received': 'Knowledge Engine',
  'knowledge-engine-routing': 'Knowledge Engine\n(Routing)',
  'energy-connector-received': 'Smart Connector\n(Energy)',
  'energy-manager-updated': 'Energy Manager UI'
};

export const FlowDiagram: React.FC<FlowDiagramProps> = ({ currentStage, isAnimating }) => {
  const [completedStages, setCompletedStages] = useState<FlowStage[]>([]);

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
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8 border-2 border-indigo-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-6 text-center">
        Data Journey - Price Flow
      </h3>

      <div className="flex items-center justify-between gap-2 mb-8 overflow-x-auto pb-4">
        {stageOrder.map((stage, index) => {
          const isCompleted = completedStages.includes(stage);
          const isCurrent = currentStage === stage && isAnimating;

          return (
            <div key={stage} className="flex items-center gap-2 flex-shrink-0">
              <div
                className={`
                  flex items-center justify-center w-20 h-20 rounded-full font-semibold text-center
                  transition-all duration-300 transform
                  ${isCurrent ? 'scale-110 ring-4 ring-yellow-400' : 'scale-100'}
                  ${isCompleted ? 'bg-green-500 text-white ring-2 ring-green-400' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-gray-300 text-gray-600' : ''}
                  ${isCurrent ? 'bg-yellow-400 text-gray-800 animate-pulse' : ''}
                `}
              >
                <span className="text-xs">{stageLabels[stage]}</span>
              </div>

              {index < stageOrder.length - 1 && (
                <div
                  className={`
                    h-1 w-12 transition-all duration-300
                    ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-sm text-gray-600">
        {isAnimating && currentStage ? (
          <p className="font-semibold text-indigo-600">
            Transmitting: {stageLabels[currentStage]}
          </p>
        ) : completedStages.length > 0 ? (
          <p className="text-green-600 font-semibold">Transmission completed</p>
        ) : (
          <p className="text-gray-500">Waiting for price publication...</p>
        )}
      </div>
    </div>
  );
};
