import { randomUUID } from 'crypto';
import { NotificationType } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { emitNotification, type NotificationPayload } from './socket';

export { NotificationType };

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  body: string
  orderId?: string
}

export async function isEnabled(
  userId: string,
  type: NotificationType,
  channel: 'email' | 'inApp',
): Promise<boolean> {
  const pref = await prisma.notification_preferences.findUnique({
    where: { user_id_event_type: { user_id: userId, event_type: type } },
    select: { email_enabled: true, in_app_enabled: true },
  });
  if (!pref) return true;
  return channel === 'email' ? pref.email_enabled : pref.in_app_enabled;
}

/**
 * Inserts an in-app notification and emits it via socket.
 * Respects the user's inApp preference only.
 * Email notifications are handled separately by the email service.
 */
export async function create(params: CreateNotificationParams): Promise<void> {
  const { userId, type, title, body, orderId } = params;
  const inAppEnabled = await isEnabled(userId, type, 'inApp');
  if (!inAppEnabled) return;

  const notification = await prisma.notifications.create({
    data: { id: randomUUID(), user_id: userId, type, title, body, order_id: orderId ?? null },
    select: { id: true, created_at: true },
  });

  const payload: NotificationPayload = {
    id: notification.id,
    type,
    title,
    body,
    orderId: orderId ?? null,
    isRead: false,
    createdAt: notification.created_at.toISOString(),
  };
  emitNotification(userId, payload);
}

export async function getRecent(
  userId: string,
): Promise<{ notifications: NotificationPayload[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, type: true, title: true, body: true, order_id: true, is_read: true, created_at: true },
    }),
    prisma.notifications.count({ where: { user_id: userId, is_read: false } }),
  ]);

  return {
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      orderId: n.order_id,
      isRead: n.is_read,
      createdAt: n.created_at.toISOString(),
    })),
    unreadCount,
  };
}

export async function markRead(
  userId: string,
  options: { ids?: string[]; all?: boolean },
): Promise<void> {
  if (options.all) {
    await prisma.notifications.updateMany({
      where: { user_id: userId },
      data: { is_read: true },
    });
    return;
  }
  if (options.ids?.length) {
    await prisma.notifications.updateMany({
      where: { user_id: userId, id: { in: options.ids } },
      data: { is_read: true },
    });
  }
}

export async function getPreferences(
  userId: string,
): Promise<Array<{ eventType: NotificationType; emailEnabled: boolean; inAppEnabled: boolean }>> {
  const rows = await prisma.notification_preferences.findMany({
    where: { user_id: userId },
    select: { event_type: true, email_enabled: true, in_app_enabled: true },
  });
  return rows.map((r) => ({
    eventType: r.event_type,
    emailEnabled: r.email_enabled,
    inAppEnabled: r.in_app_enabled,
  }));
}

export async function upsertPreference(
  userId: string,
  eventType: NotificationType,
  emailEnabled: boolean,
  inAppEnabled: boolean,
): Promise<void> {
  await prisma.notification_preferences.upsert({
    where: { user_id_event_type: { user_id: userId, event_type: eventType } },
    update: { email_enabled: emailEnabled, in_app_enabled: inAppEnabled },
    create: { user_id: userId, event_type: eventType, email_enabled: emailEnabled, in_app_enabled: inAppEnabled },
  });
}
