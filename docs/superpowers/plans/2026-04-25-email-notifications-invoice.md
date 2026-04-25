# Email Notifications & Invoice Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire three missing email notifications (driver assigned, client prepayment invoice, client completion) and add an Invoice table to track payment lifecycle.

**Architecture:** Emails are sent fire-and-forget inside existing endpoint handlers; failures are caught and logged so status transitions never fail due to email issues. A new `Invoice` Prisma model complements (not replaces) existing flat payment fields on `Order`.

**Tech Stack:** TypeScript, Express, Prisma 5, pdf-lib, Nodemailer, Vitest

---

## File Map

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add `InvoiceType`, `InvoiceStatus` enums + `Invoice` model + relations on `Order` and `Company` |
| `server/src/services/pdf.service.ts` | Add `generateInvoicePdf()` |
| `server/src/services/email.service.ts` | Add `sendCompletionNotification()` |
| `server/src/tests/email.service.test.ts` | Add tests for `sendCompletionNotification` |
| `server/src/router/orders.router.ts` | Filter driver lookup; wire emails in 3 endpoints; create/update Invoice records |

---

## Task 1: Add Invoice model to Prisma schema and migrate

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add enums and Invoice model to schema.prisma**

Add directly after the `FuelPrice` model at the bottom of `server/prisma/schema.prisma`:

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
  sent_at    DateTime?
  paid_at    DateTime?
  created_at DateTime      @default(now())
  updated_at DateTime      @updatedAt

  @@index([order_id])
  @@map("invoices")
}
```

- [ ] **Step 2: Add `invoices` relation to `Order` model**

In `schema.prisma`, inside the `Order` model, after the `updated_at` field and before `@@map("orders")`, add:

```prisma
  invoices Invoice[]
```

- [ ] **Step 3: Add `Invoices` relation to `Company` model**

In `schema.prisma`, inside the `Company` model, after `Orders Order[]` and before `@@map("companies")`, add:

```prisma
  Invoices Invoice[]
```

- [ ] **Step 4: Run migration**

```bash
cd server && npx prisma migrate dev --name add_invoice_table
```

Expected: migration file created, database updated, no errors.

- [ ] **Step 5: Verify Prisma client regenerated**

```bash
cd server && npx prisma generate
```

Expected: `✔ Generated Prisma Client` with no errors. `prisma.invoice` is now available.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add Invoice model to Prisma schema"
```

---

## Task 2: Add generateInvoicePdf to pdf.service.ts

**Files:**
- Modify: `server/src/services/pdf.service.ts`

- [ ] **Step 1: Add the function at the end of pdf.service.ts**

Append after `generateOrderPdf`:

