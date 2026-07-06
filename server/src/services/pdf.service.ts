import { PDFDocument, PDFFont, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import type { Prisma } from '@prisma/client';

/* ─── Types ─────────────────────────────────────────────── */

type OrderForPdf = Prisma.ordersGetPayload<{
  include: {
    clients: true;
    drivers: true;
    vehicles: true;
    carriers: true;
    users: { select: { first_name: true; last_name: true; email: true } };
  };
}>;

/* ─── Static data ────────────────────────────────────────── */

const STATUS_UA: Record<string, string> = {
  NEW: 'Новий',
  CONFIRMED: 'Підтверджено',
  IN_TRANSIT: 'В дорозі',
  DELIVERED: 'Доставлено',
  CANCELLED: 'Скасовано',
};

const EXEC_UA: Record<string, string> = {
  INTERNAL: 'Власний транспорт',
  EXTERNAL: 'Сторонній перевізник',
};

/* ─── Fonts ──────────────────────────────────────────────── */

const FONT_DIR = join(__dirname, '../assets/fonts');
const arialBytes = readFileSync(join(FONT_DIR, 'Arial.ttf'));
const arialBoldBytes = readFileSync(join(FONT_DIR, 'Arial-Bold.ttf'));

/* ─── Helpers ────────────────────────────────────────────── */

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—';
  return v.toLocaleString('uk-UA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/* ─── Mapbox helpers ─────────────────────────────────────── */

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? '';

async function geocode(address: string): Promise<[number, number] | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const res = await axios.get<{ features: { center: [number, number] }[] }>(url, { timeout: 5000 });
    const feature = res.data.features[0];
    return feature ? feature.center : null;
  } catch {
    return null;
  }
}

async function fetchMapImage(
  from: [number, number],
  to: [number, number],
): Promise<Uint8Array | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const pinFrom = `pin-s-a+2563eb(${from[0]},${from[1]})`;
    const pinTo = `pin-s-b+dc2626(${to[0]},${to[1]})`;
    const overlay = `${pinFrom},${pinTo}`;
    const url =
      `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlay}/auto/480x280@2x` +
      `?padding=40&access_token=${MAPBOX_TOKEN}`;
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 8000 });
    return new Uint8Array(res.data);
  } catch {
    return null;
  }
}

/* ─── PDF generation ─────────────────────────────────────── */

