import React, { useState } from 'react';
import { PricePoint } from '../types';
import { Trash2, Edit2, Check, X } from 'lucide-react';

interface PriceTableProps {
  prices: PricePoint[];
  editable?: boolean;
  onPriceChange?: (index: number, newPrice: number) => void;
  onPriceDelete?: (index: number) => void;
}

export const PriceTable: React.FC<PriceTableProps> = ({
  prices,
  editable = false,
  onPriceChange,
  onPriceDelete
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const handleEditClick = (index: number, currentPrice: number) => {
    setEditingIndex(index);
    setEditValue(currentPrice.toString());
  };

  const handleSave = (index: number) => {
    const newPrice = parseFloat(editValue);
    if (!isNaN(newPrice) && onPriceChange) {
      onPriceChange(index, newPrice);
      setEditingIndex(null);
    }
  };

  const handleCancel = () => {
    setEditingIndex(null);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2 text-left font-semibold text-gray-700">
                Start
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">
                End
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700">
                Price (EUR/MWh)
              </th>
              {editable && (
                <th className="px-4 py-2 text-center font-semibold text-gray-700 w-24">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {prices.length === 0 ? (
              <tr>
                <td colSpan={editable ? 4 : 3} className="px-4 py-4 text-center text-gray-400 text-xs">
                  No price data
                </td>
              </tr>
            ) : (
              prices.map((point, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-mono">
                    {point.startTime}
                  </td>
                  <td className="px-4 py-2 text-gray-700 font-mono">
                    {point.endTime}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-blue-600">
                    {editingIndex === index ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="w-20 px-2 py-1 border border-blue-400 rounded text-right"
                        autoFocus
                      />
                    ) : (
                      point.price.toFixed(2)
                    )}
                  </td>
                  {editable && (
                    <td className="px-4 py-2 text-center flex items-center justify-center gap-1">
                      {editingIndex === index ? (
                        <>
                          <button
                            onClick={() => handleSave(index)}
                            className="p-1 hover:bg-green-100 rounded text-green-600"
                            title="Save"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1 hover:bg-gray-100 rounded text-gray-400"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditClick(index, point.price)}
                            className="p-1 hover:bg-blue-100 rounded text-blue-600"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => onPriceDelete?.(index)}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
