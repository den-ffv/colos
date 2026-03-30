import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { env } from '../config/env';

let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN ? [env.CLIENT_ORIGIN] : true,
      credentials: true,
    },
  });

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.companyId = payload.company_id;
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const companyId = socket.data.companyId as string;
    socket.join(`company:${companyId}`);
    console.log(`Socket connected: ${socket.id} (company: ${companyId})`);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIo(): SocketServer | null {
  return io;
}

/** Emit order status change to all sockets in the company room */
export function emitOrderStatusChanged(
  companyId: string,
  data: { orderId: string; orderNumber: string; newStatus: string; previousStatus: string },
): void {
  io?.to(`company:${companyId}`).emit('order:statusChanged', data);
}

/** Emit full order update (create/edit) */
export function emitOrderUpdated(
  companyId: string,
  data: { orderId: string; orderNumber: string; action: 'created' | 'updated' | 'deleted' },
): void {
  io?.to(`company:${companyId}`).emit('order:updated', data);
}
