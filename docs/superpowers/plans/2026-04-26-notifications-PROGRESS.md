# Notification System — Progress Tracker

**Plan file:** `docs/superpowers/plans/2026-04-26-notifications.md`  
**Spec file:** `docs/superpowers/specs/2026-04-26-notifications-design.md`  
**Last updated:** 2026-04-26  
**Branch:** `main-dev`

---

## Completed Tasks ✅

| # | Task | Commit |
|---|------|--------|
| 1 | Prisma — `notifications` + `notification_preferences` models + migration | `e029797` |
| 2 | Socket.ts — per-user room join + `emitNotification` helper | `c8b06ca` |
| 3 | NotificationService — 6 functions (create, isEnabled, getRecent, markRead, getPreferences, upsertPreference) | `f9c291a`, `0911149` |
| 4 | Email service — `sendOrderStatusUpdate` | `37f5f78` |
| 5 | Notifications router — GET /, PATCH /read, GET /preferences, PATCH /preferences | `536a55e` |
| 6 | Auth router — `PATCH /api/auth/password` | `e5b79fd` |

---

## Remaining Tasks ⏳

### Task 7: Orders router — lifecycle integration
**File:** `server/src/router/orders.router.ts`

Add at top of file:
```ts
import * as NotificationService from '../services/notification.service';
import { sendOrderStatusUpdate } from '../services/email.service';
```

Then add these 5 hooks:

**7.2 — Order created → notify logist** (after `emitOrderUpdated(...)` in POST /):
```ts
NotificationService.create({
  userId: auth.sub,
  type: 'ORDER_CREATED',
  title: `Договір ${created.order_number} створено`,
  body: `${created.pickup_address} → ${created.delivery_address}`,
  orderId: created.id,
}).catch((err: unknown) => console.error('[NOTIFY] ORDER_CREATED failed:', err));
```

**7.3 — CONFIRMED → notify driver in-app** (inside the existing `if (newStatus === 'CONFIRMED' && updated.driver_id)` block, in the `.then((driver) => {...})` closure):
- Change driver select to include `user_id: true`
- Add after the `sendDriverAssigned` call:
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

**7.4 — IN_TRANSIT + DELIVERED → email client** (after `emitOrderStatusChanged(...)` in PATCH /:id/status):
```ts
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
    }).catch((err: unknown) => console.error('[EMAIL] IN_TRANSIT failed:', err));
  }).catch((err: unknown) => console.error('[EMAIL] client lookup IN_TRANSIT failed:', err));
}
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
    }).catch((err: unknown) => console.error('[EMAIL] DELIVERED failed:', err));
  }).catch((err: unknown) => console.error('[EMAIL] client lookup DELIVERED failed:', err));
}
```

**7.5 — DRIVER_ACCEPTED → notify logist** (after `emitOrderStatusChanged(...)` in POST /:id/accept):
```ts
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
}).catch((err: unknown) => console.error('[NOTIFY] manager lookup DRIVER_ACCEPTED failed:', err));
```

**7.6 — mark-prepaid → notify logist + driver** (after `emitOrderStatusChanged(...)` in POST /:id/mark-prepaid):
```ts
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

**7.7 — mark-final-paid → notify logist + ADMINs** (after `emitOrderStatusChanged(...)` in POST /:id/mark-final-paid):
```ts
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

Commit: `git commit -m "feat: integrate NotificationService into order lifecycle endpoints"`

---

### Task 8: Backend tests
**File:** `server/src/tests/app.test.ts`

Add to `vi.mock('../utils/prisma', ...)` block:
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
Also add `update: vi.fn()` to the `user` mock block if not already there.

Add 5 new describe blocks testing:
1. `GET /api/notifications` — returns notifications + unreadCount
2. `PATCH /api/notifications/read { all: true }` — returns 200
3. `GET /api/notifications/preferences` — returns preferences
4. `PATCH /api/notifications/preferences` — valid body → 200, invalid eventType → 400
5. `PATCH /api/auth/password` — wrong password → 400, correct → 200

Full test code is in `docs/superpowers/plans/2026-04-26-notifications.md` Task 8.

Commit: `git commit -m "test: add notifications and password-change endpoint tests"`

---

### Task 9: Frontend — Bell + CrmShell
**File:** `client/src/features/crm/CrmShell.tsx`

- Check/add `apiPatchJson` to `client/src/lib/api.ts` if missing
- Add `NotifItem` type
- Add states: `unreadCount`, `notifications`, `notifOpen`, `toasts`
- Add `useEffect` to load notifications on mount
- Add `useEffect` for socket `notification` event listener
- Add `markAllRead` callback
- Add bell button to topbar JSX with `NotificationDropdown`
- Add `NotificationToast` at bottom of JSX

Imports needed:
```ts
import { NotificationDropdown } from './NotificationDropdown'
import { NotificationToast } from './NotificationToast'
```

Full code in plan Task 9.

---

### Task 10: Frontend — NotificationDropdown
**Create:** `client/src/features/crm/NotificationDropdown.tsx`

Dropdown panel with:
- Click-outside to close
- List of notification items (title, body, relative time)
- "Позначити всі прочитаними" button
- Unread items highlighted with `#eff6ff` background

Full component code in plan Task 10.

---

### Task 11: Frontend — NotificationToast
**Create:** `client/src/features/crm/NotificationToast.tsx`

- Fixed bottom-right position
- Auto-dismiss after 4 sec per toast
- Max 3 simultaneous
- Slide-in animation

Full component code in plan Task 11.

---

### Task 12: Frontend — ProfilePage
**Create:** `client/src/features/profile/ProfilePage.tsx`

Two sections:
1. Change password form (currentPw, newPw ≥8, confirmPw) → `PATCH /api/auth/password`
2. Notification preferences table (5 event types × in-app + email toggles) → `GET/PATCH /api/notifications/preferences`

Also modify `CrmShell.tsx`:
- Add `'profile'` to `CrmView` union
- Import `UserCircle02Icon` from `hugeicons-react`
- Add "Профіль" nav item in `buildNav` (all roles)
- Render `<ProfilePage tokens={tokens} />` when `view === 'profile'`

Full component code in plan Task 12.

---

## Key Technical Notes

- **Prisma accessors:** new models use PLURAL: `prisma.notifications`, `prisma.notification_preferences`. Existing models use singular: `prisma.order`, `prisma.user`, etc.
- **NotificationType composite key:** `user_id_event_type` (auto-generated by Prisma from `@@id([user_id, event_type])`)
- **Pre-existing TS errors:** ~220 errors in the project unrelated to notifications — don't be alarmed, tests still pass
- **Socket user room:** `user:{userId}` — set up in Task 2
- **apiPatchJson:** may need to be added to `client/src/lib/api.ts` — see Task 9.0 in the plan
