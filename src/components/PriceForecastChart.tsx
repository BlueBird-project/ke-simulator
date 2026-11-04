import React from 'react';
import { PriceForecastInputPoint, PriceForecastOutputPoint } from '../types';

interface PriceForecastChartProps {
  prices: PriceForecastInputPoint[];
  forecast: PriceForecastOutputPoint[];
}

const WIDTH = 760;
const HEIGHT = 180;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

function hhmm(iso: string): string {
  // ISO strings here are always 'YYYY-MM-DDTHH:MM:SS(+00:00)?' (UTC) - plain
  // string slicing avoids timezone-conversion surprises from `Date`.
  const t = iso.indexOf('T');
  return t >= 0 ? iso.slice(t + 1, t + 6) : iso;
}

/**
 * Lightweight inline SVG line chart - no charting library. Plots the 96
 * historical prices and the 16 forecast points on one continuous index-based
 * time axis (both series are regular 15-min steps, so index spacing ==
 * time spacing), with a dashed divider marking where history ends and the
 * forecast begins.
 */
export const PriceForecastChart: React.FC<PriceForecastChartProps> = ({ prices, forecast }) => {
  const historyValues = prices.map(p => p.price);
  const forecastValues = forecast.map(p => p.yhat);
  const allValues = [...historyValues, ...forecastValues];
  if (allValues.length === 0) return null;

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const totalPoints = historyValues.length + forecastValues.length;
  const xStep = totalPoints > 1 ? innerWidth / (totalPoints - 1) : 0;

  const xAt = (index: number) => PAD_LEFT + index * xStep;
  const yAt = (value: number) => PAD_TOP + innerHeight - ((value - min) / range) * innerHeight;

  const historyPath = historyValues.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
  const forecastStartIndex = historyValues.length - 1; // connect the two lines visually
  const forecastPath = [historyValues[historyValues.length - 1], ...forecastValues]
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(forecastStartIndex + i)} ${yAt(v)}`)
    .join(' ');
  const dividerX = xAt(forecastStartIndex);

  // A handful of x-axis tick labels (first/last of each series + boundary).
  const tickIndices = Array.from(new Set([0, forecastStartIndex, totalPoints - 1]));
  const tickLabel = (index: number) =>
    index < historyValues.length ? hhmm(prices[index].ts) : hhmm(forecast[index - historyValues.length].ds);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Historical prices and forecast chart">
      {/* y-axis min/max labels */}
      <text x={2} y={PAD_TOP + 8} fontSize="9" fill="#0369a1">{max.toFixed(1)}</text>
      <text x={2} y={HEIGHT - PAD_BOTTOM} fontSize="9" fill="#0369a1">{min.toFixed(1)}</text>

      {/* divider between history and forecast */}
      <line x1={dividerX} y1={PAD_TOP} x2={dividerX} y2={HEIGHT - PAD_BOTTOM} stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1} />

      <path d={historyPath} fill="none" stroke="#0284c7" strokeWidth={1.5} />
      <path d={forecastPath} fill="none" stroke="#059669" strokeWidth={1.5} strokeDasharray="0" />

      {tickIndices.map(index => (
        <text key={index} x={Math.min(Math.max(xAt(index), PAD_LEFT), WIDTH - 30)} y={HEIGHT - 6} fontSize="9" fill="#475569">
          {tickLabel(index)}
        </text>
      ))}
    </svg>
  );
};
