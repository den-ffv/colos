# Notification System & Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app bell notifications for CRM users, email notifications to clients on status change, per-event notification preferences, and a profile page with password change + notification toggles.

**Architecture:** New `notifications` + `notification_preferences` Prisma models; `NotificationService` wires DB insert to Socket.io per-user room emit; lifecycle endpoints in `orders.router.ts` call the service after each state change; frontend CrmShell gains a bell icon + dropdown + toast driven by the socket; a new `/profile` page handles password change and preference toggles.

**Tech Stack:** Express + Prisma + Socket.io (backend); React 19 + TypeScript (frontend); existing Nodemailer email service; Node.js `crypto.randomUUID` for IDs.

**Spec:** `docs/superpowers/specs/2026-04-26-notifications-design.md`

---

## File Map

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add `notifications`, `notification_preferences`, `NotificationType` enum |
| `server/src/services/socket.ts` | Add per-user room join + `emitNotification` helper |
| `server/src/services/notification.service.ts` | **New** — 6 functions |
| `server/src/services/email.service.ts` | Add `sendOrderStatusUpdate` |
| `server/src/router/notifications.router.ts` | **New** — 4 endpoints |
| `server/src/router/api.router.ts` | Mount `/notifications` router |
| `server/src/router/auth.router.ts` | Add `PATCH /password` endpoint |
| `server/src/router/orders.router.ts` | Call NotificationService in 5 lifecycle hooks |
| `server/src/tests/app.test.ts` | Add mocks + tests for new endpoints |
| `client/src/features/crm/CrmShell.tsx` | Bell icon, unread state, socket listener, toast |
| `client/src/features/crm/NotificationDropdown.tsx` | **New** |
| `client/src/features/crm/NotificationToast.tsx` | **New** |
| `client/src/features/profile/ProfilePage.tsx` | **New** |

---

## Task 1: Prisma — Add notification models and migrate

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1.1: Add `NotificationType` enum and two new models to schema**

Add to `server/prisma/schema.prisma` (after the existing enums, before closing):

```prisma
enum NotificationType {
  ORDER_CREATED
  DRIVER_ASSIGNED
  DRIVER_ACCEPTED
  STATUS_IN_TRANSIT
  STATUS_DELIVERED
  PREPAYMENT_REQUESTED
  PREPAYMENT_RECEIVED
  FINAL_PAYMENT_REQUESTED
  ORDER_COMPLETED
}

model notifications {
  id         String           @id
  user_id    String
  type       NotificationType
  title      String
  body       String
  order_id   String?
  is_read    Boolean          @default(false)
  created_at DateTime         @default(now())
  users      users            @relation(fields: [user_id], references: [id], onDelete: Cascade)
  orders     orders?          @relation(fields: [order_id], references: [id], onDelete: SetNull)

  @@index([user_id, is_read])
  @@index([created_at])
}

model notification_preferences {
  user_id        String
  event_type     NotificationType
  email_enabled  Boolean          @default(true)
  in_app_enabled Boolean          @default(true)
  users          users            @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@id([user_id, event_type])
}
```

Also add back-relations to the `users` model:

```prisma
notifications              notifications[]
notification_preferences   notification_preferences[]
```

And add the `orders` back-relation in the `orders` model:

```prisma
notifications  notifications[]
```

- [ ] **Step 1.2: Run Prisma migration**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server
npx prisma migrate dev --name add_notifications
```

Expected: migration created and applied, Prisma client regenerated.

- [ ] **Step 1.3: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 1.4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add notifications and notification_preferences Prisma models"
```

---

## Task 2: Socket.ts — per-user room and emitNotification helper

**Files:**
- Modify: `server/src/services/socket.ts`

- [ ] **Step 2.1: Add per-user room join on connect**

In `server/src/services/socket.ts`, inside `io.on('connection', (socket) => { ... })`, add the per-user join immediately after the existing `socket.join('company:' + companyId)` line:

```ts
socket.join(`user:${socket.data.userId as string}`)
```

- [ ] **Step 2.2: Add `emitNotification` export**

Add this function at the bottom of `server/src/services/socket.ts`, after the existing `emitOrderUpdated` function:

```ts
export interface NotificationPayload {
  id: string
  type: string
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: string
}

/** Emit a notification to a specific user's socket room */
export function emitNotification(userId: string, payload: NotificationPayload): void {
  io?.to(`user:${userId}`).emit('notification', payload)
}
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add server/src/services/socket.ts
git commit -m "feat: add per-user socket room and emitNotification helper"
```

---

## Task 3: NotificationService — all 6 functions

**Files:**
- Create: `server/src/services/notification.service.ts`

- [ ] **Step 3.1: Create the service file**

Create `server/src/services/notification.service.ts`:

