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

import {
  sendContractSignature,
  sendInvoice,
  sendDriverAssigned,
} from '../services/email.service';

const PDF_STUB = Buffer.from('fake-pdf-bytes');

/* ═══════════════════════════════════════════════════════════
   Dev mode — SMTP_USER порожній → лише консоль, не sendMail
═══════════════════════════════════════════════════════════ */

describe('email.service — dev mode (SMTP_USER порожній)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

/* ═══════════════════════════════════════════════════════════
   Production mode — SMTP_USER встановлено → реальний sendMail
═══════════════════════════════════════════════════════════ */

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

  it('sendInvoice викликає sendMail з сумою у тілі', async () => {
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
    expect(call.html).toContain('50');
    expect(Array.isArray(call.attachments)).toBe(true);
    expect((call.attachments as unknown[]).length).toBe(1);
  });

  it('sendDriverAssigned викликає sendMail з ім\'ям водія і адресами', async () => {
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
    expect(call.html).toContain('Львів');
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