```typescript
export interface InvoicePdfParams {
  invoiceNumber: string;
  contractNumber: string;
  clientName: string;
  amount: number;
  dueDays: number;
}

export async function generateInvoicePdf(params: InvoicePdfParams): Promise<Buffer> {
  const { invoiceNumber, contractNumber, clientName, amount, dueDays } = params;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBold = await pdfDoc.embedFont(arialBoldBytes);
  const fontReg = await pdfDoc.embedFont(arialBytes);

  const page = pdfDoc.addPage([595, 842]); // A4
  const { height } = page.getSize();

  const cBlue: RGB = rgb(0.086, 0.322, 0.812);
  const cGray: RGB = rgb(0.45, 0.45, 0.45);
  const cBlack: RGB = rgb(0.08, 0.08, 0.08);
  const cLine: RGB = rgb(0.88, 0.90, 0.93);
  const ML = 44;
  const MR = 44;
  const contentWidth = 595 - ML - MR;

  let y = height - 50;

  // Header
  page.drawText('COLOS', { x: ML, y, size: 22, font: fontBold, color: cBlue });
  page.drawText(' CRM', { x: ML + 72, y, size: 22, font: fontReg, color: cGray });
  y -= 16;
  page.drawLine({ start: { x: ML, y }, end: { x: 595 - MR, y }, thickness: 2, color: cBlue });
  y -= 28;

  // Title
  page.drawText('РАХУНОК НА ОПЛАТУ', { x: ML, y, size: 16, font: fontBold, color: cBlack });
  y -= 28;

  // Meta row
  const issueDate = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const dueDate = new Date(Date.now() + dueDays * 86400000).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function metaRow(label: string, value: string, yPos: number) {
    page.drawText(label, { x: ML, y: yPos, size: 10, font: fontReg, color: cGray });
    page.drawText(value, { x: ML + 160, y: yPos, size: 10, font: fontBold, color: cBlack });
  }

  metaRow('Номер рахунку:', invoiceNumber, y); y -= 18;
  metaRow('Договір:', contractNumber, y); y -= 18;
  metaRow('Клієнт:', clientName, y); y -= 18;
  metaRow('Дата виставлення:', issueDate, y); y -= 18;
  metaRow('Термін оплати:', `до ${dueDate} (${dueDays} дн.)`, y); y -= 28;

  // Divider
  page.drawLine({ start: { x: ML, y }, end: { x: 595 - MR, y }, thickness: 0.5, color: cLine });
  y -= 24;

  // Amount block
  const amountFormatted = amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  page.drawText('До сплати:', { x: ML, y, size: 12, font: fontReg, color: cGray });
  page.drawText(`${amountFormatted} грн`, { x: ML + contentWidth - fontBold.widthOfTextAtSize(`${amountFormatted} грн`, 18), y: y - 2, size: 18, font: fontBold, color: cBlue });
  y -= 40;

  // Note
  page.drawText('Будь ласка, здійсніть оплату авансу для початку виконання договору.', {
    x: ML, y, size: 9, font: fontReg, color: cGray,
  });
  y -= 14;
  page.drawText('Після оплати повідомте вашого менеджера.', {
    x: ML, y, size: 9, font: fontReg, color: cGray,
  });

  // Footer
  page.drawText(`Сформовано: ${issueDate}`, {
    x: ML, y: 20, size: 8, font: fontReg, color: cGray,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/pdf.service.ts
git commit -m "feat: add generateInvoicePdf to pdf.service"
```

---

## Task 3: Add sendCompletionNotification to email.service.ts with tests

**Files:**
- Modify: `server/src/services/email.service.ts`
- Modify: `server/src/tests/email.service.test.ts`

- [ ] **Step 1: Write failing tests for sendCompletionNotification**

Add to the end of `server/src/tests/email.service.test.ts`, inside **both** describe blocks:

In the **dev mode** describe block, add before the closing `}`):

```typescript
  it('sendCompletionNotification не кидає помилку і не викликає sendMail', async () => {
    await expect(
      sendCompletionNotification({
        to: 'client@test.com',
        clientName: 'ТОВ Тест',
        contractNumber: 'CONTR-2026-0001',
        prepaidAmount: 30000,
        finalAmount: 20000,
        totalPaid: 50000,
      }),
    ).resolves.toBeUndefined();

    expect(mockSendMail).not.toHaveBeenCalled();
  });
```

In the **production mode** describe block, add before the closing `}`):

```typescript
  it('sendCompletionNotification викликає sendMail з підсумком платежів', async () => {
    await sendCompletionNotification({
      to: 'client@test.com',
      clientName: 'ТОВ Тест',
      contractNumber: 'CONTR-2026-0001',
      prepaidAmount: 30000,
      finalAmount: 20000,
      totalPaid: 50000,
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(call.to).toBe('client@test.com');
    expect(call.subject).toContain('CONTR-2026-0001');
    expect(call.html).toContain('ТОВ Тест');
    expect(call.html).toContain('30');
    expect(call.html).toContain('20');
    expect(call.html).toContain('50');
  });
```

Also update the import at top of the test file:

```typescript
import {
  sendContractSignature,
  sendInvoice,
  sendDriverAssigned,
  sendCompletionNotification,
} from '../services/email.service';
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npx vitest run src/tests/email.service.test.ts
```

Expected: FAIL — `sendCompletionNotification is not a function` (or similar import error).

- [ ] **Step 3: Add SendCompletionParams interface and sendCompletionNotification to email.service.ts**

Add after `SendDriverAssignedParams` interface (after line ~48) in `server/src/services/email.service.ts`:

```typescript
export interface SendCompletionParams {
  to: string;
  clientName: string;
  contractNumber: string;
  prepaidAmount: number;
  finalAmount: number;
  totalPaid: number;
}
```

Append the function at the end of `server/src/services/email.service.ts`:

