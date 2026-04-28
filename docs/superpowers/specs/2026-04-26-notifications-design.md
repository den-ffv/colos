# Notification System & Profile Page Design

**Date:** 2026-04-26  
**Scope:** In-app bell notifications for CRM users + email to client on status change + per-event-type notification preferences + profile page (password change + notification settings)

---

## What We Are NOT Building

- Client portal notification dashboard (Week 9 not yet implemented)
- Email toggles for CLIENT-type events (no client accounts in CRM yet)

---

## 1. Database

### New Prisma models

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

**Key design decision:** `notification_preferences` is sparse — a row only exists when a preference has been explicitly set. Absence of a row means both channels are enabled (default). This avoids seeding rows on user creation.

---

## 2. Backend

### 2a. Socket.io — per-user room

In `server/src/services/socket.ts`, on connection add:

```ts
socket.join(`user:${socket.data.userId}`)
```

alongside the existing `socket.join(`company:${companyId}`)`.

Add helper:

```ts
export function emitNotification(userId: string, payload: NotificationPayload): void {
  io?.to(`user:${userId}`).emit('notification', payload)
}
```

### 2b. NotificationService

New file: `server/src/services/notification.service.ts`

```ts
interface CreateParams {
  userId: string
  type: NotificationType
  title: string
  body: string
  orderId?: string
}

async function isEnabled(userId: string, type: NotificationType, channel: 'email' | 'inApp'): Promise<boolean>
// Returns true if no preference row exists, or if the channel is explicitly enabled.

async function create(params: CreateParams): Promise<void>
// INSERT notification → if inApp enabled → emitNotification(userId, payload)

async function getRecent(userId: string): Promise<{ notifications: Notification[], unreadCount: number }>
// SELECT ORDER BY created_at DESC LIMIT 50; count WHERE is_read = false

async function markRead(userId: string, options: { ids?: string[], all?: boolean }): Promise<void>
// UPDATE WHERE user_id = userId AND (id IN ids OR all = true)

async function getPreferences(userId: string): Promise<NotificationPreference[]>
// SELECT all rows for userId

async function upsertPreference(userId: string, eventType: NotificationType, emailEnabled: boolean, inAppEnabled: boolean): Promise<void>
// UPSERT into notification_preferences
```

### 2c. New email function

Add to `server/src/services/email.service.ts`:

```ts
export interface SendStatusUpdateParams {
  to: string
  clientName: string
  contractNumber: string
  status: 'IN_TRANSIT' | 'DELIVERED'
  pickupAddress: string
  deliveryAddress: string
}

async function sendOrderStatusUpdate(params: SendStatusUpdateParams): Promise<void>
// Dev mode: console.log. Prod: HTML email with status badge, route info.
```

### 2d. New endpoints

All under `requireAuth` middleware.

**`GET /api/notifications`**  
Returns `{ notifications: Notification[], unreadCount: number }` — last 50 for current user.

**`PATCH /api/notifications/read`**  
Body: `{ ids?: string[], all?: boolean }`. Marks specified (or all) as read for current user.

**`GET /api/notifications/preferences`**  
Returns array of `{ eventType, emailEnabled, inAppEnabled }` for current user (only explicitly set rows; client interprets missing = both true).

**`PATCH /api/notifications/preferences`**  
Body: `{ eventType: NotificationType, emailEnabled: boolean, inAppEnabled: boolean }`. Upserts one preference row.

**`PATCH /api/auth/password`**  
Body: `{ currentPassword: string, newPassword: string }`.  
Verify `currentPassword` with bcrypt against stored hash. If wrong → 400. Hash `newPassword` → UPDATE users. Returns 200.

### 2e. Lifecycle integration

In `server/src/router/orders.router.ts`, after each status-changing operation, call `NotificationService.create(...)` for relevant user IDs. Email is sent if `isEnabled(userId, type, 'email')` returns true AND the recipient has an email address.

| Trigger | Type | Recipients | Email? |
|---------|------|-----------|--------|
| Order created | `ORDER_CREATED` | assigned logist | no |
| Driver assigned (`CONFIRMED`) | `DRIVER_ASSIGNED` | driver | yes (existing `sendDriverAssigned`) |
| Driver accepted | `DRIVER_ACCEPTED` | logist | no |
| Status → `IN_TRANSIT` | `STATUS_IN_TRANSIT` | client contact email | email only (no CRM user) |
| Status → `DELIVERED` | `STATUS_DELIVERED` | client contact email | email only |
| `request-prepayment` | `PREPAYMENT_REQUESTED` | client contact email | email only (existing `sendInvoice`) |
| `mark-prepaid` | `PREPAYMENT_RECEIVED` | logist + driver | no |
| `mark-final-paid` | `ORDER_COMPLETED` | logist + admin users | no |

