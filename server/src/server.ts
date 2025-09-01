import { createServer } from 'http';
import { createApp } from '@/app';
import { env } from '@/config/config';
import { logger } from '@/utils/logger';
import { connectDatabase, disconnectDatabase } from '@/utils/prisma';

const startServer = async () => {
  try {
    // Підключення до бази даних через Prisma
    await connectDatabase();
    
    const app = createApp();
    const server = createServer(app);

    server.listen(env.PORT, () => {
      logger.info({ 
        port: env.PORT, 
        env: env.NODE_ENV 
      }, 'API started with Prisma database connection');
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await disconnectDatabase();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error: any) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();