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

// ─── Fuel prices — auto.ria.com scraper ──────────────────────────────────────
// Scrapes average fuel prices for a given region from auto.ria.com/uk/toplivo/{region}/
// Region slug (default: kiev) can be overridden via AUTORIA_REGION env variable.
//
// URL slugs → FuelType mapping:
//   a95  → PETROL_95   a92 → PETROL_92   dt → DIESEL   gaz → GAS
// a95plus is skipped (not a separate FuelType in schema; A-95 average is used instead)

const FUEL_SLUG_MAP: Record<string, FuelType> = {
  a95:  FuelType.PETROL_95,
  a92:  FuelType.PETROL_92,
  dt:   FuelType.DIESEL,
  gaz:  FuelType.GAS,
};

// Matches: href=".../toplivo/{region}/{slug}/" ... bold size18">{price}</div>
const ROW_PATTERN =
  /href="https:\/\/auto\.ria\.com\/uk\/toplivo\/[^/]+\/([a-z0-9]+)\/"[^>]*>[^<]+<\/a>\s*<\/div>\s*<div class="t-cell bold size18">([0-9]+\.[0-9]+|-)<\/div>/g;

async function fetchFuelPricesFromAutoRia(): Promise<void> {
  const region = process.env.AUTORIA_REGION ?? 'kiev';
  const url = `https://auto.ria.com/uk/toplivo/${region}/`;
  const source = `auto.ria.com/toplivo/${region}`;

  const response = await axios.get<string>(url, {
    timeout: 10_000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; COLOS-CRM/1.0; +https://colos.ua)',
      'Accept-Language': 'uk-UA,uk;q=0.9',
    },
  });

  const html: string = response.data;
  const entries: Array<{ fuel_type: FuelType; price: number; source: string }> = [];
  const seen = new Set<FuelType>();

  let match: RegExpExecArray | null;
  // Reset lastIndex before exec loop
  ROW_PATTERN.lastIndex = 0;

  while ((match = ROW_PATTERN.exec(html)) !== null) {
    const slug = match[1];
    const rawPrice = match[2];
    const fuelType = FUEL_SLUG_MAP[slug];

    if (!fuelType) continue;                   // skip a100, a95plus тощо
    if (seen.has(fuelType)) continue;          // перший збіг — середня ціна, решту пропускаємо
    if (rawPrice === '-') continue;            // ціна недоступна

    const price = parseFloat(rawPrice);
    if (isNaN(price) || price <= 0) continue;

    entries.push({ fuel_type: fuelType, price, source });
    seen.add(fuelType);
  }

  if (entries.length === 0) {
    throw new Error(`auto.ria.com: no fuel prices found for region "${region}"`);
  }

  await prisma.fuelPrice.createMany({ data: entries });
  console.log(
    `[market-data] Fuel prices from auto.ria.com (${region}): ` +
    entries.map((e) => `${e.fuel_type}=${e.price}`).join(', '),
  );
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

  await fetchFuelPricesFromAutoRia()
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
