import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './router/api.router';
import { errorHandler } from './middleware/errorHandler';
import { env } from './config/env';

export const app: Application = express();

/* ─── Security ──────────────────────────────────────────── */

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

/* ─── Middleware ────────────────────────────────────────── */

const CLIENT_ORIGIN = env.CLIENT_ORIGIN;
app.use(
  cors({
    origin: CLIENT_ORIGIN ? [CLIENT_ORIGIN] : true,
    credentials: true,
  }),
);
app.use(express.json());

/* ─── Routes ────────────────────────────────────────────── */

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL + Prisma',
  });
});

app.use('/api/auth', authLimiter);
app.use('/api', apiRouter);
app.use(errorHandler);