export async function generateOrderPdf(order: OrderForPdf): Promise<Uint8Array> {
  // Fetch map in parallel with PDF setup
  const [fromCoords, toCoords] = await Promise.all([
    geocode(order.pickup_address),
    geocode(order.delivery_address),
  ]);
  const mapBytes =
    fromCoords && toCoords ? await fetchMapImage(fromCoords, toCoords) : null;

  /* ── Document ── */
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBold = await pdfDoc.embedFont(arialBoldBytes);
  const fontReg = await pdfDoc.embedFont(arialBytes);

  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  /* ── Colors ── */
  const cBlue: RGB = rgb(0.086, 0.322, 0.812);
  const cBlueDark: RGB = rgb(0.059, 0.220, 0.600);
  const cGray: RGB = rgb(0.45, 0.45, 0.45);
  const cBlack: RGB = rgb(0.08, 0.08, 0.08);
  const cLine: RGB = rgb(0.88, 0.90, 0.93);
  const cWhite: RGB = rgb(1, 1, 1);
  const cBg: RGB = rgb(0.975, 0.977, 0.982);

  /* ── Constants ── */
  const ML = 44; // margin left
  const MR = 44; // margin right
  const CW = width - ML - MR; // content width = 507
  const MAP_W = 220;
  const MAP_H = 130;
  const MAP_X = width - MR - MAP_W;

  /* ─────────────────────────────────────────
     HEADER
  ───────────────────────────────────────── */
  const HDR_H = 58;
  page.drawRectangle({ x: 0, y: height - HDR_H, width, height: HDR_H, color: cBlue });

  // Logo
  page.drawText('COLOS', {
    x: ML, y: height - 24, size: 20, font: fontBold, color: cWhite,
  });
  page.drawText('CRM', {
    x: ML + fontBold.widthOfTextAtSize('COLOS', 20) + 4,
    y: height - 24, size: 20, font: fontReg, color: rgb(0.7, 0.82, 1),
  });
  page.drawText('Товарно-транспортна накладна', {
    x: ML, y: height - 42, size: 9, font: fontReg, color: rgb(0.75, 0.85, 1),
  });

  // Order number
  const numText = order.order_number;
  const numW = fontBold.widthOfTextAtSize(numText, 13);
  page.drawText(numText, {
    x: width - MR - numW, y: height - 35, size: 13, font: fontBold, color: cWhite,
  });

  /* ─────────────────────────────────────────
     MAP (top-right, below header)
  ───────────────────────────────────────── */
  const MAP_Y = height - HDR_H - MAP_H - 14;

  if (mapBytes) {
    const mapImg = await pdfDoc.embedPng(mapBytes);
    // Subtle card background
    page.drawRectangle({
      x: MAP_X - 4, y: MAP_Y - 4,
      width: MAP_W + 8, height: MAP_H + 8,
      color: cBg,
      borderColor: cLine, borderWidth: 1,
    });
    page.drawImage(mapImg, { x: MAP_X, y: MAP_Y, width: MAP_W, height: MAP_H });
  }

  /* ─────────────────────────────────────────
     STATUS ROW (below header, left of map)
  ───────────────────────────────────────── */
  let y = height - HDR_H - 20;
  const statusText = STATUS_UA[order.status] ?? order.status;
  const execText = EXEC_UA[order.execution_type] ?? order.execution_type;

  // Status pill
  page.drawRectangle({
    x: ML, y: y - 12,
    width: fontBold.widthOfTextAtSize(statusText, 9) + 14,
    height: 18, color: rgb(0.91, 0.94, 1.0),
    borderColor: cBlue, borderWidth: 0.6,
  });
  page.drawText(statusText, {
    x: ML + 7, y: y - 6, size: 9, font: fontBold, color: cBlue,
  });

  y -= 22;
  page.drawText('Тип виконання:', { x: ML, y, size: 8.5, font: fontReg, color: cGray });
  page.drawText(execText, { x: ML + 95, y, size: 8.5, font: fontBold, color: cBlack });

  y -= 14;
  page.drawText(`Дата створення: ${fmtDate(order.created_at)}`, {
    x: ML, y, size: 8, font: fontReg, color: cGray,
  });

  /* ─────────────────────────────────────────
     CONTENT — starts below map zone
  ───────────────────────────────────────── */
  y = MAP_Y - 22;

  page.drawLine({
    start: { x: ML, y: y + 8 }, end: { x: width - MR, y: y + 8 },
    thickness: 0.5, color: cLine,
  });

  /* ── Helpers for content ── */

  // Content width excluding map area (for sections that run full width)
  const FULL_W = CW;

  // Label → value single row
  const COL_LABEL = ML;
  const COL_VALUE = ML + 160;
  const COL_VAL_W = width - MR - COL_VALUE; // ~340px

  // Two-column layout
  const C2_L1 = ML;        // left label
  const C2_V1 = ML + 130;  // left value (~170px wide)
  const C2_L2 = ML + 300;  // right label
  const C2_V2 = ML + 420;  // right value (~90px wide)

  function section(title: string) {
    page.drawText(title.toUpperCase(), {
      x: COL_LABEL, y, size: 7.5, font: fontBold, color: cBlue,
    });
    y -= 5;
    page.drawLine({
      start: { x: COL_LABEL, y }, end: { x: ML + FULL_W, y },
      thickness: 0.4, color: cLine,
    });
    y -= 13;
  }

  function row(label: string, value: string) {
    const lines = wrapText(value, fontReg, 8.5, COL_VAL_W);
    page.drawText(label, { x: COL_LABEL, y, size: 8.5, font: fontReg, color: cGray });
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], { x: COL_VALUE, y: y - i * 12, size: 8.5, font: fontReg, color: cBlack });
    }
    y -= 12 * lines.length + 2;
  }

  function twoCol(l1: string, v1: string, l2: string, v2: string) {
    page.drawText(l1, { x: C2_L1, y, size: 8.5, font: fontReg, color: cGray });
    page.drawText(v1, { x: C2_V1, y, size: 8.5, font: fontBold, color: cBlack });
    page.drawText(l2, { x: C2_L2, y, size: 8.5, font: fontReg, color: cGray });
    page.drawText(v2, { x: C2_V2, y, size: 8.5, font: fontBold, color: cBlack });
    y -= 14;
  }

  /* ── Замовник ── */
  section('Замовник');
  row('Компанія', order.clients?.company_name ?? '—');
  row('Контактна особа', order.clients?.contact_person ?? '—');
  row('Email', order.clients?.email ?? '—');
  row('Телефон', order.clients?.phone ?? '—');
  y -= 6;

  /* ── Маршрут ── */
  section('Маршрут');
  row('Адреса завантаження', order.pickup_address);
  row('Адреса розвантаження', order.delivery_address);
  twoCol('Дата завантаження', fmtDate(order.pickup_date), 'Дата доставки', fmtDate(order.delivery_date));
  y -= 6;

  /* ── Вантаж ── */
  section('Вантаж');
  twoCol(
    'Тип вантажу', order.product_type ?? '—',
    'Кількість', order.quantity != null ? `${fmt(order.quantity, 0)} ${order.unit ?? ''}`.trim() : '—',
  );
  twoCol(
    'Вага', order.weight != null ? `${fmt(order.weight)} т` : '—',
    "Об'єм", order.volume != null ? `${fmt(order.volume)} м³` : '—',
  );
  y -= 6;

  /* ── Виконавець ── */
  section('Виконавець');
  if (order.execution_type === 'INTERNAL') {
    const driverName = order.drivers
      ? `${order.drivers.first_name} ${order.drivers.last_name}`
      : '—';
    const vehicleInfo = order.vehicles
      ? `${order.vehicles.plate_number} (${order.vehicles.type})`
      : '—';
    twoCol('Водій', driverName, 'Транспортний засіб', vehicleInfo);
    twoCol(
      'Витрати на пальне', order.estimated_fuel_cost != null ? `${fmt(order.estimated_fuel_cost)} грн` : '—',
      'Витрати на зарплату', order.estimated_salary_cost != null ? `${fmt(order.estimated_salary_cost)} грн` : '—',
    );
  } else {
    row('Перевізник', order.carriers?.company_name ?? '—');
    row('Контакт перевізника', order.carriers?.contact_person ?? '—');
    row('Авто перевізника', order.carrier_vehicle_info ?? '—');
    twoCol(
      'Ціна перевізника', order.carrier_agreed_price != null ? `${fmt(order.carrier_agreed_price)} грн` : '—',
      'Оплата перевізнику', order.carrier_paid ? 'Оплачено' : 'Не оплачено',
    );
  }
  y -= 6;

  /* ── Фінанси ── */
  section('Фінанси');
  twoCol(
    'Ціна клієнта', `${fmt(order.client_price)} грн`,
    'Оплата клієнта', order.client_paid ? 'Оплачено' : 'Не оплачено',
  );
  twoCol(
    'Собівартість', `${fmt(order.total_cost)} грн`,
    'Маржа', `${fmt(order.margin)} грн (${fmt(order.margin_percent)}%)`,
  );
  y -= 6;

  /* ── Менеджер ── */
  section('Відповідальний менеджер');
  const managerName = order.users
    ? `${order.users.first_name} ${order.users.last_name}`
    : '—';
  twoCol('Менеджер', managerName, 'Email', order.users?.email ?? '—');
  y -= 6;

  /* ── Примітки ── */
  if (order.notes) {
    section('Примітки');
    const lines = wrapText(order.notes, fontReg, 8.5, FULL_W);
    for (const line of lines) {
      page.drawText(line, { x: COL_LABEL, y, size: 8.5, font: fontReg, color: cBlack });
      y -= 13;
    }
    y -= 6;
  }

  /* ─────────────────────────────────────────
     FOOTER
  ───────────────────────────────────────── */
  const FY = 32;
  page.drawLine({
    start: { x: ML, y: FY + 18 }, end: { x: width - MR, y: FY + 18 },
    thickness: 0.4, color: cLine,
  });

  // Footer background accent
  page.drawRectangle({ x: ML, y: FY - 2, width: 4, height: 14, color: cBlue });

  const generated = `Сформовано: ${new Date().toLocaleString('uk-UA')}`;
  page.drawText(generated, { x: ML + 10, y: FY + 2, size: 7.5, font: fontReg, color: cGray });

  const idText = `ID: ${order.id}`;
  const idW = fontReg.widthOfTextAtSize(idText, 7.5);
  page.drawText(idText, { x: width - MR - idW, y: FY + 2, size: 7.5, font: fontReg, color: cGray });

  // Thin colored bottom bar
  page.drawRectangle({ x: 0, y: 0, width, height: 4, color: cBlueDark });

  return pdfDoc.save();
}

