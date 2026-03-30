import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from './env';

export type OrderStatusChangedPayload = {
  orderId: string;
  orderNumber: string;
  newStatus: string;
  previousStatus: string;
};

export type OrderUpdatedPayload = {
  orderId: string;
  orderNumber: string;
  action: 'created' | 'updated' | 'deleted';
};

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(getApiBaseUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