```typescript
/* ─── sendCompletionNotification ─────────────────────────── */

export async function sendCompletionNotification(params: SendCompletionParams): Promise<void> {
  const { to, clientName, contractNumber, prepaidAmount, finalAmount, totalPaid } = params;

  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL DEV] sendCompletionNotification → to: ${to}`);
    console.log(`[EMAIL DEV] Contract: ${contractNumber}, Total: ${fmtMoney(totalPaid)} грн`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        ${header()}
        <p style="margin:0 0 8px;">Доброго дня, <strong>${clientName}</strong>!</p>
        <p style="color:#64748b;margin:0 0 24px;">
          Договір <strong>${contractNumber}</strong> успішно виконано. Дякуємо за співпрацю!
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
                    padding:20px 24px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-weight:600;color:#15803d;font-size:14px;">Підсумок оплати</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#64748b;font-size:13px;padding:4px 0;">Аванс:</td>
              <td style="text-align:right;font-weight:600;font-size:13px;color:#1e293b;">
                ${fmtMoney(prepaidAmount)} грн
              </td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:13px;padding:4px 0;">Фінальна оплата:</td>
              <td style="text-align:right;font-weight:600;font-size:13px;color:#1e293b;">
                ${fmtMoney(finalAmount)} грн
              </td>
            </tr>
            <tr style="border-top:1px solid #bbf7d0;">
              <td style="color:#15803d;font-size:13px;padding:8px 0 4px;font-weight:600;">Всього сплачено:</td>
              <td style="text-align:right;font-weight:700;font-size:16px;color:#15803d;padding:8px 0 4px;">
                ${fmtMoney(totalPaid)} грн
              </td>
            </tr>
          </table>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:0;">
          Очікуємо на подальшу співпрацю!
        </p>
      </div>
    </div>`;

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Договір №${contractNumber} виконано — підсумок оплати`,
    html,
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npx vitest run src/tests/email.service.test.ts
```

Expected: all tests PASS (including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/email.service.ts server/src/tests/email.service.test.ts
git commit -m "feat: add sendCompletionNotification to email.service"
```

---

## Task 4: Filter driver dropdown to users-with-accounts only

**Files:**
- Modify: `server/src/router/orders.router.ts` (lookups endpoint, ~line 379)

- [ ] **Step 1: Add user_id filter to the driver query in GET /lookups**

Find this block in `orders.router.ts`:

```typescript
      prisma.driver.findMany({
        where: { company_id: companyId, is_available: true },
        orderBy: { last_name: 'asc' },
        select: { id: true, first_name: true, last_name: true },
      }),
```

Replace with:

```typescript
      prisma.driver.findMany({
        where: { company_id: companyId, is_available: true, user_id: { not: null } },
        orderBy: { last_name: 'asc' },
        select: { id: true, first_name: true, last_name: true },
      }),
```

- [ ] **Step 2: Manually verify**

Start the server (`cd server && npm run dev`) and call `GET /api/orders/lookups` (with a valid auth token). Confirm that only drivers with linked user accounts appear in the `drivers` array.

- [ ] **Step 3: Commit**

```bash
git add server/src/router/orders.router.ts
git commit -m "feat: filter driver dropdown to drivers with user accounts"
```

---

## Task 5: Wire sendDriverAssigned email on NEW → CONFIRMED transition

**Files:**
- Modify: `server/src/router/orders.router.ts`

- [ ] **Step 1: Add imports at the top of orders.router.ts**

Add to the existing import block at the top of `server/src/router/orders.router.ts` (after the `generateOrderPdf` import):

```typescript
import { sendDriverAssigned } from '../services/email.service';
```

- [ ] **Step 2: Add driver email call after the order update in PATCH /:id/status**

In `PATCH /:id/status`, find the block after `emitOrderStatusChanged(...)` and before `return ok(res, orderDto(updated))`:

```typescript
    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: finalStatus,
      previousStatus: existing.status,
    });

    return ok(res, orderDto(updated));
```

Replace with:

```typescript
    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: finalStatus,
      previousStatus: existing.status,
    });

    // Send driver email when order is confirmed
    if (newStatus === 'CONFIRMED') {
      prisma.driver.findFirst({
        where: { id: updated.driver_id ?? '', company_id: companyId },
        select: { first_name: true, last_name: true, user: { select: { email: true } } },
      }).then((driver) => {
        if (!driver?.user?.email) return;
        sendDriverAssigned({
          to: driver.user.email,
          driverName: `${driver.first_name} ${driver.last_name}`,
          contractNumber: updated.order_number,
          pickupAddress: updated.pickup_address,
          deliveryAddress: updated.delivery_address,
          pickupDate: updated.pickup_date.toLocaleString('uk-UA', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }),
        }).catch((err: unknown) => console.error('[EMAIL] sendDriverAssigned failed:', err));
      }).catch((err: unknown) => console.error('[EMAIL] driver lookup failed:', err));
    }

    return ok(res, orderDto(updated));
```

Note: the `prisma.driver.findFirst` + `sendDriverAssigned` chain is fully fire-and-forget (`.then().catch()`), so it never blocks the HTTP response.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

1. Create an order with a driver who has a user account (use `GET /orders/lookups` to find one)
2. Transition it: `PATCH /api/orders/:id/status` with `{ "status": "CONFIRMED" }`
3. Check server logs for `[EMAIL DEV] sendDriverAssigned` (dev mode) or confirm email received (prod mode)
4. Verify response returns `200` with `status: "CONFIRMED"`

- [ ] **Step 5: Commit**

```bash
git add server/src/router/orders.router.ts
git commit -m "feat: send driver assignment email on order CONFIRMED"
```

---

## Task 6: Wire sendInvoice + create Invoice record on request-prepayment

**Files:**
- Modify: `server/src/router/orders.router.ts`

- [ ] **Step 1: Add imports at the top of orders.router.ts**

Extend the email service import to include `sendInvoice`:

```typescript
import { sendDriverAssigned, sendInvoice } from '../services/email.service';
```

Also add pdf import (already imported `generateOrderPdf`):

```typescript
import { generateOrderPdf, generateInvoicePdf } from '../services/pdf.service';
```

- [ ] **Step 2: Expand the order query in POST /:id/request-prepayment**

Find the current query in `POST /:id/request-prepayment`:

```typescript
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, status: true },
    });
```

Replace with:

```typescript
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: {
        id: true,
        status: true,
        order_number: true,
        client_price: true,
        client: { select: { email: true, company_name: true } },
      },
    });
```

- [ ] **Step 3: Add invoice email + Invoice record creation after the status update**

Find this block in `POST /:id/request-prepayment`:

```typescript
    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'AWAITING_PREPAYMENT',
      previousStatus: 'DRIVER_ACCEPTED',
    });

    return ok(res, orderDto(updated));
```

Replace with:

```typescript
    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'AWAITING_PREPAYMENT',
      previousStatus: 'DRIVER_ACCEPTED',
    });

    // Send invoice email + create Invoice record (fire-and-forget)
    if (order.client?.email) {
      const clientEmail = order.client.email;
      const clientName = order.client.company_name;
      const amount = order.client_price;
      const invoiceNumber = `INV-${order.order_number}-PRE`;
      const dueDays = 7;

      Promise.all([
        generateInvoicePdf({ invoiceNumber, contractNumber: order.order_number, clientName, amount, dueDays }),
        prisma.invoice.create({
          data: {
            order_id: order.id,
            company_id: companyId,
            type: 'PREPAYMENT',
            status: 'PENDING',
            amount,
            sent_at: new Date(),
          },
        }),
      ]).then(([pdfBytes]) => {
        return sendInvoice({ to: clientEmail, contractNumber: order.order_number, clientName, amount, dueDays, pdfBytes });
      }).catch((err: unknown) => console.error('[EMAIL] sendInvoice failed:', err));
    } else {
      console.warn(`[EMAIL] No client email for order ${order.order_number} — invoice email skipped`);
    }

    return ok(res, orderDto(updated));
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Transition an order to `DRIVER_ACCEPTED` (via `POST /:id/accept`)
2. Call `POST /api/orders/:id/request-prepayment`
3. Check server logs for `[EMAIL DEV] sendInvoice` with the contract number and amount
4. Check DB: `SELECT * FROM invoices WHERE order_id = '<id>';` — expect one row with `type=PREPAYMENT`, `status=PENDING`
5. Verify response returns `200` with `status: "AWAITING_PREPAYMENT"`

- [ ] **Step 6: Commit**

```bash
git add server/src/router/orders.router.ts
git commit -m "feat: send invoice email and create Invoice record on request-prepayment"
```

---

## Task 7: Wire sendCompletionNotification + Invoice records on mark-final-paid

**Files:**
- Modify: `server/src/router/orders.router.ts`

- [ ] **Step 1: Add sendCompletionNotification to email import**

Update the email import line:

```typescript
import { sendDriverAssigned, sendInvoice, sendCompletionNotification } from '../services/email.service';
```

- [ ] **Step 2: Expand the order query in POST /:id/mark-final-paid**

Find the current query in `POST /:id/mark-final-paid`:

```typescript
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, status: true, prepaid_amount: true },
    });
