# Email Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Додати ізольований email-сервіс у монолітний Express-сервер для відправки листів у flow договорів (підписання через OTP, рахунок, сповіщення водію).

**Architecture:** Один файл `email.service.ts` з nodemailer transporter і трьома публічними функціями. Dev-режим (консоль замість SMTP) активується автоматично коли `SMTP_USER` не вказано в `.env`. Функції кидають помилки вгору — caller вирішує як обробити.

**Tech Stack:** nodemailer, @types/nodemailer, vitest (вже є), Gmail SMTP

---

## File Map

| Дія | Файл | Відповідальність |
|-----|------|-----------------|
| Create | `server/src/services/email.service.ts` | Transporter + три функції відправки |
| Create | `server/src/tests/email.service.test.ts` | Unit-тести із мок transporter |
| Modify | `server/src/config/env.ts` | Додати `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Modify | `server/.env` | Додати три нових змінних (реальні або порожні) |

---

## Task 1: Встановити залежності

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Встановити nodemailer і типи**

```bash
cd server
npm install nodemailer
npm install -D @types/nodemailer
```

Очікуваний вивід: `added 1 package` (nodemailer), `added 1 package` (@types/nodemailer)

- [ ] **Step 2: Перевірити що пакети з'явились у package.json**

```bash
grep nodemailer package.json
```

Очікуваний вивід:
```
"nodemailer": "^X.X.X",
"@types/nodemailer": "^X.X.X",
```

---

## Task 2: Додати SMTP змінні до env

**Files:**
- Modify: `server/src/config/env.ts:11-21`
- Modify: `server/.env`

- [ ] **Step 1: Оновити env.ts**

Замінити весь `export const env = { ... }` блок:

```typescript
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: process.env.PORT ? Number(process.env.PORT) : 4000,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? 'COLOS CRM <noreply@colos.ua>',
} as const;
```

- [ ] **Step 2: Додати змінні в server/.env**

Дописати в кінець файлу `server/.env`:

```env
# Email (Gmail SMTP)
# Залиш порожнім для dev-режиму (логування в консоль)
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="COLOS CRM <your-gmail@gmail.com>"
```

- [ ] **Step 3: Перевірити компіляцію**

```bash
cd server && npx tsc --noEmit
```

Очікуваний вивід: (пусто — без помилок)

---

## Task 3: Написати тести (TDD — спочатку тести)

**Files:**
- Create: `server/src/tests/email.service.test.ts`

- [ ] **Step 1: Створити файл тестів**

```typescript
// server/src/tests/email.service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Мокуємо nodemailer ДО імпорту email.service
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

// Імпортуємо після моку
import {
  sendContractSignature,
  sendInvoice,
  sendDriverAssigned,
} from '../services/email.service';

const PDF_STUB = Buffer.from('fake-pdf-bytes');

