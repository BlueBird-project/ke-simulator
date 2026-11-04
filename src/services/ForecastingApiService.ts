import { DayAheadForecastRequest, ForecastResult, ForecastingHealth } from '../types';

// Dev calls go through the Vite proxy (/forecast-api -> http://localhost:8000)
// to avoid CORS; override with VITE_FORECAST_API_URL in other environments.
const FORECAST_API_URL = import.meta.env.VITE_FORECAST_API_URL || '/forecast-api';

/**
 * Direct HTTP client for the Taimu forecasting API (FAST + Chronos-2),
 * developed by Adrian in flexibility-manager/forecasting.
 *
 * This is a plain REST call - NOT a Knowledge Engine interaction - and is
 * kept deliberately separate from KeBridgeService/MarketDataService so the
 * KE Bridge, ENTSO-E and simulated trading cycle are unaffected.
 */
export class ForecastingApiService {
  async getHealth(): Promise<ForecastingHealth> {
    const res = await fetch(`${FORECAST_API_URL}/health`);
    if (!res.ok) {
      throw new Error(`Forecasting API /health returned ${res.status}`);
    }
    return res.json();
  }

  async getDayAheadForecast(request: DayAheadForecastRequest): Promise<ForecastResult> {
    const res = await fetch(`${FORECAST_API_URL}/forecast/day-ahead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Forecasting API /forecast/day-ahead returned ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    return res.json();
  }
}

export const forecastingApiService = new ForecastingApiService();