```

Replace with:

```typescript
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: {
        id: true,
        status: true,
        order_number: true,
        prepaid_amount: true,
        prepaid_at: true,
        client: { select: { email: true, company_name: true } },
      },
    });
```

- [ ] **Step 3: Add completion email + Invoice records after the status update**

Find this block in `POST /:id/mark-final-paid`:

```typescript
    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'COMPLETED',
      previousStatus: 'AWAITING_FINAL_PAYMENT',
    });

    return ok(res, orderDto(updated));
```

Replace with:

```typescript
    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'COMPLETED',
      previousStatus: 'AWAITING_FINAL_PAYMENT',
    });

    // Update Invoice records + send completion email (fire-and-forget)
    const prepaidAmount = order.prepaid_amount ?? 0;
    Promise.all([
      prisma.invoice.updateMany({
        where: { order_id: order.id, type: 'PREPAYMENT' },
        data: { status: 'PAID', paid_at: order.prepaid_at ?? new Date() },
      }),
      prisma.invoice.create({
        data: {
          order_id: order.id,
          company_id: companyId,
          type: 'FINAL',
          status: 'PAID',
          amount,
          sent_at: new Date(),
          paid_at: new Date(),
        },
      }),
    ]).then(() => {
      if (!order.client?.email) {
        console.warn(`[EMAIL] No client email for order ${order.order_number} — completion email skipped`);
        return;
      }
      return sendCompletionNotification({
        to: order.client.email,
        clientName: order.client.company_name,
        contractNumber: order.order_number,
        prepaidAmount,
        finalAmount: amount,
        totalPaid,
      });
    }).catch((err: unknown) => console.error('[EMAIL] sendCompletionNotification failed:', err));

    return ok(res, orderDto(updated));
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd server && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Manual smoke test**

