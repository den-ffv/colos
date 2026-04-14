import http from 'http';
import { app } from './app';
import { prisma } from './utils/prisma';
import { env } from './config/env';
import { initSocketServer } from './services/socket';
import { disconnectRedis } from './utils/redis';
import { startMarketDataScheduler } from './services/market-data.service';

/* ─── HTTP Server + Socket.io ───────────────────────────── */

const httpServer = http.createServer(app);
initSocketServer(httpServer);

/* ─── Graceful shutdown ─────────────────────────────────── */

const shutdown = async () => {
  console.log("Закриття з'єднань...");
  await prisma.$disconnect();
  await disconnectRedis();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(env.PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${env.PORT}`);
  console.log(`📊 Prisma підключено до PostgreSQL`);
  console.log(`🔒 Helmet + Rate Limiting активні`);
  console.log(`⚡ Socket.io готовий до підключень`);
  console.log(`🗄️  Redis кешування підключено`);
  startMarketDataScheduler();
});