```ts
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
  const pref = await prisma.notificationPreference.findUnique({
    where: { user_id_event_type: { user_id: userId, event_type: type } },
    select: { email_enabled: true, in_app_enabled: true },
  });
  if (!pref) return true;
  return channel === 'email' ? pref.email_enabled : pref.in_app_enabled;
}

export async function create(params: CreateNotificationParams): Promise<void> {
  const { userId, type, title, body, orderId } = params;
  const inAppEnabled = await isEnabled(userId, type, 'inApp');
  if (!inAppEnabled) return;

  const notification = await prisma.notification.create({
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
    prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, type: true, title: true, body: true, order_id: true, is_read: true, created_at: true },
    }),
    prisma.notification.count({ where: { user_id: userId, is_read: false } }),
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
    await prisma.notification.updateMany({
      where: { user_id: userId },
      data: { is_read: true },
    });
    return;
  }
  if (options.ids?.length) {
    await prisma.notification.updateMany({
      where: { user_id: userId, id: { in: options.ids } },
      data: { is_read: true },
    });
  }
}

export async function getPreferences(
  userId: string,
): Promise<Array<{ eventType: NotificationType; emailEnabled: boolean; inAppEnabled: boolean }>> {
  const rows = await prisma.notificationPreference.findMany({
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
  await prisma.notificationPreference.upsert({
    where: { user_id_event_type: { user_id: userId, event_type: eventType } },
    update: { email_enabled: emailEnabled, in_app_enabled: inAppEnabled },
    create: { user_id: userId, event_type: eventType, email_enabled: emailEnabled, in_app_enabled: inAppEnabled },
  });
}
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add server/src/services/notification.service.ts
git commit -m "feat: add NotificationService with create, getRecent, markRead, preferences"
```

---

## Task 4: Email service — sendOrderStatusUpdate

**Files:**
- Modify: `server/src/services/email.service.ts`

- [ ] **Step 4.1: Add `SendStatusUpdateParams` interface and function**

Append to the end of `server/src/services/email.service.ts`:

```ts
/* ─── sendOrderStatusUpdate ──────────────────────────────── */

export interface SendStatusUpdateParams {
  to: string
  clientName: string
  contractNumber: string
  status: 'IN_TRANSIT' | 'DELIVERED'
  pickupAddress: string
  deliveryAddress: string
}

export async function sendOrderStatusUpdate(params: SendStatusUpdateParams): Promise<void> {
  const { to, clientName, contractNumber, status, pickupAddress, deliveryAddress } = params;
  const isDelivered = status === 'DELIVERED';
  const statusLabel = isDelivered ? 'Доставлено' : 'В дорозі';
  const statusColor = isDelivered ? '#16a34a' : '#2563eb';
  const statusBg    = isDelivered ? '#f0fdf4'  : '#eff6ff';
  const statusBorder = isDelivered ? '#bbf7d0' : '#bfdbfe';

  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL DEV] sendOrderStatusUpdate → to: ${to}`);
    console.log(`[EMAIL DEV] Contract: ${contractNumber}, Status: ${statusLabel}`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        ${header()}
        <p style="margin:0 0 8px;">Доброго дня, <strong>${clientName}</strong>!</p>
        <p style="color:#64748b;margin:0 0 24px;">
          Статус вашого договору <strong>${contractNumber}</strong> оновлено.
        </p>
        <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:8px;
                    padding:16px 24px;text-align:center;margin-bottom:24px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:${statusColor};">${statusLabel}</p>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                    padding:16px 24px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0;color:#64748b;font-size:13px;width:40%;">Завантаження:</td>
              <td style="padding:6px 0;font-weight:600;font-size:13px;">${pickupAddress}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0;">
              <td style="padding:6px 0;color:#64748b;font-size:13px;">Розвантаження:</td>
              <td style="padding:6px 0;font-weight:600;font-size:13px;">${deliveryAddress}</td>
            </tr>
          </table>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:0;">
          Дякуємо, що обрали COLOS CRM.
        </p>
      </div>
    </div>`;

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Договір №${contractNumber} — ${statusLabel}`,
    html,
  });
}
```

- [ ] **Step 4.2: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add server/src/services/email.service.ts
git commit -m "feat: add sendOrderStatusUpdate email function"
```

---

## Task 5: Notifications router — 4 endpoints

**Files:**
- Create: `server/src/router/notifications.router.ts`
- Modify: `server/src/router/api.router.ts`

- [ ] **Step 5.1: Create the notifications router**

Create `server/src/router/notifications.router.ts`:

```ts
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
    if (!parsed.success) return fail(res, 400, parsed.error.errors[0]?.message ?? 'Invalid body');
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
    if (!parsed.success) return fail(res, 400, parsed.error.errors[0]?.message ?? 'Invalid body');
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
```

- [ ] **Step 5.2: Mount the notifications router in api.router.ts**

In `server/src/router/api.router.ts`, add the import and mount:

```ts
import { notificationsRouter } from './notifications.router';
```