1. Transition an order through the full lifecycle: `IN_TRANSIT → DELIVERED` (auto-moves to `AWAITING_FINAL_PAYMENT`)
2. Call `POST /api/orders/:id/mark-final-paid` with `{ "amount": 25000 }`
3. Check server logs for `[EMAIL DEV] sendCompletionNotification`
4. Check DB:
   ```sql
   SELECT type, status, amount, sent_at, paid_at FROM invoices WHERE order_id = '<id>';
   ```
   Expect two rows: `PREPAYMENT/PAID` and `FINAL/PAID`
5. Verify response returns `200` with `status: "COMPLETED"`

- [ ] **Step 7: Commit**

```bash
git add server/src/router/orders.router.ts
git commit -m "feat: send completion email and finalize Invoice records on mark-final-paid"
```

---

## Spec Coverage Check

| Spec requirement | Covered by |
|-----------------|------------|
| Invoice model with InvoiceType, InvoiceStatus enums | Task 1 |
| Driver dropdown shows only drivers with user accounts | Task 4 |
| sendDriverAssigned wired into CONFIRMED transition | Task 5 |
| generateInvoicePdf (simple one-page PDF) | Task 2 |
| sendInvoice wired into request-prepayment | Task 6 |
| Invoice PREPAYMENT/PENDING created on request-prepayment | Task 6 |
| sendCompletionNotification added to email.service | Task 3 |
| sendCompletionNotification wired into mark-final-paid | Task 7 |
| Invoice PREPAYMENT→PAID + FINAL/PAID created on mark-final-paid | Task 7 |
| Email failures don't block status transitions | Tasks 5, 6, 7 (fire-and-forget) |
| Silent skip when client/driver has no email | Tasks 5, 6, 7 |
