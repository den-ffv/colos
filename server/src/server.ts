import { createServer } from 'http';
import { createApp } from './app';
import { env } from '@/config';
import { logger } from '@/utils/logger';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API started');
});
