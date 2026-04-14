import cron from 'node-cron';
import axios from 'axios';
import { prisma } from '../utils/prisma';
import { FuelType } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NbuRate {
  r030: number;
  txt: string;
  rate: number;
  cc: string;
  exchangedate: string;
}

export interface FuelPriceInput {
  diesel?: number;
  petrol_95?: number;
  petrol_92?: number;
  gas?: number;
}

// External API response format (set FUEL_PRICE_API_URL in .env)
// Expected JSON: { "diesel": 56.5, "petrol_95": 58.2, "petrol_92": 55.0, "gas": 26.0 }
interface ExternalFuelApiResponse {
  diesel?: number | string;
  petrol_95?: number | string;
  petrol_92?: number | string;
  gas?: number | string;
  // also accept common alternative key names
  Diesel?: number | string;
  A95?: number | string;
  A92?: number | string;
  Gas?: number | string;
}

// ─── Currencies to track ──────────────────────────────────────────────────────

const TRACKED_CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'];

// ─── Exchange rates (NBU official free API) ───────────────────────────────────

async function fetchExchangeRates(): Promise<void> {
  const response = await axios.get<NbuRate[]>(
    'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json',
    { timeout: 10_000 },
  );

  const filtered = response.data.filter((r) => TRACKED_CURRENCIES.includes(r.cc));
  if (filtered.length === 0) throw new Error('NBU API returned empty data');

  await prisma.exchangeRate.createMany({
    data: filtered.map((r) => ({ currency: r.cc, rate: r.rate })),
  });

  console.log(`[market-data] Exchange rates saved: ${filtered.map((r) => `${r.cc}=${r.rate}`).join(', ')}`);
}

// ─── Fuel prices ─────────────────────────────────────────────────────────────
// Primary source: FUEL_PRICE_API_URL env variable (any JSON API returning prices in UAH)
// Fallback: manual updates via POST /api/market-data/fuel-prices

async function fetchFuelPricesFromExternalApi(): Promise<void> {
  const apiUrl = process.env.FUEL_PRICE_API_URL;
  if (!apiUrl) throw new Error('FUEL_PRICE_API_URL is not configured');

  const response = await axios.get<ExternalFuelApiResponse>(apiUrl, { timeout: 10_000 });
  const d = response.data;

  const parse = (v: number | string | undefined): number | null => {
    if (v === undefined || v === null) return null;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? null : n;
  };

  const entries: Array<{ fuel_type: FuelType; price: number; source: string }> = [];

  const add = (ft: FuelType, val: number | null) => {
    if (val !== null && val > 0) entries.push({ fuel_type: ft, price: val, source: apiUrl });
  };

  add(FuelType.DIESEL,    parse(d.diesel    ?? d.Diesel));
  add(FuelType.PETROL_95, parse(d.petrol_95 ?? d.A95));
  add(FuelType.PETROL_92, parse(d.petrol_92 ?? d.A92));
  add(FuelType.GAS,       parse(d.gas       ?? d.Gas));

  if (entries.length === 0) throw new Error('External fuel API returned no usable price data');

  await prisma.fuelPrice.createMany({ data: entries });
  console.log(`[market-data] Fuel prices saved from ${apiUrl}: ${entries.map((e) => `${e.fuel_type}=${e.price}`).join(', ')}`);
}

// ─── Manual fuel price update (used when no external API is configured) ───────

export async function saveFuelPricesManually(
  prices: FuelPriceInput,
  source = 'manual',
): Promise<void> {
  const map: Array<[FuelType, number | undefined]> = [
    [FuelType.DIESEL,    prices.diesel],
    [FuelType.PETROL_95, prices.petrol_95],
    [FuelType.PETROL_92, prices.petrol_92],
    [FuelType.GAS,       prices.gas],
  ];

  const entries = map
    .filter(([, price]) => price !== undefined && price > 0)
    .map(([fuel_type, price]) => ({ fuel_type, price: price!, source }));

  if (entries.length === 0) throw new Error('No valid prices provided');

  await prisma.fuelPrice.createMany({ data: entries });
  console.log(`[market-data] Fuel prices saved manually: ${entries.map((e) => `${e.fuel_type}=${e.price}`).join(', ')}`);
}

// ─── Combined fetch ───────────────────────────────────────────────────────────

export async function fetchAllMarketData(): Promise<{ exchange: boolean; fuel: boolean }> {
  const result = { exchange: false, fuel: false };

  await fetchExchangeRates()
    .then(() => { result.exchange = true; })
    .catch((err) => console.error('[market-data] Exchange rates fetch failed:', err.message));

  await fetchFuelPricesFromExternalApi()
    .then(() => { result.fuel = true; })
    .catch((err) => console.warn('[market-data] Fuel prices auto-fetch skipped:', err.message));

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
// Runs at 08:00 and 18:00 every day (set TZ=Europe/Kiev in .env for Kyiv time)

export function startMarketDataScheduler(): void {
  cron.schedule('0 8,18 * * *', async () => {
    console.log('[market-data] Scheduled fetch started');
    await fetchAllMarketData();
  });

  console.log('[market-data] Scheduler started (08:00 and 18:00 daily)');
}