And add after the existing `apiRouter.use('/users', usersRouter)` line:

```ts
apiRouter.use('/notifications', notificationsRouter);
```

- [ ] **Step 5.3: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5.4: Commit**

```bash
git add server/src/router/notifications.router.ts server/src/router/api.router.ts
git commit -m "feat: add notifications router with GET, PATCH /read, GET/PATCH preferences"
```

---

## Task 6: Auth router — PATCH /api/auth/password

**Files:**
- Modify: `server/src/router/auth.router.ts`

- [ ] **Step 6.1: Add password change endpoint**

In `server/src/router/auth.router.ts`, import `requireAuth` and `AuthenticatedRequest` at the top (they are not yet imported in this file — add alongside existing imports):

```ts
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
```

Then add the endpoint at the end of the file (before the closing module boundary, after the last route):

```ts
/* ─── PATCH /password – змінити пароль ──────────────── */
authRouter.patch(
  '/password',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body as Record<string, unknown> | null) ?? {};
    const currentPassword = ensureString(body.currentPassword);
    const newPassword = ensureString(body.newPassword);

    if (!currentPassword || !newPassword) {
      return fail(res, 400, 'currentPassword and newPassword are required');
    }
    if (newPassword.length < 8) {
      return fail(res, 400, 'newPassword must be at least 8 characters');
    }

    const userId = (req as AuthenticatedRequest).auth.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) return fail(res, 404, 'User not found');

    const passwordOk = await bcrypt.compare(currentPassword, user.password);
    if (!passwordOk) return fail(res, 400, 'Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: newHash } });

    return ok(res, { success: true });
  }),
);
```

- [ ] **Step 6.2: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add server/src/router/auth.router.ts
git commit -m "feat: add PATCH /api/auth/password endpoint"
```

---

## Task 7: Orders router — lifecycle notification integration

**Files:**
- Modify: `server/src/router/orders.router.ts`

- [ ] **Step 7.1: Import NotificationService and sendOrderStatusUpdate**

At the top of `server/src/router/orders.router.ts`, add imports alongside the existing service imports:

```ts
import * as NotificationService from '../services/notification.service';
import { sendOrderStatusUpdate } from '../services/email.service';
```

- [ ] **Step 7.2: Order created — notify assigned logist**

In `POST /` (order creation endpoint), after the `prisma.order.create` call and `emitOrderUpdated(...)`, add:

```ts
// Notify the creating logist that the order was registered
NotificationService.create({
  userId: auth.sub,
  type: 'ORDER_CREATED',
  title: `Договір ${created.order_number} створено`,
  body: `${created.pickup_address} → ${created.delivery_address}`,
  orderId: created.id,
}).catch((err: unknown) => console.error('[NOTIFY] ORDER_CREATED failed:', err));
```

- [ ] **Step 7.3: CONFIRMED → notify driver (in-app) alongside existing email**

In `PATCH /:id/status`, after the existing block that calls `sendDriverAssigned` (around line 682), add an in-app notification for the driver. The block currently looks like:

```ts
if (newStatus === 'CONFIRMED' && updated.driver_id) {
  prisma.driver.findFirst({ ... }).then((driver) => {
    if (!driver?.user?.email) return;
    sendDriverAssigned({ ... }).catch(...);
  }).catch(...);
}
```

Add inside the `.then((driver) => { ... })` block, after the `sendDriverAssigned` call:

```ts
if (driver.user_id) {
  NotificationService.create({
    userId: driver.user_id,
    type: 'DRIVER_ASSIGNED',
    title: `Новий рейс: ${updated.order_number}`,
    body: `${updated.pickup_address} → ${updated.delivery_address}`,
    orderId: updated.id,
  }).catch((err: unknown) => console.error('[NOTIFY] DRIVER_ASSIGNED failed:', err));
}
```

Also add `user_id: true` to the `select` in `prisma.driver.findFirst`:

```ts
select: { first_name: true, last_name: true, user_id: true, user: { select: { email: true } } },
```

- [ ] **Step 7.4: IN_TRANSIT → email client**

In `PATCH /:id/status`, after the `emitOrderStatusChanged(...)` call and before `return ok(res, orderDto(updated))`, add:

```ts
// Email client when order moves to IN_TRANSIT
if (finalStatus === 'IN_TRANSIT') {
  prisma.order.findUnique({
    where: { id: req.params.id },
    select: { client: { select: { email: true, company_name: true } }, pickup_address: true, delivery_address: true },
  }).then((o) => {
    if (!o?.client?.email) return;
    sendOrderStatusUpdate({
      to: o.client.email,
      clientName: o.client.company_name,
      contractNumber: updated.order_number,
      status: 'IN_TRANSIT',
      pickupAddress: o.pickup_address,
      deliveryAddress: o.delivery_address,
    }).catch((err: unknown) => console.error('[EMAIL] IN_TRANSIT status update failed:', err));
  }).catch((err: unknown) => console.error('[EMAIL] client lookup for IN_TRANSIT failed:', err));
}

