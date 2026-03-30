import http from 'http';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './router/api.router';
import { prisma } from './utils/prisma';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { initSocketServer } from './services/socket';

export const app: Application = express();

/* ─── Security ──────────────────────────────────────────── */

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Stricter limit for auth routes
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

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL + Prisma',
  });
});

app.use('/api/auth', authLimiter);
app.use('/api', apiRouter);
app.use(errorHandler);

/* ─── HTTP Server + Socket.io ───────────────────────────── */

const httpServer = http.createServer(app);
initSocketServer(httpServer);

/* ─── Graceful shutdown ─────────────────────────────────── */

const shutdown = async () => {
  console.log("Закриття з'єднання з БД...");
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(env.PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${env.PORT}`);
  console.log(`📊 Prisma підключено до PostgreSQL`);
  console.log(`🔒 Helmet + Rate Limiting активні`);
  console.log(`⚡ Socket.io готовий до підключень`);
});
