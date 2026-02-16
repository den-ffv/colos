import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { apiRouter } from './router/api.router';
import { prisma } from './utils/prisma';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';

export const app: Application = express();

const CLIENT_ORIGIN = env.CLIENT_ORIGIN;
app.use(
  cors({
    origin: CLIENT_ORIGIN ? [CLIENT_ORIGIN] : true,
    credentials: true,
  }),
);
app.use(express.json());

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL + Prisma'
  });
});

app.use('/api', apiRouter);
app.use(errorHandler);


// Graceful shutdown
const shutdown = async () => {
  console.log("Закриття з'єднання з БД...");
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(env.PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${env.PORT}`);
  console.log(`📊 Prisma підключено до PostgreSQL`);
});
