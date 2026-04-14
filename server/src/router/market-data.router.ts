import express from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { fetchAllMarketData, saveFuelPricesManually } from '../services/market-data.service';
import { ok, fail } from '../utils/http';

export const marketDataRouter = express.Router();

marketDataRouter.use(requireAuth);

// GET /api/market-data/exchange-rates
// Останні курси кожної відстежуваної валюти
marketDataRouter.get(
  '/exchange-rates',
  asyncHandler(async (_req, res) => {
    const currencies = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'];

    const latest = await Promise.all(
      currencies.map((cc) =>
        prisma.exchangeRate.findFirst({
          where: { currency: cc },
          orderBy: { fetched_at: 'desc' },
        }),
      ),
    );

    ok(res, latest.filter(Boolean));
  }),
);

// GET /api/market-data/exchange-rates/history?currency=USD&limit=30
marketDataRouter.get(
  '/exchange-rates/history',
  asyncHandler(async (req, res) => {
    const currency = String(req.query.currency ?? 'USD').toUpperCase();
    const limit = Math.min(Number(req.query.limit ?? 30), 100);

    const history = await prisma.exchangeRate.findMany({
      where: { currency },
      orderBy: { fetched_at: 'desc' },
      take: limit,
    });

    ok(res, history);
  }),
);

// GET /api/market-data/fuel-prices
// Останні ціни на кожен тип палива
marketDataRouter.get(
  '/fuel-prices',
  asyncHandler(async (_req, res) => {
    const fuelTypes = ['DIESEL', 'PETROL_95', 'PETROL_92', 'GAS'] as const;

    const latest = await Promise.all(
      fuelTypes.map((ft) =>
        prisma.fuelPrice.findFirst({
          where: { fuel_type: ft },
          orderBy: { fetched_at: 'desc' },
        }),
      ),
    );

    ok(res, latest.filter(Boolean));
  }),
);

// GET /api/market-data/fuel-prices/history?type=DIESEL&limit=30
marketDataRouter.get(
  '/fuel-prices/history',
  asyncHandler(async (req, res) => {
    const fuelType = String(req.query.type ?? 'DIESEL');
    const limit = Math.min(Number(req.query.limit ?? 30), 100);

    const history = await prisma.fuelPrice.findMany({
      where: { fuel_type: fuelType as any },
      orderBy: { fetched_at: 'desc' },
      take: limit,
    });

    ok(res, history);
  }),
);

// POST /api/market-data/fuel-prices
// Ручне введення цін (коли зовнішнє API не налаштоване)
// Body: { diesel?: 56.5, petrol_95?: 58.2, petrol_92?: 55.0, gas?: 26.0, source?: "OKKO" }
const fuelPriceSchema = z.object({
  diesel:    z.number().positive().optional(),
  petrol_95: z.number().positive().optional(),
  petrol_92: z.number().positive().optional(),
  gas:       z.number().positive().optional(),
  source:    z.string().max(100).optional(),
});

marketDataRouter.post(
  '/fuel-prices',
  asyncHandler(async (req, res) => {
    const parsed = fuelPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, 'Invalid request body', parsed.error.issues);
    }

    const { source, ...prices } = parsed.data;
    await saveFuelPricesManually(prices, source ?? 'manual');
    ok(res, { message: 'Fuel prices saved' });
  }),
);

// POST /api/market-data/fetch
// Примусово запускає автоматичне оновлення (exchange rates + fuel via FUEL_PRICE_API_URL)
marketDataRouter.post(
  '/fetch',
  asyncHandler(async (_req, res) => {
    const result = await fetchAllMarketData();
    ok(res, { message: 'Market data fetch completed', result });
  }),
);