// Email client when order is DELIVERED (before auto-transition to AWAITING_FINAL_PAYMENT)
if (newStatus === 'DELIVERED') {
  prisma.order.findUnique({
    where: { id: req.params.id },
    select: { client: { select: { email: true, company_name: true } }, pickup_address: true, delivery_address: true },
  }).then((o) => {
    if (!o?.client?.email) return;
    sendOrderStatusUpdate({
      to: o.client.email,
      clientName: o.client.company_name,
      contractNumber: updated.order_number,
      status: 'DELIVERED',
      pickupAddress: o.pickup_address,
      deliveryAddress: o.delivery_address,
    }).catch((err: unknown) => console.error('[EMAIL] DELIVERED status update failed:', err));
  }).catch((err: unknown) => console.error('[EMAIL] client lookup for DELIVERED failed:', err));
}
```

- [ ] **Step 7.5: DRIVER_ACCEPTED — notify logist**

In `POST /:id/accept`, after `emitOrderStatusChanged(...)`, add:

```ts
// Notify assigned logist that driver accepted
prisma.order.findUnique({
  where: { id: req.params.id },
  select: { assigned_manager_id: true, order_number: true },
}).then((o) => {
  if (!o) return;
  NotificationService.create({
    userId: o.assigned_manager_id,
    type: 'DRIVER_ACCEPTED',
    title: `Водій прийняв договір ${o.order_number}`,
    body: 'Договір готовий до виконання',
    orderId: req.params.id,
  }).catch((err: unknown) => console.error('[NOTIFY] DRIVER_ACCEPTED failed:', err));
}).catch((err: unknown) => console.error('[NOTIFY] manager lookup for DRIVER_ACCEPTED failed:', err));
```

- [ ] **Step 7.6: mark-prepaid — notify logist + driver**

In `POST /:id/mark-prepaid`, after `emitOrderStatusChanged(...)`, add:

```ts
// Notify logist and driver that prepayment received
prisma.order.findUnique({
  where: { id: req.params.id },
  select: {
    assigned_manager_id: true,
    order_number: true,
    driver: { select: { user_id: true } },
  },
}).then((o) => {
  if (!o) return;
  const tasks = [
    NotificationService.create({
      userId: o.assigned_manager_id,
      type: 'PREPAYMENT_RECEIVED',
      title: `Аванс отримано — ${o.order_number}`,
      body: `Сума: ${amount.toLocaleString('uk-UA')} ₴`,
      orderId: req.params.id,
    }),
  ];
  if (o.driver?.user_id) {
    tasks.push(NotificationService.create({
      userId: o.driver.user_id,
      type: 'PREPAYMENT_RECEIVED',
      title: `Аванс отримано — ${o.order_number}`,
      body: 'Ви можете виїжджати',
      orderId: req.params.id,
    }));
  }
  return Promise.all(tasks);
}).catch((err: unknown) => console.error('[NOTIFY] PREPAYMENT_RECEIVED failed:', err));
```

- [ ] **Step 7.7: mark-final-paid — notify logist + all company ADMINs**

In `POST /:id/mark-final-paid`, after `emitOrderStatusChanged(...)`, add:

```ts
// Notify logist and all ADMINs of the company that order is completed
prisma.order.findUnique({
  where: { id: req.params.id },
  select: { assigned_manager_id: true, order_number: true, company_id: true },
}).then(async (o) => {
  if (!o) return;
  const adminUsers = await prisma.user.findMany({
    where: {
      company_id: o.company_id,
      user_roles: { some: { role: 'ADMIN' } },
    },
    select: { id: true },
  });
  const recipientIds = Array.from(new Set([
    o.assigned_manager_id,
    ...adminUsers.map((u) => u.id),
  ]));
  await Promise.all(recipientIds.map((uid) =>
    NotificationService.create({
      userId: uid,
      type: 'ORDER_COMPLETED',
      title: `Договір ${o.order_number} завершено`,
      body: 'Фінальна оплата отримана',
      orderId: req.params.id,
    }),
  ));
}).catch((err: unknown) => console.error('[NOTIFY] ORDER_COMPLETED failed:', err));
```

- [ ] **Step 7.8: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 7.9: Run all backend tests**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass (existing 22 tests).

- [ ] **Step 7.10: Commit**

```bash
git add server/src/router/orders.router.ts
git commit -m "feat: integrate NotificationService into order lifecycle endpoints"
```

---

## Task 8: Backend tests — new endpoints

**Files:**
- Modify: `server/src/tests/app.test.ts`

- [ ] **Step 8.1: Add new Prisma mocks to the vi.mock block**

In `app.test.ts`, find the `vi.mock('../utils/prisma', ...)` block and add these missing models:

```ts
notification: {
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
},
notificationPreference: {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
},
```

- [ ] **Step 8.2: Write and run the notifications GET test**

Add a new describe block at the end of `app.test.ts`:

```ts
/* ═══════════════════════════════════════════════════════════
   7. Notifications
═══════════════════════════════════════════════════════════ */

