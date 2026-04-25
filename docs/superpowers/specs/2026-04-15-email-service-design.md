# Email Service Design — COLOS CRM
_Date: 2026-04-15_

## Overview

Ізольований модуль відправки email у рамках існуючого монолітного Express-сервера. Використовується для сповіщень у flow договорів: підписання через OTP, виставлення рахунку та призначення водія.

---

## Scope

**In scope:**
- Відправка трьох типів листів із HTML-шаблонами
- Прикріплення PDF як вкладення
- Dev-режим (консольний лог замість реальної відправки)
- Конфігурація через env-змінні

**Out of scope:**
- Черга листів / retry-логіка
- Відстеження відкриттів
- Шаблони у БД
- Webhooks про доставку

---

## Architecture

### Новий файл

```
server/src/services/email.service.ts
```

Один файл, один `transporter` (nodemailer), три публічних функції. Жодних нових залежностей від Prisma чи інших сервісів — тільки nodemailer + вхідні параметри.

### Зміни в існуючих файлах

| Файл | Зміна |
|------|-------|
| `server/src/config/env.ts` | Додати `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| `server/.env` | Додати три нових змінних (не коміт) |

---

## Public API

```typescript
// Крок 2 flow договору — відправка клієнту на підписання
sendContractSignature(params: {
  to: string           // email клієнта
  contractNumber: string
  clientName: string
  otpCode: string      // 6-значний код (plain text, не хеш)
  pdfBytes: Buffer     // PDF договору
}): Promise<void>

// Крок 3 — рахунок після успішного підписання
sendInvoice(params: {
  to: string
  contractNumber: string
  clientName: string
  amount: number       // грн
  dueDays: number      // кількість днів для оплати
  pdfBytes: Buffer     // PDF рахунку
}): Promise<void>

// Крок 4 — сповіщення водію після підтвердження оплати
sendDriverAssigned(params: {
  to: string
  driverName: string
  contractNumber: string
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string   // відформатована дата
}): Promise<void>
```

---

## Implementation Details

### Transporter

```typescript
// Створюється один раз при імпорті модуля
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
})
```

Якщо `SMTP_USER` не вказано → `transporter = null`. Всі функції перевіряють це і логують у консоль замість відправки (`[EMAIL DEV]`).

### HTML шаблони

Inline HTML-рядки всередині `email.service.ts`. Мінімальний стиль: білий фон, синій акцент (`#2563eb`), шрифт Arial. Не використовується жодний шаблонізатор.

### PDF вкладення

```typescript
attachments: [{
  filename: `${contractNumber}.pdf`,
  content: pdfBytes,
  contentType: 'application/pdf',
}]
```

### Error handling

Функції кидають помилку вгору (`throw`) — роут-хендлер вирішує чи повертати 500 клієнту. Email-помилка не повинна блокувати збереження договору в БД — виклик огортається в `try/catch` на рівні роута.

---

## Environment Variables

```env
SMTP_USER="your-gmail@gmail.com"
SMTP_PASS="xxxx xxxx xxxx xxxx"   # Gmail App Password (16 символів)
SMTP_FROM="COLOS CRM <your-gmail@gmail.com>"
```

### Як отримати Gmail App Password
1. Google Account → Security → 2-Step Verification (увімкнути)
2. Security → App passwords → Create → назва "COLOS"
3. Скопіювати 16-значний пароль

---

## Dev Mode Behavior

Якщо `SMTP_USER` відсутній у `.env`:

```
[EMAIL DEV] sendContractSignature → to: client@example.com
[EMAIL DEV] Subject: Договір №CONTR-2026-0001 очікує підтвердження
[EMAIL DEV] OTP: 847293
```

Сервер стартує без помилок, функціонал працює без реальної пошти.

---

## File Structure After Implementation

```
server/src/services/
├── email.service.ts    ← новий
├── pdf.service.ts      ← без змін
├── market-data.service.ts
└── socket.ts
```

---

## Dependencies

```bash
npm install nodemailer
npm install -D @types/nodemailer
```