**Note:** CLIENT-type events (IN_TRANSIT, DELIVERED, PREPAYMENT_REQUESTED) send to client's email address, not to a CRM user — so no `notification_preferences` lookup is needed for these; they always send.

---

## 3. Frontend — Bell & Notifications

### 3a. State & socket in CrmShell

`CrmShell.tsx` gains:
- `unreadCount: number` state (init from `GET /api/notifications`)
- `notifications: Notification[]` state
- `notifOpen: boolean` state (dropdown toggle)
- Socket listener: `socket.on('notification', (n) => { setUnreadCount(c => c+1); setNotifications(prev => [n, ...prev]); showToast(n) })`

### 3b. NotificationDropdown component

New file: `client/src/features/crm/NotificationDropdown.tsx`

Props: `{ notifications, onMarkAllRead, onClose }`

- Renders last 20 items
- Unread items: `background: var(--surface-accent)`
- Each item: bold title, body text, relative time (`2 хв тому` via `Intl.RelativeTimeFormat`), clickable link to order if `orderId` present
- "Позначити всі прочитаними" button → `PATCH /api/notifications/read { all: true }` → `onMarkAllRead()`
- `markRead` called automatically on open (with `all: true`)

### 3c. NotificationToast component

New file: `client/src/features/crm/NotificationToast.tsx`

- Fixed position: bottom-right, `z-index: 9999`
- Max 3 simultaneous toasts (FIFO)
- Each toast: title + body, auto-dismiss after 4 sec, click navigates to order
- Slide-in animation via CSS

### 3d. Bell in topbar

In `CrmShell.tsx` topbar right section, add before exchange rates:

```tsx
<div className="crm__bellWrap">
  <button onClick={() => setNotifOpen(o => !o)}>
    <BellIcon />
    {unreadCount > 0 && <span className="crm__bellBadge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
  </button>
  {notifOpen && <NotificationDropdown ... />}
</div>
```

---

## 4. Frontend — Profile Page

New file: `client/src/features/profile/ProfilePage.tsx`

New `CrmView = 'profile'` added to the union type. New nav item "Профіль" (bottom of sidebar, all roles).

### 4a. Change Password section

Fields: current password, new password (≥ 8 chars), confirm new password. Validation on blur. `PATCH /api/auth/password`. Success: green inline message + clear fields. Error: inline red message (wrong current password, etc.).

### 4b. Notification Preferences section

On mount: `GET /api/notifications/preferences` → build map `eventType → { emailEnabled, inAppEnabled }`. Missing entry → both `true`.

Renders a table of CRM-relevant event types (excludes CLIENT-only email events like `STATUS_IN_TRANSIT`, `STATUS_DELIVERED` since those go to client email, not CRM users):

| Подія | In-app | Email |
|-------|--------|-------|
| Новий договір | toggle | toggle |
| Водій призначений | toggle | toggle |
| Водій прийняв договір | toggle | toggle |
| Аванс отримано | toggle | toggle |
| Договір завершено | toggle | toggle |

Each toggle: optimistic update → `PATCH /api/notifications/preferences`. On error: revert.

---

## 5. Behaviour Summary

| Scenario | Result |
|----------|--------|
| Order created | In-app notification to assigned logist (if enabled) |
| Driver assigned | In-app + email to driver (existing sendDriverAssigned) |
| Driver accepted | In-app to logist |
| Status → IN_TRANSIT | Email to client (always, no preference check) |
| Status → DELIVERED | Email to client (always) |
| request-prepayment | Email to client (existing sendInvoice) |
| mark-prepaid | In-app to logist + driver |
| mark-final-paid | In-app to all ADMIN + logist of order |
| New socket notification | Toast shown, badge +1 |
| Dropdown opened | All marked read, badge reset |
| User toggles preference | PATCH, optimistic UI, revert on error |
| User changes password | bcrypt verify → update → clear form |

---

## 6. Files Changed / Created

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add `notifications`, `notification_preferences`, `NotificationType` enum |
| `server/src/services/socket.ts` | Add per-user room join + `emitNotification` helper |
| `server/src/services/notification.service.ts` | **New** — create, markRead, getRecent, getPreferences, upsertPreference, isEnabled |
| `server/src/services/email.service.ts` | Add `sendOrderStatusUpdate` |
| `server/src/router/notifications.router.ts` | **New** — 4 endpoints |
| `server/src/router/auth.router.ts` | Add `PATCH /api/auth/password` |
| `server/src/router/orders.router.ts` | Integrate NotificationService into lifecycle endpoints |
| `server/src/app.ts` | Mount notifications router |
| `client/src/features/crm/CrmShell.tsx` | Bell icon, notification state, socket listener, toast |
| `client/src/features/crm/NotificationDropdown.tsx` | **New** |
| `client/src/features/crm/NotificationToast.tsx` | **New** |
| `client/src/features/profile/ProfilePage.tsx` | **New** |
