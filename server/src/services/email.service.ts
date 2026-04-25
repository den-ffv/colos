import nodemailer from 'nodemailer';
import { env } from '../config/env';

/* ─── Transporter ────────────────────────────────────────── */

// Lazy singleton: читає process.env при першому виклику з SMTP_USER.
// Це дозволяє тестам встановлювати env-змінні динамічно.
let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  const smtpUser = process.env.SMTP_USER;
  if (!smtpUser) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: process.env.SMTP_PASS ?? '' },
    });
  }
  return _transporter;
}

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

export interface SendCompletionParams {
  to: string;
  clientName: string;
  contractNumber: string;
  prepaidAmount: number;
  finalAmount: number;
  totalPaid: number;
}

/* ─── Helpers ────────────────────────────────────────────── */

function fmtMoney(amount: number): string {
  return amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const baseStyle = [
  'font-family:Arial,sans-serif',
  'color:#1e293b',
  'background:#f8fafc',
  'padding:32px',
  'max-width:560px',
  'margin:0 auto',
].join(';');

const cardStyle = [
  'background:#ffffff',
  'border-radius:8px',
  'border:1px solid #e2e8f0',
  'padding:28px 32px',
].join(';');

const accent = '#2563eb';

function header(): string {
  return `
    <div style="border-bottom:2px solid ${accent};padding-bottom:16px;margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:${accent};">COLOS</span>
      <span style="font-size:20px;font-weight:400;color:#64748b;"> CRM</span>
    </div>`;
}

/* ─── sendContractSignature ──────────────────────────────── */

export async function sendContractSignature(params: SendContractSignatureParams): Promise<void> {
  const { to, contractNumber, clientName, otpCode, pdfBytes } = params;

  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL DEV] sendContractSignature → to: ${to}`);
    console.log(`[EMAIL DEV] Contract: ${contractNumber}, OTP: ${otpCode}`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        ${header()}
        <p style="margin:0 0 8px;">Доброго дня, <strong>${clientName}</strong>!</p>
        <p style="color:#64748b;margin:0 0 24px;">
          Вам надіслано договір на транспортні послуги <strong>${contractNumber}</strong>.
          Будь ласка, ознайомтесь із документом у вкладенні та підтвердьте підписання нижченаведеним кодом.
        </p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;
                    padding:20px 24px;text-align:center;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;color:#3b82f6;font-weight:600;
                    text-transform:uppercase;letter-spacing:0.5px;">
            Код підтвердження
          </p>
          <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;color:${accent};">
            ${otpCode}
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Дійсний 48 годин</p>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin:0;">
          Якщо ви не очікували цього листа — проігноруйте його.
        </p>
      </div>
    </div>`;

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Договір №${contractNumber} очікує вашого підтвердження`,
    html,
    attachments: [
      { filename: `${contractNumber}.pdf`, content: pdfBytes, contentType: 'application/pdf' },
    ],
  });
}

/* ─── sendInvoice ────────────────────────────────────────── */

export async function sendInvoice(params: SendInvoiceParams): Promise<void> {
  const { to, contractNumber, clientName, amount, dueDays, pdfBytes } = params;

  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL DEV] sendInvoice → to: ${to}`);
    console.log(`[EMAIL DEV] Contract: ${contractNumber}, Amount: ${fmtMoney(amount)} грн, Due: ${dueDays} днів`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        ${header()}
        <p style="margin:0 0 8px;">Доброго дня, <strong>${clientName}</strong>!</p>
        <p style="color:#64748b;margin:0 0 24px;">
          Договір <strong>${contractNumber}</strong> підписано. Дякуємо!
          Будь ласка, здійсніть оплату відповідно до рахунку у вкладенні.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
                    padding:20px 24px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#64748b;font-size:13px;padding:4px 0;">До сплати:</td>
              <td style="text-align:right;font-weight:700;font-size:18px;color:#16a34a;">
                ${fmtMoney(amount)} грн
              </td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:13px;padding:4px 0;">Термін оплати:</td>
              <td style="text-align:right;font-weight:600;font-size:13px;color:#1e293b;">
                ${dueDays} календарних днів
              </td>
            </tr>
          </table>
        </div>
        <p style="color:#64748b;font-size:13px;margin:0 0 8px;">
          Після здійснення оплати повідомте вашого менеджера.
        </p>
        <p style="font-size:12px;color:#94a3b8;margin:0;">Рахунок у вкладенні.</p>
      </div>
    </div>`;

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Рахунок до договору №${contractNumber}`,
    html,
    attachments: [
      { filename: `invoice-${contractNumber}.pdf`, content: pdfBytes, contentType: 'application/pdf' },
    ],
  });
}

/* ─── sendDriverAssigned ─────────────────────────────────── */

export async function sendDriverAssigned(params: SendDriverAssignedParams): Promise<void> {
  const { to, driverName, contractNumber, pickupAddress, deliveryAddress, pickupDate } = params;

  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL DEV] sendDriverAssigned → to: ${to}`);
    console.log(`[EMAIL DEV] Driver: ${driverName}, Contract: ${contractNumber}`);
    return;
  }

  const html = `
    <div style="${baseStyle}">
      <div style="${cardStyle}">
        ${header()}
        <p style="margin:0 0 8px;">Доброго дня, <strong>${driverName}</strong>!</p>
        <p style="color:#64748b;margin:0 0 24px;">
          Вам призначено новий рейс за договором <strong>${contractNumber}</strong>.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                    padding:20px 24px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:13px;width:40%;">Дата виїзду:</td>
              <td style="padding:8px 0;font-weight:600;font-size:13px;color:#1e293b;">${pickupDate}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0;">
              <td style="padding:8px 0;color:#64748b;font-size:13px;">Завантаження:</td>
              <td style="padding:8px 0;font-weight:600;font-size:13px;color:#1e293b;">${pickupAddress}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0;">
              <td style="padding:8px 0;color:#64748b;font-size:13px;">Розвантаження:</td>
              <td style="padding:8px 0;font-weight:600;font-size:13px;color:#1e293b;">${deliveryAddress}</td>
            </tr>
          </table>
        </div>
        <p style="color:#64748b;font-size:13px;margin:0;">
          Деталі рейсу доступні у вашому порталі COLOS CRM.
        </p>
      </div>
    </div>`;

  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Новий рейс: ${contractNumber}`,
    html,
  });
}

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