/* ─── Invoice PDF ────────────────────────────────────────── */

export interface InvoicePdfParams {
  invoiceNumber: string;
  contractNumber: string;
  clientName: string;
  amount: number;
  dueDays: number;
  fuelCost?: number;
  salaryCost?: number;
  pickupAddress?: string;
  deliveryAddress?: string;
  bankAccount?: { name: string; account: string };
}

export async function generateInvoicePdf(params: InvoicePdfParams): Promise<Buffer> {
  const {
    invoiceNumber, contractNumber, clientName, amount, dueDays,
    fuelCost, salaryCost, pickupAddress, deliveryAddress, bankAccount,
  } = params;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBold = await pdfDoc.embedFont(arialBoldBytes);
  const fontReg  = await pdfDoc.embedFont(arialBytes);

  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const cBlue:  RGB = rgb(0.086, 0.322, 0.812);
  const cGray:  RGB = rgb(0.45, 0.45, 0.45);
  const cBlack: RGB = rgb(0.08, 0.08, 0.08);
  const cLine:  RGB = rgb(0.88, 0.90, 0.93);
  const cBg:    RGB = rgb(0.975, 0.977, 0.982);
  const ML = 44;
  const MR = 44;
  const CW = width - ML - MR;

  let y = height - 50;

  // ── Header ──
  page.drawText('COLOS', { x: ML, y, size: 22, font: fontBold, color: cBlue });
  page.drawText(' CRM', { x: ML + 72, y, size: 22, font: fontReg, color: cGray });
  y -= 16;
  page.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 2, color: cBlue });
  y -= 28;

  page.drawText('РАХУНОК НА ОПЛАТУ (АВАНС)', { x: ML, y, size: 15, font: fontBold, color: cBlack });
  y -= 30;

  // ── Meta ──
  const issueDate = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const dueDate   = new Date(Date.now() + dueDays * 86400000).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function metaRow(label: string, value: string) {
    page.drawText(label, { x: ML, y, size: 10, font: fontReg, color: cGray });
    page.drawText(value, { x: ML + 170, y, size: 10, font: fontBold, color: cBlack });
    y -= 18;
  }

  metaRow('Номер рахунку:', invoiceNumber);
  metaRow('Договір:', contractNumber);
  metaRow('Клієнт:', clientName);
  metaRow('Дата виставлення:', issueDate);
  metaRow('Термін оплати:', `до ${dueDate} (${dueDays} дн.)`);
  y -= 8;

  // ── Route ──
  if (pickupAddress || deliveryAddress) {
    page.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 0.4, color: cLine });
    y -= 14;
    page.drawText('МАРШРУТ', { x: ML, y, size: 8, font: fontBold, color: cBlue });
    y -= 12;
    if (pickupAddress) {
      page.drawText('Завантаження:', { x: ML, y, size: 9, font: fontReg, color: cGray });
      page.drawText(pickupAddress, { x: ML + 100, y, size: 9, font: fontReg, color: cBlack });
      y -= 13;
    }
    if (deliveryAddress) {
      page.drawText('Розвантаження:', { x: ML, y, size: 9, font: fontReg, color: cGray });
      page.drawText(deliveryAddress, { x: ML + 100, y, size: 9, font: fontReg, color: cBlack });
      y -= 13;
    }
    y -= 6;
  }

  // ── Cost breakdown ──
  if (fuelCost !== undefined || salaryCost !== undefined) {
    page.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 0.4, color: cLine });
    y -= 14;
    page.drawText('СКЛАД АВАНСУ', { x: ML, y, size: 8, font: fontBold, color: cBlue });
    y -= 12;

    page.drawRectangle({ x: ML, y: y - 4, width: CW, height: 46, color: cBg, borderColor: cLine, borderWidth: 0.5 });

    function costRow(label: string, val: number) {
      page.drawText(label, { x: ML + 10, y, size: 9.5, font: fontReg, color: cGray });
      const vs = `${val.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн`;
      page.drawText(vs, { x: width - MR - fontBold.widthOfTextAtSize(vs, 9.5) - 10, y, size: 9.5, font: fontBold, color: cBlack });
      y -= 16;
    }

    if (fuelCost !== undefined)   costRow('Витрати на паливо:', fuelCost);
    if (salaryCost !== undefined) costRow('Зарплата водія:', salaryCost);
    y -= 6;
  }

  // ── Total amount ──
  page.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 0.5, color: cLine });
  y -= 22;
  page.drawText('До сплати:', { x: ML, y, size: 12, font: fontReg, color: cGray });
  const amtStr = `${amount.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн`;
  page.drawText(amtStr, { x: width - MR - fontBold.widthOfTextAtSize(amtStr, 20), y: y - 3, size: 20, font: fontBold, color: cBlue });
  y -= 40;

  // ── Bank account ──
  if (bankAccount) {
    page.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 0.4, color: cLine });
    y -= 14;
    page.drawText('РЕКВІЗИТИ ДЛЯ ОПЛАТИ', { x: ML, y, size: 8, font: fontBold, color: cBlue });
    y -= 12;
    page.drawText('Отримувач:', { x: ML, y, size: 9.5, font: fontReg, color: cGray });
    page.drawText(bankAccount.name, { x: ML + 100, y, size: 9.5, font: fontBold, color: cBlack });
    y -= 14;
    page.drawText('Рахунок (IBAN):', { x: ML, y, size: 9.5, font: fontReg, color: cGray });
    page.drawText(bankAccount.account, { x: ML + 100, y, size: 9.5, font: fontBold, color: cBlack });
    y -= 14;
    page.drawText('Призначення платежу:', { x: ML, y, size: 9.5, font: fontReg, color: cGray });
    page.drawText(`Аванс за договором №${contractNumber}`, { x: ML + 100, y, size: 9.5, font: fontReg, color: cBlack });
    y -= 18;
  }

  // ── Note ──
  page.drawText('Будь ласка, здійсніть оплату у зазначений термін та повідомте менеджера.', {
    x: ML, y, size: 8.5, font: fontReg, color: cGray,
  });

  // ── Footer ──
  page.drawText(`Сформовано: ${issueDate}`, { x: ML, y: 20, size: 8, font: fontReg, color: cGray });
  page.drawRectangle({ x: 0, y: 0, width, height: 4, color: cBlue });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
