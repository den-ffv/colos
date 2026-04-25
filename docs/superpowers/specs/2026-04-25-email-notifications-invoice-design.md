# Email Notifications & Invoice Table — Design Spec

**Date:** 2026-04-25  
**Scope:** Week 8 follow-up — wire missing email notifications, add Invoice model

---

## Problem

Three email notifications are defined in `email.service.ts` but never sent:

1. **Driver assignment** — `sendDriverAssigned` exists, never called
2. **Client prepayment invoice** — `sendInvoice` exists, never called; also no invoice PDF generator
3. **Client completion notification** — no function defined, no call site

Additionally, payment data lives as flat fields on `Order`; there is no entity to track invoice lifecycle (sent, paid, overdue).

---

## Out of Scope

- Client self-service payment portal
- Automated overdue reminders
- Carrier payment notifications
- Removing existing flat payment fields from `Order`

---

## Architecture

### 1. Invoice Model (new)

Added to `schema.prisma` alongside existing `Order` payment fields (which are kept as-is for fast reads).

```prisma
enum InvoiceType {
  PREPAYMENT
  FINAL
}

enum InvoiceStatus {
  PENDING
  PAID
}

model Invoice {
  id         String        @id @default(uuid())
  order_id   String
  order      Order         @relation(fields: [order_id], references: [id], onDelete: Cascade)
  company_id String
  company    Company       @relation(fields: [company_id], references: [id], onDelete: Cascade)
  type       InvoiceType
  status     InvoiceStatus @default(PENDING)
  amount     Float
  sent_at    DateTime?     // when email was dispatched
  paid_at    DateTime?     // set by mark-prepaid / mark-final-paid
  created_at DateTime      @default(now())
  updated_at DateTime      @updatedAt

  @@index([order_id])
  @@map("invoices")
}
```

`Order` model gains a `invoices Invoice[]` relation. Flat payment fields (`prepaid_amount`, `prepaid_at`, etc.) remain unchanged.

`Company` model gains `Invoices Invoice[]` relation.

### 2. Driver dropdown filter

`GET /orders/lookups` — drivers query adds `user_id: { not: null }` filter.  
Only drivers with a linked user account (and thus an email address) appear in the assignment dropdown.

This is consistent with the email constraint: we can only notify drivers who have a system account.

### 3. Driver assignment email

**Trigger:** `PATCH /:id/status` when `newStatus === 'CONFIRMED'`

**Data needed:** fetch order including `driver: { include: { user: { select: { email: true } } } }` and `vehicle`.

**Condition:** send only if `order.driver?.user?.email` exists (silently skip otherwise — driver has no account).

**Function:** existing `sendDriverAssigned(params: SendDriverAssignedParams)` — no changes needed.

**Fields passed:**
- `to` — `driver.user.email`
- `driverName` — `${driver.first_name} ${driver.last_name}`
- `contractNumber` — `order.order_number`
- `pickupAddress` — `order.pickup_address`
- `deliveryAddress` — `order.delivery_address`
- `pickupDate` — formatted `order.pickup_date`

Email is fire-and-forget (awaited but errors caught and logged, not re-thrown — status transition must not fail because of email).

### 4. Client prepayment invoice email

**Trigger:** `POST /:id/request-prepayment`

**New function:** `generateInvoicePdf(params)` in `pdf.service.ts`  
Simple one-page PDF containing:
- COLOS CRM header
- Invoice number (derived: `INV-<orderNumber>-PRE`)
- Client name
- Contract number
- Amount (= `order.client_price`)
- Due date (= today + 7 days, hardcoded)
- "Будь ласка, здійсніть оплату авансу для початку виконання договору."

**Function:** existing `sendInvoice(params: SendInvoiceParams)` — no changes needed.

**Side effect:** create `Invoice { type: PREPAYMENT, status: PENDING, amount: order.client_price, sent_at: now() }`.

**Data needed:** fetch order including `client: { select: { email, company_name } }`.

**Condition:** send only if `client.email` exists (silently skip + log otherwise).

### 5. Client completion email

**Trigger:** `POST /:id/mark-final-paid`

**New function:** `sendCompletionNotification(params: SendCompletionParams)` in `email.service.ts`

```ts
interface SendCompletionParams {
  to: string;
  clientName: string;
  contractNumber: string;
  prepaidAmount: number;
  finalAmount: number;
  totalPaid: number;
}
```

Email content: contract completed, payment summary (prepayment + final + total), thank you message.

**Side effects:**
- `updateMany` where `{ order_id, type: PREPAYMENT }` → `status: PAID, paid_at: order.prepaid_at` (no-op if record doesn't exist — e.g., client had no email)
- Create `Invoice { type: FINAL, status: PAID, amount: finalAmount, sent_at: now(), paid_at: now() }`

**Condition:** send only if `client.email` exists.

---

## Data Flow Summary

| Event | Endpoint | Email | Invoice record |
|-------|----------|-------|----------------|
| NEW → CONFIRMED | `PATCH /:id/status` | Driver: `sendDriverAssigned` | — |
| DRIVER_ACCEPTED → AWAITING_PREPAYMENT | `POST /:id/request-prepayment` | Client: `sendInvoice` + PDF | Create PREPAYMENT/PENDING |
| AWAITING_FINAL_PAYMENT → COMPLETED | `POST /:id/mark-final-paid` | Client: `sendCompletionNotification` | Update PREPAYMENT→PAID, create FINAL/PAID |

---

## Error Handling

All email sends are wrapped in `try/catch`. A failed email logs a warning but does **not** roll back the status transition. This prevents email delivery issues from blocking order workflow.

---

## Files Changed

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add `InvoiceType`, `InvoiceStatus` enums, `Invoice` model; add relations to `Order` and `Company` |
| `server/prisma/migrations/` | New migration generated by `prisma migrate dev` |
| `server/src/services/pdf.service.ts` | Add `generateInvoicePdf()` |
| `server/src/services/email.service.ts` | Add `sendCompletionNotification()` |
| `server/src/router/orders.router.ts` | Wire emails in 3 endpoints; filter driver dropdown; import new functions |

---

## Testing

- Verify `GET /orders/lookups` returns only drivers with `user_id` set
- Verify `PATCH /:id/status` (NEW→CONFIRMED) calls `sendDriverAssigned` when driver has user email; skips silently when not
- Verify `POST /:id/request-prepayment` sends invoice email + creates Invoice record
- Verify `POST /:id/mark-final-paid` sends completion email + creates two Invoice records (PREPAYMENT PAID + FINAL PAID)
- Verify all three status transitions still succeed when client/driver has no email