describe('GET /api/notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає сповіщення та unreadCount', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (prisma.notification.findMany as MockedFn).mockResolvedValue([
      {
        id: 'notif-001',
        type: 'ORDER_CREATED',
        title: 'Договір №123 створено',
        body: 'Київ → Харків',
        order_id: 'order-001',
        is_read: false,
        created_at: new Date('2026-04-26T10:00:00Z'),
      },
    ]);
    (prisma.notification.count as MockedFn).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].type).toBe('ORDER_CREATED');
    expect(res.body.data.unreadCount).toBe(1);
  });
});

describe('PATCH /api/notifications/read', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('позначає всі сповіщення прочитаними', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (prisma.notification.updateMany as MockedFn).mockResolvedValue({ count: 3 });

    const res = await request(app)
      .patch('/api/notifications/read')
      .set('Authorization', `Bearer ${token}`)
      .send({ all: true });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });
});

describe('PATCH /api/auth/password', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 400 при неправильному поточному паролі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (bcrypt.compare as MockedFn).mockResolvedValue(false);

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/incorrect/i);
  });

  it('повертає 200 при правильному поточному паролі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (bcrypt.compare as MockedFn).mockResolvedValue(true);
    (bcrypt.hash as MockedFn).mockResolvedValue('$2b$10$newhash');
    (prisma.user.update as MockedFn).mockResolvedValue({ ...mockUser, password: '$2b$10$newhash' });

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'correctpass', newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });
});
```

Note: `prisma.user.update` may need to be added to the mock block if it's not there — add `update: vi.fn()` to the `user` mock object.

Add tests for preferences endpoints in the same describe block:

```ts
describe('GET /api/notifications/preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає збережені преференції', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id, email: mockUser.email,
      company_id: mockUser.company_id, roles: ['ADMIN'],
    });
    (prisma.notificationPreference.findMany as MockedFn).mockResolvedValue([
      { event_type: 'ORDER_CREATED', email_enabled: false, in_app_enabled: true },
    ]);

    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].eventType).toBe('ORDER_CREATED');
    expect(res.body.data[0].emailEnabled).toBe(false);
  });
});

describe('PATCH /api/notifications/preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 200 при валідному тілі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id, email: mockUser.email,
      company_id: mockUser.company_id, roles: ['ADMIN'],
    });
    (prisma.notificationPreference.upsert as MockedFn).mockResolvedValue({});

    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'ORDER_CREATED', emailEnabled: false, inAppEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('повертає 400 при невалідному eventType', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id, email: mockUser.email,
      company_id: mockUser.company_id, roles: ['ADMIN'],
    });

    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'INVALID_TYPE', emailEnabled: true, inAppEnabled: true });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 8.3: Run all tests**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/server && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass (27+ tests).

- [ ] **Step 8.4: Commit**

```bash
git add server/src/tests/app.test.ts
git commit -m "test: add notifications and password-change endpoint tests"
```

---

## Task 9: Frontend — Bell icon and notification state in CrmShell

**Files:**
- Modify: `client/src/features/crm/CrmShell.tsx`

- [ ] **Step 9.0: Ensure `apiPatchJson` exists in `client/src/lib/api.ts`**

Check `client/src/lib/api.ts`. If `apiPatchJson` is not exported, add it following the same pattern as `apiPutJson` (or `apiPostJson`) but with `method: 'PATCH'`:

```ts
export async function apiPatchJson<T>(
  url: string, body: unknown, options?: { headers?: Record<string, string> }
): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as { message?: string }).message ?? `HTTP ${res.status}`
    const e = new Error(msg) as Error & { status: number }
    e.status = res.status
    throw e
  }
  return res.json() as Promise<T>
}
```

If it already exists, skip this step.

- [ ] **Step 9.1: Add notification state and socket listener**

In `CrmShell.tsx`, add these imports at the top (alongside existing imports):

```ts
import { useCallback } from 'react'
import { apiGetJson, apiPatchJson } from '../../lib/api'
import type { ApiResponse } from '../../lib/apiResponse'
import { getSocket } from '../../lib/socket'
```

Add state after existing `const [view, setView]` line:

```ts
const [unreadCount,    setUnreadCount]    = useState(0)
const [notifications,  setNotifications]  = useState<NotifItem[]>([])
const [notifOpen,      setNotifOpen]      = useState(false)
const [toasts,         setToasts]         = useState<NotifItem[]>([])
```

Add the `NotifItem` type near the top of the file (after imports):

```ts
type NotifItem = {
  id: string
  type: string
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: string
}
```

