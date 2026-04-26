import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createOrderSchema, updateOrderSchema, updateOrderStatusSchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parseLimit, parsePage, parseSortOrder } from '../utils/pagination';
import { emitOrderStatusChanged, emitOrderUpdated } from '../services/socket';
import { generateOrderPdf, generateInvoicePdf } from '../services/pdf.service';
import { sendDriverAssigned, sendInvoice, sendCompletionNotification, sendOrderStatusUpdate } from '../services/email.service';
import * as NotificationService from '../services/notification.service';
import type { Prisma, OrderStatus, ExecutionType } from '@prisma/client';

export const ordersRouter = express.Router();

ordersRouter.use(requireAuth);

/* ─── helpers ─────────────────────────────────────────── */

function getCompanyId(req: Request) {
  return (req as AuthenticatedRequest).auth.company_id;
}

function getUserId(req: Request) {
  return (req as AuthenticatedRequest).auth.sub;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s || null;
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDatetime(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ORDER_STATUSES: OrderStatus[] = [
  'NEW', 'CONFIRMED', 'DRIVER_ACCEPTED', 'AWAITING_PREPAYMENT',
  'PREPAID', 'IN_TRANSIT', 'DELIVERED', 'AWAITING_FINAL_PAYMENT',
  'COMPLETED', 'CANCELLED',
];
const EXECUTION_TYPES: ExecutionType[] = ['INTERNAL', 'EXTERNAL'];

/** Allowed status transitions (via PATCH /status — manual role-based) */
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW:                    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:              ['CANCELLED'],
  DRIVER_ACCEPTED:        ['CANCELLED'],
  AWAITING_PREPAYMENT:    ['CANCELLED'],
  PREPAID:                ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT:             ['CANCELLED'],
  DELIVERED:              [],
  AWAITING_FINAL_PAYMENT: [],
  COMPLETED:              [],
  CANCELLED:              [],
};

function parseSort(sortBy: unknown) {
  const v = typeof sortBy === 'string' ? sortBy : '';
  const n = v.trim();
  if (n === 'orderNumber' || n === 'order_number') return 'order_number';
  if (n === 'status') return 'status';
  if (n === 'pickupDate' || n === 'pickup_date') return 'pickup_date';
  if (n === 'deliveryDate' || n === 'delivery_date') return 'delivery_date';
  if (n === 'clientPrice' || n === 'client_price') return 'client_price';
  if (n === 'createdAt' || n === 'created_at') return 'created_at';
  if (n === 'updatedAt' || n === 'updated_at') return 'updated_at';
  return 'created_at';
}

/** Generate sequential order number ORD-YYYYMMDD-XXXX */
async function generateOrderNumber(companyId: string): Promise<string> {
  const today = new Date();
  const ds = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${ds}-`;
  const last = await prisma.orders.findFirst({
    where: { company_id: companyId, order_number: { startsWith: prefix } },
    orderBy: { order_number: 'desc' },
    select: { order_number: true },
  });
  let seq = 1;
  if (last) {
    const tail = last.order_number.replace(prefix, '');
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function computeFinancials(data: {
  executionType: ExecutionType;
  estimatedFuelCost?: number | null;
  estimatedSalaryCost?: number | null;
  carrierAgreedPrice?: number | null;
  clientPrice: number;
}) {
  const internalCost = (data.estimatedFuelCost ?? 0) + (data.estimatedSalaryCost ?? 0);
  const externalCost = data.carrierAgreedPrice ?? 0;
  const totalCost = data.executionType === 'INTERNAL' ? internalCost : externalCost;
  const margin = data.clientPrice - totalCost;
  const marginPercent = data.clientPrice > 0 ? (margin / data.clientPrice) * 100 : 0;
  return {
    internal_cost: internalCost || null,
    external_cost: externalCost || null,
    total_cost: totalCost,
    margin: Math.round(margin * 100) / 100,
    margin_percent: Math.round(marginPercent * 100) / 100,
  };
}

const orderSelect = {
  id: true,
  order_number: true,
  client_id: true,
  client: { select: { id: true, company_name: true, contact_person: true } },
  product_type: true,
  quantity: true,
  unit: true,
  weight: true,
  volume: true,
  pickup_address: true,
  delivery_address: true,
  pickup_date: true,
  delivery_date: true,
  status: true,
  execution_type: true,
  driver_id: true,
  driver: { select: { id: true, first_name: true, last_name: true } },
  vehicle_id: true,
  vehicle: { select: { id: true, plate_number: true, type: true } },
  estimated_fuel_cost: true,
  estimated_salary_cost: true,
  carrier_id: true,
  carrier: { select: { id: true, company_name: true } },
  carrier_agreed_price: true,
  carrier_paid: true,
  carrier_vehicle_info: true,
  internal_cost: true,
  external_cost: true,
  total_cost: true,
  client_price: true,
  margin: true,
  margin_percent: true,
  client_paid: true,
  prepaid_amount: true,
  prepaid_at: true,
  final_paid_amount: true,
  final_paid_at: true,
  total_paid: true,
  assigned_manager_id: true,
  assigned_manager: { select: { id: true, first_name: true, last_name: true, email: true } },
  notes: true,
  company_id: true,
  created_at: true,
  updated_at: true,
} as const;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function orderDto(o: OrderRow) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    clientId: o.client_id,
    client: o.client ? { id: o.client.id, companyName: o.client.company_name, contactPerson: o.client.contact_person } : null,
    productType: o.product_type ?? undefined,
    quantity: o.quantity ?? undefined,
    unit: o.unit ?? undefined,
    weight: o.weight ?? undefined,
    volume: o.volume ?? undefined,
    pickupAddress: o.pickup_address,
    deliveryAddress: o.delivery_address,
    pickupDate: o.pickup_date.toISOString(),
    deliveryDate: o.delivery_date?.toISOString() ?? undefined,
    status: o.status,
    executionType: o.execution_type,
    driverId: o.driver_id ?? undefined,
    driver: o.driver ? { id: o.driver.id, name: `${o.driver.first_name} ${o.driver.last_name}` } : undefined,
    vehicleId: o.vehicle_id ?? undefined,
    vehicle: o.vehicle ? { id: o.vehicle.id, plateNumber: o.vehicle.plate_number, type: o.vehicle.type } : undefined,
    estimatedFuelCost: o.estimated_fuel_cost ?? undefined,
    estimatedSalaryCost: o.estimated_salary_cost ?? undefined,
    carrierId: o.carrier_id ?? undefined,
    carrier: o.carrier ? { id: o.carrier.id, companyName: o.carrier.company_name } : undefined,
    carrierAgreedPrice: o.carrier_agreed_price ?? undefined,
    carrierPaid: o.carrier_paid,
    carrierVehicleInfo: o.carrier_vehicle_info ?? undefined,
    internalCost: o.internal_cost ?? undefined,
    externalCost: o.external_cost ?? undefined,
    totalCost: o.total_cost,
    clientPrice: o.client_price,
    margin: o.margin,
    marginPercent: o.margin_percent,
    clientPaid: o.client_paid,
    prepaidAmount: o.prepaid_amount ?? undefined,
    prepaidAt: o.prepaid_at?.toISOString() ?? undefined,
    finalPaidAmount: o.final_paid_amount ?? undefined,
    finalPaidAt: o.final_paid_at?.toISOString() ?? undefined,
    totalPaid: o.total_paid,
    assignedManagerId: o.assigned_manager_id,
    assignedManager: o.assigned_manager
      ? {
          id: o.assigned_manager.id,
          name: `${o.assigned_manager.first_name} ${o.assigned_manager.last_name}`,
          email: o.assigned_manager.email,
        }
      : undefined,
    notes: o.notes ?? undefined,
    createdAt: o.created_at.toISOString(),
    updatedAt: o.updated_at.toISOString(),
  };
}

function orderListDto(o: OrderRow) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    clientName: o.client?.company_name ?? '—',
    status: o.status,
    executionType: o.execution_type,
    pickupAddress: o.pickup_address,
    deliveryAddress: o.delivery_address,
    pickupDate: o.pickup_date.toISOString(),
    deliveryDate: o.delivery_date?.toISOString() ?? undefined,
    totalCost: o.total_cost,
    clientPrice: o.client_price,
    margin: o.margin,
    marginPercent: o.margin_percent,
    clientPaid: o.client_paid,
    driverName: o.driver ? `${o.driver.first_name} ${o.driver.last_name}` : undefined,
    carrierName: o.carrier?.company_name ?? undefined,
    createdAt: o.created_at.toISOString(),
    updatedAt: o.updated_at.toISOString(),
  };
}

/* ─── GET /my – orders assigned to the calling DRIVER ── */

ordersRouter.get(
  '/my',
  authorize(['DRIVER']),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const driver = await prisma.drivers.findFirst({
      where: { user_id: auth.sub, company_id: auth.company_id },
      select: { id: true },
    });
    if (!driver) return fail(res, 403, 'Ваш обліковий запис не прив\'язаний до профілю водія');

    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const where = { company_id: auth.company_id, driver_id: driver.id };

    const [total, rows] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          order_number: true,
          status: true,
          pickup_address: true,
          delivery_address: true,
          pickup_date: true,
          delivery_date: true,
          product_type: true,
          weight: true,
          notes: true,
          client: { select: { id: true, company_name: true, contact_person: true, phone: true } },
          vehicle: { select: { id: true, plate_number: true, type: true } },
          created_at: true,
          updated_at: true,
        },
      }),
    ]);

    return okList(
      res,
      rows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        pickupAddress: o.pickup_address,
        deliveryAddress: o.delivery_address,
        pickupDate: o.pickup_date.toISOString(),
        deliveryDate: o.delivery_date?.toISOString(),
        productType: o.product_type ?? undefined,
        weight: o.weight ?? undefined,
        notes: o.notes ?? undefined,
        client: o.client
          ? { id: o.client.id, companyName: o.client.company_name, contactPerson: o.client.contact_person, phone: o.client.phone }
          : null,
        vehicle: o.vehicle ? { plateNumber: o.vehicle.plate_number, type: o.vehicle.type } : undefined,
        createdAt: o.created_at.toISOString(),
        updatedAt: o.updated_at.toISOString(),
      })),
      { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    );
  }),
);

/* ─── GET /  – paginated list ─────────────────────────── */

ordersRouter.get(
  '/',
  authorize(['ADMIN', 'LOGIST', 'MANAGER']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const sortBy = parseSort(req.query.sortBy);
    const q = normalizeText(req.query.q);
    const status = normalizeText(req.query.status);
    const executionType = normalizeText(req.query.executionType);

    const where: Prisma.OrderWhereInput = { company_id: companyId };

    if (status && ORDER_STATUSES.includes(status as OrderStatus)) {
      where.status = status as OrderStatus;
    }
    if (executionType && EXECUTION_TYPES.includes(executionType as ExecutionType)) {
      where.execution_type = executionType as ExecutionType;
    }
    if (q) {
      where.OR = [
        { order_number: { contains: q, mode: 'insensitive' } },
        { pickup_address: { contains: q, mode: 'insensitive' } },
        { delivery_address: { contains: q, mode: 'insensitive' } },
        { client: { company_name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.OrderOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
        select: orderSelect,
      }),
    ]);

    return okList(res, rows.map(orderListDto), {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/* ─── GET /lookups – drivers, vehicles, carriers, clients for dropdowns */

ordersRouter.get(
  '/lookups',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const [clients, drivers, vehicles, carriers, activeOrders] = await Promise.all([
      prisma.clients.findMany({
        where: { company_id: companyId },
        orderBy: { company_name: 'asc' },
        select: { id: true, company_name: true, contact_person: true, phone: true, email: true, address: true },
        take: 500,
      }),
      prisma.drivers.findMany({
        where: { company_id: companyId, is_available: true, user_id: { not: null } },
        orderBy: { last_name: 'asc' },
        select: { id: true, first_name: true, last_name: true, pay_rate: true, pay_type: true },
      }),
      prisma.vehicles.findMany({
        where: { company_id: companyId, is_available: true },
        orderBy: { plate_number: 'asc' },
        select: { id: true, plate_number: true, type: true, capacity: true, fuel_consumption: true, fuel_type: true },
      }),
      prisma.carriers.findMany({
        where: { company_id: companyId, is_available: true },
        orderBy: { company_name: 'asc' },
        select: { id: true, company_name: true },
      }),
      // Active orders to detect which drivers/vehicles are currently busy
      prisma.orders.findMany({
        where: {
          company_id: companyId,
          status: { in: ['CONFIRMED', 'IN_TRANSIT'] },
          OR: [{ driver_id: { not: null } }, { vehicle_id: { not: null } }],
        },
        select: { driver_id: true, vehicle_id: true, order_number: true, status: true },
      }),
    ]);

    // Build busy maps: resourceId → order info
    const busyDrivers = new Map<string, { orderNumber: string; status: string }>();
    const busyVehicles = new Map<string, { orderNumber: string; status: string }>();
    for (const o of activeOrders) {
      if (o.driver_id)  busyDrivers.set(o.driver_id,  { orderNumber: o.order_number, status: o.status });
      if (o.vehicle_id) busyVehicles.set(o.vehicle_id, { orderNumber: o.order_number, status: o.status });
    }

    return ok(res, {
      clients: clients.map((c) => ({
        id: c.id,
        companyName: c.company_name,
        contactPerson: c.contact_person,
        phone: c.phone,
        email: c.email ?? undefined,
        address: c.address ?? undefined,
      })),
      drivers: drivers.map((d) => {
        const busy = busyDrivers.get(d.id);
        return {
          id: d.id,
          name: `${d.first_name} ${d.last_name}`,
          payRate: d.pay_rate ?? null,
          payType: d.pay_type,
          isBusy: !!busy,
          busyOrderNumber: busy?.orderNumber ?? null,
          busyStatus: busy?.status ?? null,
        };
      }),
      vehicles: vehicles.map((v) => {
        const busy = busyVehicles.get(v.id);
        return {
          id: v.id,
          plateNumber: v.plate_number,
          type: v.type,
          capacity: v.capacity,
          fuelConsumption: v.fuel_consumption ?? undefined,
          fuelType: v.fuel_type ?? undefined,
          isBusy: !!busy,
          busyOrderNumber: busy?.orderNumber ?? null,
          busyStatus: busy?.status ?? null,
        };
      }),
      carriers: carriers.map((c) => ({ id: c.id, companyName: c.company_name })),
    });
  }),
);

/* ─── GET /:id – single order ─────────────────────────── */

ordersRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const row = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: orderSelect,
    });
    if (!row) return fail(res, 404, 'Order not found');
    return ok(res, orderDto(row));
  }),
);

/* ─── POST / – create order ──────────────────────────── */

ordersRouter.post(
  '/',
  authorize(['ADMIN', 'LOGIST']),
  validate(createOrderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const clientId = normalizeText(body.clientId);
    const pickupAddress = normalizeText(body.pickupAddress);
    const deliveryAddress = normalizeText(body.deliveryAddress);
    const pickupDate = toDatetime(body.pickupDate);
    const executionType = normalizeText(body.executionType) as ExecutionType | null;
    const clientPrice = toFloat(body.clientPrice);

    if (!clientId || !pickupAddress || !deliveryAddress || !pickupDate || !executionType || clientPrice === null) {
      return fail(res, 400, 'clientId, pickupAddress, deliveryAddress, pickupDate, executionType, clientPrice are required');
    }
    if (!EXECUTION_TYPES.includes(executionType)) {
      return fail(res, 400, 'executionType must be INTERNAL or EXTERNAL');
    }

    // Verify client belongs to company
    const client = await prisma.clients.findFirst({ where: { id: clientId, company_id: companyId }, select: { id: true } });
    if (!client) return fail(res, 400, 'Client not found');

    const orderNumber = await generateOrderNumber(companyId);

    const financials = computeFinancials({
      executionType,
      estimatedFuelCost: toFloat(body.estimatedFuelCost),
      estimatedSalaryCost: toFloat(body.estimatedSalaryCost),
      carrierAgreedPrice: toFloat(body.carrierAgreedPrice),
      clientPrice,
    });

    const created = await prisma.orders.create({
      data: {
        order_number: orderNumber,
        client_id: clientId,
        product_type: normalizeText(body.productType),
        quantity: toFloat(body.quantity),
        unit: normalizeText(body.unit),
        weight: toFloat(body.weight),
        volume: toFloat(body.volume),
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        pickup_date: pickupDate,
        delivery_date: toDatetime(body.deliveryDate),
        execution_type: executionType,
        driver_id: normalizeText(body.driverId) || null,
        vehicle_id: normalizeText(body.vehicleId) || null,
        estimated_fuel_cost: toFloat(body.estimatedFuelCost),
        estimated_salary_cost: toFloat(body.estimatedSalaryCost),
        carrier_id: normalizeText(body.carrierId) || null,
        carrier_agreed_price: toFloat(body.carrierAgreedPrice),
        carrier_vehicle_info: normalizeText(body.carrierVehicleInfo),
        ...financials,
        client_price: clientPrice,
        assigned_manager_id: userId,
        notes: normalizeText(body.notes),
        company_id: companyId,
      },
      select: orderSelect,
    });

    emitOrderUpdated(companyId, { orderId: created.id, orderNumber: created.order_number, action: 'created' });

    NotificationService.create({
      userId,
      type: 'ORDER_CREATED',
      title: `Договір ${created.order_number} створено`,
      body: `${created.pickup_address} → ${created.delivery_address}`,
      orderId: created.id,
    }).catch((err: unknown) => console.error('[NOTIFY] ORDER_CREATED failed:', err));

    return ok(res, orderDto(created), 201);
  }),
);

/* ─── PUT /:id – update order ─────────────────────────── */

ordersRouter.put(
  '/:id',
  authorize(['ADMIN', 'LOGIST']),
  validate(updateOrderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, status: true, execution_type: true, client_price: true, estimated_fuel_cost: true, estimated_salary_cost: true, carrier_agreed_price: true },
    });
    if (!existing) return fail(res, 404, 'Order not found');

    // Cannot edit delivered or cancelled orders (except notes)
    if (existing.status === 'DELIVERED' || existing.status === 'CANCELLED') {
      return fail(res, 400, 'Cannot edit a finished order');
    }

    const executionType = (normalizeText(body.executionType) as ExecutionType) || existing.execution_type;
    const clientPrice = toFloat(body.clientPrice) ?? existing.client_price;

    const financials = computeFinancials({
      executionType,
      estimatedFuelCost: toFloat(body.estimatedFuelCost) ?? existing.estimated_fuel_cost,
      estimatedSalaryCost: toFloat(body.estimatedSalaryCost) ?? existing.estimated_salary_cost,
      carrierAgreedPrice: toFloat(body.carrierAgreedPrice) ?? existing.carrier_agreed_price,
      clientPrice,
    });

    const data: Prisma.OrderUpdateInput = {
      ...(normalizeText(body.clientId) ? { client: { connect: { id: body.clientId as string } } } : {}),
      ...(normalizeText(body.productType) !== undefined ? { product_type: normalizeText(body.productType) } : {}),
      ...(body.quantity !== undefined ? { quantity: toFloat(body.quantity) } : {}),
      ...(normalizeText(body.unit) !== undefined ? { unit: normalizeText(body.unit) } : {}),
      ...(body.weight !== undefined ? { weight: toFloat(body.weight) } : {}),
      ...(body.volume !== undefined ? { volume: toFloat(body.volume) } : {}),
      ...(normalizeText(body.pickupAddress) ? { pickup_address: normalizeText(body.pickupAddress)! } : {}),
      ...(normalizeText(body.deliveryAddress) ? { delivery_address: normalizeText(body.deliveryAddress)! } : {}),
      ...(body.pickupDate !== undefined ? { pickup_date: toDatetime(body.pickupDate) ?? undefined } : {}),
      ...(body.deliveryDate !== undefined ? { delivery_date: toDatetime(body.deliveryDate) } : {}),
      execution_type: executionType,
      ...(body.driverId !== undefined ? { driver_id: normalizeText(body.driverId) || null } : {}),
      ...(body.vehicleId !== undefined ? { vehicle_id: normalizeText(body.vehicleId) || null } : {}),
      ...(body.estimatedFuelCost !== undefined ? { estimated_fuel_cost: toFloat(body.estimatedFuelCost) } : {}),
      ...(body.estimatedSalaryCost !== undefined ? { estimated_salary_cost: toFloat(body.estimatedSalaryCost) } : {}),
      ...(body.carrierId !== undefined ? { carrier_id: normalizeText(body.carrierId) || null } : {}),
      ...(body.carrierAgreedPrice !== undefined ? { carrier_agreed_price: toFloat(body.carrierAgreedPrice) } : {}),
      ...(body.carrierVehicleInfo !== undefined ? { carrier_vehicle_info: normalizeText(body.carrierVehicleInfo) } : {}),
      ...(body.clientPaid !== undefined ? { client_paid: !!body.clientPaid } : {}),
      ...(body.carrierPaid !== undefined ? { carrier_paid: !!body.carrierPaid } : {}),
      ...(normalizeText(body.notes) !== undefined ? { notes: body.notes === null ? null : normalizeText(body.notes) } : {}),
      client_price: clientPrice,
      ...financials,
    };

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data,
      select: orderSelect,
    });

    return ok(res, orderDto(updated));
  }),
);

/* ─── PATCH /:id/status – change status ──────────────── */

ordersRouter.patch(
  '/:id/status',
  authorize(['ADMIN', 'LOGIST', 'DRIVER']),
  validate(updateOrderStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const companyId = auth.company_id;
    const body = (req.body as Record<string, unknown> | null) ?? {};
    const newStatus = normalizeText(body.status) as OrderStatus | null;

    if (!newStatus || !ORDER_STATUSES.includes(newStatus)) {
      return fail(res, 400, 'Invalid status');
    }

    const existing = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, status: true, driver_id: true },
    });

    // DRIVER може змінювати статус тільки для замовлень, де він призначений
    if (auth.roles.includes('DRIVER') && !auth.roles.includes('ADMIN') && !auth.roles.includes('LOGIST')) {
      const driverProfile = await prisma.drivers.findFirst({
        where: { user_id: auth.sub, company_id: companyId },
        select: { id: true },
      });
        if (!driverProfile || existing?.driver_id !== driverProfile.id) {
        return fail(res, 403, 'Ви можете змінювати статус лише своїх замовлень');
      }
    }
    if (!existing) return fail(res, 404, 'Order not found');

    // DRIVER: PREPAID → IN_TRANSIT; IN_TRANSIT → DELIVERED auto-transitions to AWAITING_FINAL_PAYMENT
    const isDriverOnly = auth.roles.includes('DRIVER') && !auth.roles.includes('ADMIN') && !auth.roles.includes('LOGIST');
    if (isDriverOnly) {
      const driverAllowed: Partial<Record<OrderStatus, OrderStatus>> = {
        PREPAID: 'IN_TRANSIT',
        IN_TRANSIT: 'DELIVERED',
      };
      if (!driverAllowed[existing.status] || driverAllowed[existing.status] !== newStatus) {
        return fail(res, 403, 'As a driver you can only move PREPAID→IN_TRANSIT or IN_TRANSIT→DELIVERED');
      }
    } else {
      const allowed = STATUS_TRANSITIONS[existing.status];
      if (!allowed.includes(newStatus)) {
        return fail(res, 400, `Cannot transition from ${existing.status} to ${newStatus}`);
      }
    }

    // When DELIVERED, automatically move to AWAITING_FINAL_PAYMENT
    const finalStatus: OrderStatus = newStatus === 'DELIVERED' ? 'AWAITING_FINAL_PAYMENT' : newStatus;

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data: {
        status: finalStatus,
        ...(newStatus === 'DELIVERED' ? { delivery_date: new Date() } : {}),
      },
      select: orderSelect,
    });

    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: finalStatus,
      previousStatus: existing.status,
    });

    // Send driver email when order is confirmed
    if (newStatus === 'CONFIRMED' && updated.driver_id) {
      prisma.drivers.findFirst({
        where: { id: updated.driver_id, company_id: companyId },
        select: { first_name: true, last_name: true, user_id: true, user: { select: { email: true } } },
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
        if (driver.user_id) {
          NotificationService.create({
            userId: driver.user_id,
            type: 'DRIVER_ASSIGNED',
            title: `Новий рейс: ${updated.order_number}`,
            body: `${updated.pickup_address} → ${updated.delivery_address}`,
            orderId: updated.id,
          }).catch((err: unknown) => console.error('[NOTIFY] DRIVER_ASSIGNED failed:', err));
        }
      }).catch((err: unknown) => console.error('[EMAIL] driver lookup failed:', err));
    }

    if (finalStatus === 'IN_TRANSIT') {
      prisma.orders.findUnique({
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
        }).catch((err: unknown) => console.error('[EMAIL] IN_TRANSIT status update failed:', err));
      }).catch((err: unknown) => console.error('[EMAIL] client lookup for IN_TRANSIT failed:', err));
    }

    if (newStatus === 'DELIVERED') {
      prisma.orders.findUnique({
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
        }).catch((err: unknown) => console.error('[EMAIL] DELIVERED status update failed:', err));
      }).catch((err: unknown) => console.error('[EMAIL] client lookup for DELIVERED failed:', err));
    }

    return ok(res, orderDto(updated));
  }),
);

/* ─── POST /:id/accept – DRIVER приймає договір ──────── */

ordersRouter.post(
  '/:id/accept',
  authorize(['DRIVER', 'ADMIN', 'LOGIST']),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const companyId = auth.company_id;

    const order = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, status: true, driver_id: true },
    });
    if (!order) return fail(res, 404, 'Order not found');
    if (order.status !== 'CONFIRMED') return fail(res, 400, `Cannot accept order with status ${order.status}`);

    if (auth.roles.includes('DRIVER') && !auth.roles.includes('ADMIN') && !auth.roles.includes('LOGIST')) {
      const driverProfile = await prisma.drivers.findFirst({
        where: { user_id: auth.sub, company_id: companyId },
        select: { id: true },
      });
      if (!driverProfile || order.driver_id !== driverProfile.id) {
        return fail(res, 403, 'Ви можете приймати лише свої замовлення');
      }
    }

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data: { status: 'DRIVER_ACCEPTED' },
      select: orderSelect,
    });

    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'DRIVER_ACCEPTED',
      previousStatus: 'CONFIRMED',
    });

    prisma.orders.findUnique({
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
    }).catch((err: unknown) => console.error('[NOTIFY] manager lookup for DRIVER_ACCEPTED failed:', err));

    return ok(res, orderDto(updated));
  }),
);

/* ─── POST /:id/request-prepayment – запит авансу ────── */

ordersRouter.post(
  '/:id/request-prepayment',
  authorize(['ADMIN', 'LOGIST']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);

    const order = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: {
        id: true,
        status: true,
        order_number: true,
        client_price: true,
        client: { select: { email: true, company_name: true } },
      },
    });
    if (!order) return fail(res, 404, 'Order not found');
    if (order.status !== 'DRIVER_ACCEPTED') {
      return fail(res, 400, `Cannot request prepayment from status ${order.status}`);
    }

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data: { status: 'AWAITING_PREPAYMENT' },
      select: orderSelect,
    });

    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'AWAITING_PREPAYMENT',
      previousStatus: 'DRIVER_ACCEPTED',
    });

    // Create Invoice record + optionally send invoice email (fire-and-forget)
    const invoiceAmount = order.client_price;
    const invoiceNumber = `INV-${order.order_number}-PRE`;
    const dueDays = 7;

    prisma.invoices.create({
      data: {
        order_id: order.id,
        company_id: companyId,
        type: 'PREPAYMENT',
        status: 'PENDING',
        amount: invoiceAmount,
        sent_at: new Date(),
      },
    }).then(() => {
      if (!order.client?.email) {
        console.warn(`[EMAIL] No client email for order ${order.order_number} — invoice email skipped`);
        return;
      }
      const clientEmail = order.client.email;
      const clientName = order.client.company_name;
      return generateInvoicePdf({ invoiceNumber, contractNumber: order.order_number, clientName, amount: invoiceAmount, dueDays })
        .then((pdfBytes) => sendInvoice({ to: clientEmail, contractNumber: order.order_number, clientName, amount: invoiceAmount, dueDays, pdfBytes }));
    }).catch((err: unknown) => console.error('[EMAIL] invoice processing failed:', err));

    return ok(res, orderDto(updated));
  }),
);

/* ─── POST /:id/mark-prepaid – фіксація авансу ───────── */

ordersRouter.post(
  '/:id/mark-prepaid',
  authorize(['ADMIN', 'LOGIST']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const amount = typeof req.body?.amount === 'number' ? req.body.amount : null;
    if (!amount || amount <= 0) return fail(res, 400, 'amount must be a positive number');

    const order = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, status: true },
    });
    if (!order) return fail(res, 404, 'Order not found');
    if (order.status !== 'AWAITING_PREPAYMENT') {
      return fail(res, 400, `Cannot mark prepaid from status ${order.status}`);
    }

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data: {
        status: 'PREPAID',
        prepaid_amount: amount,
        prepaid_at: new Date(),
        total_paid: amount,
      },
      select: orderSelect,
    });

    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'PREPAID',
      previousStatus: 'AWAITING_PREPAYMENT',
    });

    prisma.orders.findUnique({
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

    return ok(res, orderDto(updated));
  }),
);

/* ─── POST /:id/mark-final-paid – фіксація фін. оплати ─ */

ordersRouter.post(
  '/:id/mark-final-paid',
  authorize(['ADMIN', 'LOGIST']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const amount = typeof req.body?.amount === 'number' ? req.body.amount : null;
    if (!amount || amount <= 0) return fail(res, 400, 'amount must be a positive number');

    const order = await prisma.orders.findFirst({
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
    if (!order) return fail(res, 404, 'Order not found');
    if (order.status !== 'AWAITING_FINAL_PAYMENT') {
      return fail(res, 400, `Cannot mark final paid from status ${order.status}`);
    }

    const totalPaid = (order.prepaid_amount ?? 0) + amount;

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data: {
        status: 'COMPLETED',
        final_paid_amount: amount,
        final_paid_at: new Date(),
        total_paid: totalPaid,
        client_paid: true,
      },
      select: orderSelect,
    });

    emitOrderStatusChanged(companyId, {
      orderId: updated.id,
      orderNumber: updated.order_number,
      newStatus: 'COMPLETED',
      previousStatus: 'AWAITING_FINAL_PAYMENT',
    });

    prisma.orders.findUnique({
      where: { id: req.params.id },
      select: { assigned_manager_id: true, order_number: true, company_id: true },
    }).then(async (o) => {
      if (!o) return;
      const adminUsers = await prisma.users.findMany({
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

    // Update Invoice records + send completion email (fire-and-forget)
    const prepaidAmount = order.prepaid_amount ?? 0;
    Promise.all([
      prisma.invoices.updateMany({
        where: { order_id: order.id, type: 'PREPAYMENT' },
        data: { status: 'PAID', paid_at: order.prepaid_at ?? new Date() },
      }),
      prisma.invoices.create({
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
  }),
);

/* ─── DELETE /:id – admin only ────────────────────────── */

ordersRouter.delete(
  '/:id',
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const existing = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, order_number: true },
    });
    if (!existing) return fail(res, 404, 'Order not found');
    await prisma.orders.delete({ where: { id: req.params.id } });
    emitOrderUpdated(companyId, { orderId: req.params.id, orderNumber: existing.order_number, action: 'deleted' });
    return ok(res, { ok: true });
  }),
);

/* ─── GET /:id/pdf – generate waybill PDF ─────────────── */

ordersRouter.get(
  '/:id/pdf',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const order = await prisma.orders.findFirst({
      where: { id: req.params.id, company_id: companyId },
      include: {
        client: true,
        driver: true,
        vehicle: true,
        carrier: true,
        assigned_manager: { select: { first_name: true, last_name: true, email: true } },
      },
    });
    if (!order) return fail(res, 404, 'Order not found');

    const pdfBytes = await generateOrderPdf(order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${order.order_number}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.end(Buffer.from(pdfBytes));
  }),
);
