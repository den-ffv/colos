import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok } from '../utils/http';
import { NotificationType } from '@prisma/client';
import * as NotificationService from '../services/notification.service';

export const notificationsRouter = express.Router();
notificationsRouter.use(requireAuth);

/* ─── GET / — last 50 notifications + unreadCount ─────── */
notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth.sub;
    const data = await NotificationService.getRecent(userId);
    return ok(res, data);
  }),
);

/* ─── PATCH /read — mark as read ──────────────────────── */
const markReadSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
}).refine((d) => d.all === true || (Array.isArray(d.ids) && d.ids.length > 0), {
  message: 'Provide ids[] or all:true',
});

notificationsRouter.patch(
  '/read',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = markReadSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Invalid body', parsed.error.issues);
    const userId = (req as AuthenticatedRequest).auth.sub;
    await NotificationService.markRead(userId, parsed.data);
    return ok(res, { success: true });
  }),
);

/* ─── GET /preferences — user's notification preferences ─ */
notificationsRouter.get(
  '/preferences',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth.sub;
    const prefs = await NotificationService.getPreferences(userId);
    return ok(res, prefs);
  }),
);

/* ─── PATCH /preferences — upsert one preference ─────── */
const upsertPrefSchema = z.object({
  eventType: z.nativeEnum(NotificationType),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});

notificationsRouter.patch(
  '/preferences',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = upsertPrefSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Invalid body', parsed.error.issues);
    const userId = (req as AuthenticatedRequest).auth.sub;
    await NotificationService.upsertPreference(
      userId,
      parsed.data.eventType,
      parsed.data.emailEnabled,
      parsed.data.inAppEnabled,
    );
    return ok(res, { success: true });
  }),
);