Add a `useEffect` to load notifications on mount and subscribe to socket:

```ts
useEffect(() => {
  type NotifResp = { notifications: NotifItem[]; unreadCount: number }
  apiGetJson<ApiResponse<NotifResp>>('/api/notifications', { headers: authHeaders })
    .then((res) => {
      if (res && 'success' in res && res.success) {
        setNotifications(res.data.notifications)
        setUnreadCount(res.data.unreadCount)
      }
    })
    .catch(() => { /* ignore — bell stays at 0 */ })
}, [authHeaders])

useEffect(() => {
  const socket = getSocket()
  if (!socket) return
  const handler = (n: NotifItem) => {
    setNotifications((prev) => [n, ...prev])
    setUnreadCount((c) => c + 1)
    setToasts((prev) => [...prev.slice(-2), n]) // max 3
  }
  socket.on('notification', handler)
  return () => { socket.off('notification', handler) }
}, [])
```

Add `markAllRead` callback:

```ts
const markAllRead = useCallback(() => {
  apiPatchJson('/api/notifications/read', { all: true }, { headers: authHeaders })
    .catch(() => { /* ignore */ })
  setUnreadCount(0)
  setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
}, [authHeaders])
```

- [ ] **Step 9.2: Add bell button to topbar**

In the JSX, inside `<div className="crm__topbarRight">`, add before the exchange rates section:

```tsx
{/* Bell */}
<div className="crm__bellWrap" style={{ position: 'relative' }}>
  <button
    type="button"
    className="crm__bellBtn"
    onClick={() => {
      setNotifOpen((o) => !o)
      if (!notifOpen) markAllRead()
    }}
    aria-label="Сповіщення"
  >
    🔔
    {unreadCount > 0 && (
      <span className="crm__bellBadge">
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )}
  </button>
  {notifOpen && (
    <NotificationDropdown
      notifications={notifications.slice(0, 20)}
      onMarkAllRead={markAllRead}
      onClose={() => setNotifOpen(false)}
      onNavigate={(orderId) => {
        setNotifOpen(false)
        if (orderId) setView('orders')
      }}
    />
  )}
</div>
```

Also render toasts at the bottom of the returned JSX (outside the main layout divs):

```tsx
<NotificationToast
  toasts={toasts}
  onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
  onNavigate={(orderId) => { if (orderId) setView('orders') }}
/>
```

Import the new components at the top:

```ts
import { NotificationDropdown } from './NotificationDropdown'
import { NotificationToast } from './NotificationToast'
```

- [ ] **Step 9.3: Add CSS for bell**

Add to the existing `crm.css` (or inline styles — whichever approach the file uses):

```css
.crm__bellWrap { position: relative; }
.crm__bellBtn {
  background: none; border: none; cursor: pointer;
  font-size: 18px; padding: 4px 8px; position: relative;
  border-radius: 6px; transition: background 0.15s;
}
.crm__bellBtn:hover { background: var(--surface-hover, #f1f5f9); }
.crm__bellBadge {
  position: absolute; top: 0; right: 0;
  background: #ef4444; color: #fff;
  font-size: 10px; font-weight: 700;
  min-width: 16px; height: 16px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px;
}
```

- [ ] **Step 9.4: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/client && npx tsc --noEmit 2>&1
```

Expected: errors only for missing `NotificationDropdown` and `NotificationToast` files (not yet created) — those will be resolved in the next tasks.

- [ ] **Step 9.5: Commit**

```bash
git add client/src/features/crm/CrmShell.tsx
git commit -m "feat: add bell icon, notification state, and socket listener to CrmShell"
```

---

## Task 10: Frontend — NotificationDropdown component

**Files:**
- Create: `client/src/features/crm/NotificationDropdown.tsx`

- [ ] **Step 10.1: Create the component**

Create `client/src/features/crm/NotificationDropdown.tsx`:

```tsx
import { useEffect, useRef } from 'react'

type NotifItem = {
  id: string
  type: string
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: string
}

type Props = {
  notifications: NotifItem[]
  onMarkAllRead: () => void
  onClose: () => void
  onNavigate: (orderId: string | null) => void
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'щойно'
  if (mins < 60) return `${mins} хв тому`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} год тому`
  return `${Math.floor(hrs / 24)} дн тому`
}

export function NotificationDropdown({ notifications, onMarkAllRead, onClose, onNavigate }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: '100%', right: 0, zIndex: 1000,
        width: 360, maxHeight: 480, overflowY: 'auto',
        background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        marginTop: 4,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Сповіщення</span>
        <button
          type="button"
          onClick={onMarkAllRead}
          style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}
        >
          Позначити всі прочитаними
        </button>
      </div>

      {notifications.length === 0 && (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Немає сповіщень
        </div>
      )}

      {notifications.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onNavigate(n.orderId)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '12px 16px', background: n.isRead ? '#fff' : '#eff6ff',
            border: 'none', borderBottom: '1px solid #f1f5f9',
            cursor: n.orderId ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 2 }}>
            {n.title}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{n.body}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{relativeTime(n.createdAt)}</div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 10.2: Verify TypeScript compiles**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/client && npx tsc --noEmit 2>&1
```

