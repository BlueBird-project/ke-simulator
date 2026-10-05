import React, { useState } from 'react';
import { PricePoint, FlowEvent } from '../types';
import { PriceTable } from './PriceTable';
import { EventTimeline } from './EventTimeline';
import { generateExamplePrices, parseCSV } from '../utils/priceUtils';
import { marketService } from '../services/MarketService';
import { Upload, Plus } from 'lucide-react';

interface MarketSideUIProps {
  onPublish: (prices: PricePoint[]) => void;
  isPublishing: boolean;
  flowEvents: FlowEvent[];
}

export const MarketSideUI: React.FC<MarketSideUIProps> = ({
  onPublish,
  isPublishing,
  flowEvents
}) => {
  const [prices, setPrices] = useState<PricePoint[]>([]);

  const handleLoadExample = () => {
    const examplePrices = generateExamplePrices();
    setPrices(examplePrices);
    marketService.setPrices(examplePrices);
  };

  const handleLoadCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          const parsedPrices = parseCSV(content);
          setPrices(parsedPrices);
          marketService.setPrices(parsedPrices);
        } catch (error) {
          alert('Error parsing the CSV. Make sure it has the format: startTime,endTime,price');
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    const updated = [...prices];
    updated[index] = { ...updated[index], price: newPrice };
    setPrices(updated);
    marketService.updatePrice(index, newPrice);
  };

  const handleDeletePrice = (index: number) => {
    const updated = prices.filter((_, i) => i !== index);
    setPrices(updated);
  };

  const handlePublish = () => {
    if (prices.length > 0) {
      onPublish(prices);
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-300 shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-blue-900 mb-2">
          Market Side
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-green-700 font-medium">Smart Connector connected</span>
        </div>
      </div>

      {/* Load buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={handleLoadExample}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus size={18} />
          Load example prices
        </button>

        <label className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer">
          <Upload size={18} />
          Load CSV
          <input
            type="file"
            accept=".csv"
            onChange={handleLoadCSV}
            className="hidden"
          />
        </label>
      </div>

      {/* Price table */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">
          Prices ({prices.length} intervals)
        </h3>
        <PriceTable
          prices={prices}
          editable={true}
          onPriceChange={handlePriceChange}
          onPriceDelete={handleDeletePrice}
        />
      </div>

      {/* Publish button */}
      <div className="mb-6">
        <button
          onClick={handlePublish}
          disabled={prices.length === 0 || isPublishing}
          className={`
            w-full py-3 rounded-lg font-bold text-white transition-all transform
            ${isPublishing ? 'bg-yellow-500 animate-pulse cursor-wait' : 'bg-green-600 hover:bg-green-700 active:scale-95'}
            ${prices.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isPublishing ? 'Publishing prices...' : 'Publish new prices'}
        </button>
      </div>

      {/* Event timeline */}
      <EventTimeline
        events={flowEvents}
        title="Event log (Market Side)"
      />
    </div>
  );
};
