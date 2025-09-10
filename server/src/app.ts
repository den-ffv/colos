import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { logger } from '@/utils/logger';
import { env } from '@/config/config';
import { healthRouter } from '@/routes/health.router';
import { apiRouter } from '@/routes/api.router';
import { publicRouter } from '@/routes/public.router';

import { notFoundHandler, errorHandler } from '@/middlewares/error';
import { authRouter } from './routes/auth.router';

export function createApp(): Application {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN || true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', apiRouter);
  app.use('/public/api', publicRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