Expected: errors only for missing `NotificationToast` — resolves in next task.

- [ ] **Step 10.3: Commit**

```bash
git add client/src/features/crm/NotificationDropdown.tsx
git commit -m "feat: add NotificationDropdown component"
```

---

## Task 11: Frontend — NotificationToast component

**Files:**
- Create: `client/src/features/crm/NotificationToast.tsx`

- [ ] **Step 11.1: Create the component**

Create `client/src/features/crm/NotificationToast.tsx`:

```tsx
import { useEffect } from 'react'

type NotifItem = {
  id: string
  title: string
  body: string
  orderId: string | null
}

type Props = {
  toasts: NotifItem[]
  onDismiss: (id: string) => void
  onNavigate: (orderId: string | null) => void
}

export function NotificationToast({ toasts, onDismiss, onNavigate }: Props) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
  onNavigate,
}: {
  toast: NotifItem
  onDismiss: (id: string) => void
  onNavigate: (orderId: string | null) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      style={{
        background: '#1e293b', color: '#f8fafc',
        borderRadius: 8, padding: '12px 16px',
        minWidth: 280, maxWidth: 360,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        cursor: toast.orderId ? 'pointer' : 'default',
        animation: 'slideInRight 0.2s ease',
      }}
      onClick={() => { onNavigate(toast.orderId); onDismiss(toast.id) }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{toast.title}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{toast.body}</div>
    </div>
  )
}
```

Add the animation to `index.css` or the relevant global CSS file:

```css
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
```

- [ ] **Step 11.2: Verify TypeScript compiles cleanly**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/client && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 11.3: Commit**

```bash
git add client/src/features/crm/NotificationToast.tsx
git commit -m "feat: add NotificationToast component with auto-dismiss"
```

---

## Task 12: Frontend — ProfilePage with password change + notification preferences

**Files:**
- Create: `client/src/features/profile/ProfilePage.tsx`
- Modify: `client/src/features/crm/CrmShell.tsx`

- [ ] **Step 12.1: Create ProfilePage component**

