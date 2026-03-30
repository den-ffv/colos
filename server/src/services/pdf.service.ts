import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Prisma } from '@prisma/client';

type OrderForPdf = Prisma.OrderGetPayload<{
  include: {
    client: true;
    driver: true;
    vehicle: true;
    carrier: true;
    assigned_manager: { select: { first_name: true; last_name: true; email: true } };
  };
}>;

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

export async function generateOrderPdf(order: OrderForPdf): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const margin = 48;
  const col1 = margin;
  const col2 = margin + 200;
  let y = height - margin;

  const colorBlue = rgb(0.07, 0.35, 0.7);
  const colorGray = rgb(0.45, 0.45, 0.45);
  const colorBlack = rgb(0, 0, 0);
  const colorLine = rgb(0.8, 0.8, 0.8);

  // ── Header ──
  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: colorBlue });
  page.drawText('COLOS CRM', { x: margin, y: height - 32, size: 22, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Товарно-транспортна накладна', { x: margin, y: height - 52, size: 11, font: fontReg, color: rgb(0.85, 0.9, 1) });

  const orderNumText = order.order_number;
  const numWidth = fontBold.widthOfTextAtSize(orderNumText, 14);
  page.drawText(orderNumText, { x: width - margin - numWidth, y: height - 44, size: 14, font: fontBold, color: rgb(1, 1, 1) });

  y = height - 90;

  // ── Status badge ──
  const statusText = STATUS_UA[order.status] ?? order.status;
  page.drawText(`Статус: ${statusText}`, { x: margin, y, size: 10, font: fontBold, color: colorBlue });
  page.drawText(`Тип виконання: ${EXEC_UA[order.execution_type] ?? order.execution_type}`, {
    x: width / 2, y, size: 10, font: fontReg, color: colorGray,
  });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: colorLine });
  y -= 18;

  // ── Section helper ──
  function section(title: string) {
    page.drawText(title, { x: col1, y, size: 10, font: fontBold, color: colorBlue });
    y -= 4;
    page.drawLine({ start: { x: col1, y }, end: { x: width - margin, y }, thickness: 0.4, color: colorLine });
    y -= 14;
  }

  function row(label: string, value: string, colOverride?: number) {
    const xLabel = colOverride ?? col1;
    page.drawText(label, { x: xLabel, y, size: 9, font: fontReg, color: colorGray });
    page.drawText(value, { x: xLabel + 150, y, size: 9, font: fontReg, color: colorBlack });
    y -= 14;
  }

  function twoCol(
    label1: string, val1: string,
    label2: string, val2: string,
  ) {
    page.drawText(label1, { x: col1, y, size: 9, font: fontReg, color: colorGray });
    page.drawText(val1, { x: col2, y, size: 9, font: fontReg, color: colorBlack });
    page.drawText(label2, { x: col1 + 250, y, size: 9, font: fontReg, color: colorGray });
    page.drawText(val2, { x: col1 + 400, y, size: 9, font: fontReg, color: colorBlack });
    y -= 14;
  }

  // ── Client ──
  section('Замовник');
  row('Компанія:', order.client?.company_name ?? '—');
  row('Контактна особа:', order.client?.contact_person ?? '—');
  row('Email:', order.client?.email ?? '—');
  row('Телефон:', order.client?.phone ?? '—');
  y -= 4;

  // ── Route ──
  section('Маршрут');
  row('Адреса завантаження:', order.pickup_address);
  row('Адреса розвантаження:', order.delivery_address);
  twoCol('Дата завантаження:', fmtDate(order.pickup_date), 'Дата доставки:', fmtDate(order.delivery_date));
  y -= 4;

  // ── Cargo ──
  section('Вантаж');
  twoCol('Тип вантажу:', order.product_type ?? '—', 'Кількість:', order.quantity != null ? `${fmt(order.quantity, 0)} ${order.unit ?? ''}`.trim() : '—');
  twoCol('Вага:', order.weight != null ? `${fmt(order.weight)} т` : '—', 'Обʼєм:', order.volume != null ? `${fmt(order.volume)} м³` : '—');
  y -= 4;

  // ── Executor ──
  section('Виконавець');
  if (order.execution_type === 'INTERNAL') {
    const driverName = order.driver ? `${order.driver.first_name} ${order.driver.last_name}` : '—';
    const vehicleInfo = order.vehicle ? `${order.vehicle.plate_number} (${order.vehicle.type})` : '—';
    twoCol('Водій:', driverName, 'Транспортний засіб:', vehicleInfo);
    twoCol('Витрати на пальне:', order.estimated_fuel_cost != null ? `${fmt(order.estimated_fuel_cost)} грн` : '—',
      'Витрати на зарплату:', order.estimated_salary_cost != null ? `${fmt(order.estimated_salary_cost)} грн` : '—');
  } else {
    row('Перевізник:', order.carrier?.company_name ?? '—');
    row('Контакт перевізника:', order.carrier?.contact_person ?? '—');
    row('Авто перевізника:', order.carrier_vehicle_info ?? '—');
    twoCol('Ціна перевізника:', order.carrier_agreed_price != null ? `${fmt(order.carrier_agreed_price)} грн` : '—',
      'Оплата перевізнику:', order.carrier_paid ? 'Оплачено' : 'Не оплачено');
  }
  y -= 4;

  // ── Financials ──
  section('Фінанси');
  twoCol('Ціна клієнта:', `${fmt(order.client_price)} грн`, 'Оплата клієнта:', order.client_paid ? 'Оплачено' : 'Не оплачено');
  twoCol('Собівартість:', `${fmt(order.total_cost)} грн`, 'Маржа:', `${fmt(order.margin)} грн (${fmt(order.margin_percent)}%)`);
  y -= 4;

  // ── Manager ──
  section('Відповідальний менеджер');
  const managerName = order.assigned_manager
    ? `${order.assigned_manager.first_name} ${order.assigned_manager.last_name}`
    : '—';
  twoCol('Менеджер:', managerName, 'Email:', order.assigned_manager?.email ?? '—');
  y -= 4;

  // ── Notes ──
  if (order.notes) {
    section('Примітки');
    const noteLines = order.notes.match(/.{1,85}/g) ?? [order.notes];
    for (const line of noteLines) {
      page.drawText(line, { x: col1, y, size: 9, font: fontReg, color: colorBlack });
      y -= 13;
    }
    y -= 4;
  }

  // ── Footer ──
  const footerY = 38;
  page.drawLine({ start: { x: margin, y: footerY + 20 }, end: { x: width - margin, y: footerY + 20 }, thickness: 0.4, color: colorLine });
  const generated = `Сформовано: ${new Date().toLocaleString('uk-UA')}`;
  page.drawText(generated, { x: margin, y: footerY, size: 8, font: fontReg, color: colorGray });
  const idText = `ID: ${order.id}`;
  const idWidth = fontReg.widthOfTextAtSize(idText, 8);
  page.drawText(idText, { x: width - margin - idWidth, y: footerY, size: 8, font: fontReg, color: colorGray });

  return pdfDoc.save();
}