describe('email.service — dev mode (SMTP_USER порожній)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // В тестах SMTP_USER не встановлено → dev mode
    delete process.env.SMTP_USER;
  });

  it('sendContractSignature не кидає помилку і не викликає sendMail', async () => {
    await expect(
      sendContractSignature({
        to: 'client@test.com',
        contractNumber: 'CONTR-2026-0001',
        clientName: 'ТОВ Тест',
        otpCode: '123456',
        pdfBytes: PDF_STUB,
      }),
    ).resolves.toBeUndefined();

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sendInvoice не кидає помилку і не викликає sendMail', async () => {
    await expect(
      sendInvoice({
        to: 'client@test.com',
        contractNumber: 'CONTR-2026-0001',
        clientName: 'ТОВ Тест',
        amount: 50000,
        dueDays: 14,
        pdfBytes: PDF_STUB,
      }),
    ).resolves.toBeUndefined();

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sendDriverAssigned не кидає помилку і не викликає sendMail', async () => {
    await expect(
      sendDriverAssigned({
        to: 'driver@test.com',
        driverName: 'Олег Мишкович',
        contractNumber: 'CONTR-2026-0001',
        pickupAddress: 'Київ, вул. Хрещатик 1',
        deliveryAddress: 'Львів, пл. Ринок 1',
        pickupDate: '20.04.2026, 08:00',
      }),
    ).resolves.toBeUndefined();

    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('email.service — production mode (SMTP_USER встановлено)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_USER = 'test@gmail.com';
    process.env.SMTP_PASS = 'testpass';
  });

  afterEach(() => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it('sendContractSignature викликає sendMail з правильними полями', async () => {
    await sendContractSignature({
      to: 'client@test.com',
      contractNumber: 'CONTR-2026-0001',
      clientName: 'ТОВ Тест',
      otpCode: '847293',
      pdfBytes: PDF_STUB,
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(call.to).toBe('client@test.com');
    expect(call.subject).toContain('CONTR-2026-0001');
    expect(call.html).toContain('847293');
    expect(Array.isArray(call.attachments)).toBe(true);
    expect((call.attachments as unknown[]).length).toBe(1);
  });

  it('sendInvoice викликає sendMail з сумою у темі або тілі', async () => {
    await sendInvoice({
      to: 'client@test.com',
      contractNumber: 'CONTR-2026-0001',
      clientName: 'ТОВ Тест',
      amount: 50000,
      dueDays: 14,
      pdfBytes: PDF_STUB,
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(call.to).toBe('client@test.com');
    expect(call.html).toContain('50');   // частина числа 50000
    expect(Array.isArray(call.attachments)).toBe(true);
  });

  it('sendDriverAssigned викликає sendMail без вкладень', async () => {
    await sendDriverAssigned({
      to: 'driver@test.com',
      driverName: 'Олег Мишкович',
      contractNumber: 'CONTR-2026-0001',
      pickupAddress: 'Київ',
      deliveryAddress: 'Львів',
      pickupDate: '20.04.2026, 08:00',
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(call.to).toBe('driver@test.com');
    expect(call.html).toContain('Олег Мишкович');
    expect(call.html).toContain('Київ');
  });

  it('sendContractSignature прокидає помилку якщо sendMail відмовив', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(
      sendContractSignature({
        to: 'client@test.com',
        contractNumber: 'CONTR-2026-0001',
        clientName: 'ТОВ Тест',
        otpCode: '000000',
        pdfBytes: PDF_STUB,
      }),
    ).rejects.toThrow('SMTP connection refused');
  });
});
```

- [ ] **Step 2: Запустити тести — переконатись що вони падають (файл ще не існує)**

```bash
cd server && npx vitest run src/tests/email.service.test.ts
```

Очікуваний вивід: помилка `Cannot find module '../services/email.service'`

---

## Task 4: Реалізувати email.service.ts

**Files:**
- Create: `server/src/services/email.service.ts`

- [ ] **Step 1: Створити файл сервісу**

```typescript
// server/src/services/email.service.ts
import nodemailer from 'nodemailer';
import { env } from '../config/env';

/* ─── Transporter ────────────────────────────────────────── */

const transporter = env.SMTP_USER
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

/* ─── Types ──────────────────────────────────────────────── */

export interface SendContractSignatureParams {
  to: string;
  contractNumber: string;
  clientName: string;
  otpCode: string;
  pdfBytes: Buffer;
}

export interface SendInvoiceParams {
  to: string;
  contractNumber: string;
  clientName: string;
  amount: number;
  dueDays: number;
  pdfBytes: Buffer;
}

export interface SendDriverAssignedParams {
  to: string;
  driverName: string;
  contractNumber: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupDate: string;
}

/* ─── Helpers ────────────────────────────────────────────── */

function fmtMoney(amount: number): string {
  return amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const baseStyle = `
  font-family: Arial, sans-serif;
  color: #1e293b;
  background: #f8fafc;
  padding: 32px;
  max-width: 560px;
  margin: 0 auto;
`;

const cardStyle = `
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 28px 32px;
`;

const accentColor = '#2563eb';

/* ─── sendContractSignature ──────────────────────────────── */

export async function sendContractSignature(params: SendContractSignatureParams): Promise<void> {
  const { to, contractNumber, clientName, otpCode, pdfBytes } = params;

  if (!transporter) {
    console.log(`[EMAIL DEV] sendContractSignature → to: ${to}`);
    console.log(`[EMAIL DEV] Contract: ${contractNumber}, OTP: ${otpCode}`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        <div style="border-bottom: 2px solid ${accentColor}; padding-bottom: 16px; margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700; color: ${accentColor};">COLOS</span>
          <span style="font-size: 20px; font-weight: 400; color: #64748b;"> CRM</span>
        </div>

        <p style="margin: 0 0 8px;">Доброго дня, <strong>${clientName}</strong>!</p>
        <p style="color: #64748b; margin: 0 0 24px;">
          Вам надіслано договір на транспортні послуги <strong>${contractNumber}</strong>.
          Будь ласка, ознайомтесь із документом у вкладенні та підтвердьте його підписання.
        </p>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
                    padding: 20px 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #3b82f6; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.5px;">
            Код підтвердження
          </p>
          <p style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 8px;
                    color: ${accentColor};">
            ${otpCode}
          </p>
          <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">
            Дійсний 48 годин
          </p>
        </div>

        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          Якщо ви не очікували цього листа — проігноруйте його.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Договір №${contractNumber} очікує вашого підтвердження`,
    html,
    attachments: [
      {
        filename: `${contractNumber}.pdf`,
        content: pdfBytes,
        contentType: 'application/pdf',
      },
    ],
  });
}

/* ─── sendInvoice ────────────────────────────────────────── */

export async function sendInvoice(params: SendInvoiceParams): Promise<void> {
  const { to, contractNumber, clientName, amount, dueDays, pdfBytes } = params;

  if (!transporter) {
    console.log(`[EMAIL DEV] sendInvoice → to: ${to}`);
    console.log(`[EMAIL DEV] Contract: ${contractNumber}, Amount: ${fmtMoney(amount)} грн, Due: ${dueDays} днів`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        <div style="border-bottom: 2px solid ${accentColor}; padding-bottom: 16px; margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700; color: ${accentColor};">COLOS</span>
          <span style="font-size: 20px; font-weight: 400; color: #64748b;"> CRM</span>
        </div>

        <p style="margin: 0 0 8px;">Доброго дня, <strong>${clientName}</strong>!</p>
        <p style="color: #64748b; margin: 0 0 24px;">
          Договір <strong>${contractNumber}</strong> підписано. Дякуємо!
          Будь ласка, здійсніть оплату відповідно до рахунку у вкладенні.
        </p>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;
                    padding: 20px 24px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #64748b; font-size: 13px;">До сплати:</span>
            <span style="font-weight: 700; font-size: 18px; color: #16a34a;">
              ${fmtMoney(amount)} грн
            </span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b; font-size: 13px;">Термін оплати:</span>
            <span style="font-weight: 600; font-size: 13px; color: #1e293b;">
              ${dueDays} календарних днів
            </span>
          </div>
        </div>

        <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">
          Після здійснення оплати, будь ласка, повідомте вашого менеджера.
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          Рахунок у вкладенні.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Рахунок до договору №${contractNumber}`,
    html,
    attachments: [
      {
        filename: `invoice-${contractNumber}.pdf`,
        content: pdfBytes,
        contentType: 'application/pdf',
      },
    ],
  });
}

/* ─── sendDriverAssigned ─────────────────────────────────── */

export async function sendDriverAssigned(params: SendDriverAssignedParams): Promise<void> {
  const { to, driverName, contractNumber, pickupAddress, deliveryAddress, pickupDate } = params;

  if (!transporter) {
    console.log(`[EMAIL DEV] sendDriverAssigned → to: ${to}`);
    console.log(`[EMAIL DEV] Driver: ${driverName}, Contract: ${contractNumber}`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        <div style="border-bottom: 2px solid ${accentColor}; padding-bottom: 16px; margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700; color: ${accentColor};">COLOS</span>
          <span style="font-size: 20px; font-weight: 400; color: #64748b;"> CRM</span>
        </div>

        <p style="margin: 0 0 8px;">Доброго дня, <strong>${driverName}</strong>!</p>
        <p style="color: #64748b; margin: 0 0 24px;">
          Вам призначено новий рейс за договором <strong>${contractNumber}</strong>.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
                    padding: 20px 24px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 40%;">
                Дата виїзду:
              </td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 13px; color: #1e293b;">
                ${pickupDate}
              </td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Завантаження:</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 13px; color: #1e293b;">
                ${pickupAddress}
              </td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Розвантаження:</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 13px; color: #1e293b;">
                ${deliveryAddress}
              </td>
            </tr>
          </table>
        </div>

        <p style="color: #64748b; font-size: 13px; margin: 0;">
          Деталі рейсу доступні у вашому порталі COLOS CRM.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Новий рейс: ${contractNumber}`,
    html,
  });
}
```

- [ ] **Step 2: Перевірити компіляцію**

```bash
cd server && npx tsc --noEmit
```

Очікуваний вивід: (пусто — без помилок)

---

## Task 5: Запустити тести

**Files:**
- Test: `server/src/tests/email.service.test.ts`

- [ ] **Step 1: Запустити тести email сервісу**

```bash
cd server && npx vitest run src/tests/email.service.test.ts
```

Очікуваний вивід:
```
✓ email.service — dev mode (SMTP_USER порожній) (3)
✓ email.service — production mode (SMTP_USER встановлено) (4)

Test Files  1 passed (1)
Tests       7 passed (7)
```

- [ ] **Step 2: Запустити всі тести щоб переконатись що нічого не зламалось**

```bash
cd server && npx vitest run
```

Очікуваний вивід: всі тести проходять, нових failures немає.

---

## Task 6: Commit

- [ ] **Step 1: Закомітити**

```bash
cd server
git add src/services/email.service.ts \
        src/tests/email.service.test.ts \
        src/config/env.ts \
        package.json \
        package-lock.json
git commit -m "feat: add email service with nodemailer (contract signature, invoice, driver notification)"
```

---

## Self-Review

**Spec coverage:**
- ✅ `sendContractSignature` — Task 4
- ✅ `sendInvoice` — Task 4
- ✅ `sendDriverAssigned` — Task 4
- ✅ Dev mode (консольний лог) — Task 4, перевірено в Task 3
- ✅ `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` в env — Task 2
- ✅ PDF як Buffer → attachment — Task 4
- ✅ Error прокидається вгору — Task 3 (останній тест production mode)

**Placeholder scan:** Немає TBD/TODO

**Type consistency:** `SendContractSignatureParams`, `SendInvoiceParams`, `SendDriverAssignedParams` — визначені в Task 4 і використовуються в тестах Task 3 через named imports.