Create `client/src/features/profile/ProfilePage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { apiGetJson, apiPatchJson } from '../../lib/api'
import type { ApiResponse } from '../../lib/apiResponse'
import type { AuthTokens } from '../auth/auth.storage'

type AuthHeaders = { Authorization: string }

const ALL_EVENT_TYPES = [
  { type: 'ORDER_CREATED',           label: 'Новий договір створено',         hasEmail: true  },
  { type: 'DRIVER_ASSIGNED',         label: 'Водій призначений на договір',    hasEmail: true  },
  { type: 'DRIVER_ACCEPTED',         label: 'Водій прийняв договір',           hasEmail: false },
  { type: 'PREPAYMENT_RECEIVED',     label: 'Аванс отримано',                  hasEmail: false },
  { type: 'ORDER_COMPLETED',         label: 'Договір завершено',               hasEmail: false },
] as const

type EventType = typeof ALL_EVENT_TYPES[number]['type']

type PrefMap = Record<EventType, { emailEnabled: boolean; inAppEnabled: boolean }>

function defaultPrefs(): PrefMap {
  return Object.fromEntries(
    ALL_EVENT_TYPES.map((e) => [e.type, { emailEnabled: true, inAppEnabled: true }])
  ) as PrefMap
}

type Props = {
  tokens: AuthTokens
}

export function ProfilePage({ tokens }: Props) {
  const authHeaders: AuthHeaders = { Authorization: `Bearer ${tokens.accessToken}` }

  /* ── password change ──────────────────────────────────── */
  const [currentPw,    setCurrentPw]    = useState('')
  const [newPw,        setNewPw]        = useState('')
  const [confirmPw,    setConfirmPw]    = useState('')
  const [pwError,      setPwError]      = useState<string | null>(null)
  const [pwSuccess,    setPwSuccess]    = useState(false)
  const [pwSaving,     setPwSaving]     = useState(false)

  async function changePassword() {
    setPwError(null)
    setPwSuccess(false)
    if (newPw.length < 8) { setPwError('Новий пароль — мінімум 8 символів'); return }
    if (newPw !== confirmPw) { setPwError('Паролі не збігаються'); return }
    setPwSaving(true)
    try {
      type Resp = { success: boolean }
      const res = await apiPatchJson<ApiResponse<Resp>>('/api/auth/password',
        { currentPassword: currentPw, newPassword: newPw },
        { headers: authHeaders },
      )
      if (res && 'success' in res && res.success) {
        setPwSuccess(true)
        setCurrentPw(''); setNewPw(''); setConfirmPw('')
      } else {
        setPwError((res as { message?: string }).message ?? 'Помилка')
      }
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setPwSaving(false)
    }
  }

  /* ── notification preferences ─────────────────────────── */
  const [prefs, setPrefs] = useState<PrefMap>(defaultPrefs())
  const [prefLoaded, setPrefLoaded] = useState(false)

  useEffect(() => {
    type PrefRow = { eventType: EventType; emailEnabled: boolean; inAppEnabled: boolean }
    apiGetJson<ApiResponse<PrefRow[]>>('/api/notifications/preferences', { headers: authHeaders })
      .then((res) => {
        if (res && 'success' in res && res.success) {
          const merged = defaultPrefs()
          for (const row of res.data) {
            if (row.eventType in merged) {
              merged[row.eventType] = { emailEnabled: row.emailEnabled, inAppEnabled: row.inAppEnabled }
            }
          }
          setPrefs(merged)
        }
        setPrefLoaded(true)
      })
      .catch(() => setPrefLoaded(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePref(type: EventType, channel: 'emailEnabled' | 'inAppEnabled', value: boolean) {
    const prev = prefs[type]
    setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: value } }))
    apiPatchJson('/api/notifications/preferences', {
      eventType: type,
      emailEnabled: channel === 'emailEnabled' ? value : prev.emailEnabled,
      inAppEnabled: channel === 'inAppEnabled' ? value : prev.inAppEnabled,
    }, { headers: authHeaders }).catch(() => {
      // revert on error
      setPrefs((p) => ({ ...p, [type]: prev }))
    })
  }

  /* ── render ────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 32 }}>Профіль</h2>

      {/* Password change */}
      <section style={{ marginBottom: 40 }}>
        <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Змінити пароль</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <input
            type="password" placeholder="Поточний пароль"
            value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
            className="co__input"
            onBlur={() => { if (!currentPw) setPwError('Введіть поточний пароль') }}
          />
          <input
            type="password" placeholder="Новий пароль (мін. 8 символів)"
            value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwError(null) }}
            className="co__input"
          />
          <input
            type="password" placeholder="Підтвердіть новий пароль"
            value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setPwError(null) }}
            className="co__input"
          />
          {pwError && <span style={{ color: '#ef4444', fontSize: 13 }}>{pwError}</span>}
          {pwSuccess && <span style={{ color: '#16a34a', fontSize: 13 }}>Пароль змінено</span>}
          <button
            type="button"
            className="co__input"
            style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            onClick={() => void changePassword()}
          >
            {pwSaving ? 'Збереження…' : 'Змінити пароль'}
          </button>
        </div>
      </section>

      {/* Notification preferences */}
      <section>
        <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Налаштування сповіщень</h3>
        {!prefLoaded ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Завантаження…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', color: '#64748b', fontWeight: 500 }}>Подія</th>
                <th style={{ padding: '8px 16px', color: '#64748b', fontWeight: 500 }}>In-app</th>
                <th style={{ padding: '8px 16px', color: '#64748b', fontWeight: 500 }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {ALL_EVENT_TYPES.map((evt) => (
                <tr key={evt.type} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0', color: '#1e293b' }}>{evt.label}</td>
                  <td style={{ textAlign: 'center', padding: '10px 16px' }}>
                    <input
                      type="checkbox"
                      checked={prefs[evt.type].inAppEnabled}
                      onChange={(e) => togglePref(evt.type, 'inAppEnabled', e.target.checked)}
                    />
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 16px' }}>
                    {evt.hasEmail ? (
                      <input
                        type="checkbox"
                        checked={prefs[evt.type].emailEnabled}
                        onChange={(e) => togglePref(evt.type, 'emailEnabled', e.target.checked)}
                      />
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 12.2: Add `profile` view to CrmShell**

In `CrmShell.tsx`:

1. Add `'profile'` to the `CrmView` union type (find `type CrmView = ...` and append `| 'profile'`).

2. Add import at top of CrmShell.tsx:
```ts
import { UserCircle02Icon } from 'hugeicons-react'
```

In `buildNav`, add a profile nav item to the `main` array (visible to all roles — add it last, before the return):
```ts
main.push({ key: 'profile' as CrmView, label: 'Профіль', icon: UserCircle02Icon })
```

3. In the render where views are conditionally shown, add:
```tsx
{view === 'profile' && <ProfilePage tokens={tokens} />}
```

4. Import `ProfilePage`:
```ts
import { ProfilePage } from '../profile/ProfilePage'
```

- [ ] **Step 12.3: Verify TypeScript compiles cleanly**

```bash
cd /Users/bohdan/Documents/University/Диплом/colos/client && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 12.4: Commit**

```bash
git add client/src/features/profile/ProfilePage.tsx client/src/features/crm/CrmShell.tsx
git commit -m "feat: add ProfilePage with password change and notification preferences"
```
