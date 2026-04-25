import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createCarrierSchema, updateCarrierSchema, availabilitySchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parseLimit, parsePage, parseSortOrder } from '../utils/pagination';
import type { Prisma, VehicleType } from '@prisma/client';

export const carriersRouter = express.Router();

carriersRouter.use(requireAuth);

/* ─── helpers ─────────────────────────────────────────── */

function getCompanyId(req: Request) {
  return (req as AuthenticatedRequest).auth.company_id;
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

const VEHICLE_TYPES: VehicleType[] = ['TRUCK', 'VAN', 'CAR', 'REFRIGERATOR'];

function parseSort(sortBy: unknown) {
  const v = typeof sortBy === 'string' ? sortBy : '';
  const n = v.trim();
  if (n === 'companyName' || n === 'company_name') return 'company_name';
  if (n === 'rating') return 'rating';
  if (n === 'maxCapacity' || n === 'max_capacity') return 'max_capacity';
  if (n === 'isAvailable' || n === 'is_available') return 'is_available';
  if (n === 'createdAt' || n === 'created_at') return 'created_at';
  return 'company_name';
}

const carrierSelect = {
  id: true,
  company_name: true,
  contact_person: true,
  phone: true,
  email: true,
  vehicle_types: true,
  max_capacity: true,
  coverage_areas: true,
  rating: true,
  is_available: true,
  notes: true,
  created_at: true,
  updated_at: true,
} as const;

function carrierDto(c: {
  id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  vehicle_types: VehicleType[];
  max_capacity: number;
  coverage_areas: string[];
  rating: number;
  is_available: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: c.id,
    companyName: c.company_name,
    contactPerson: c.contact_person,
    phone: c.phone,
    email: c.email ?? undefined,
    vehicleTypes: c.vehicle_types,
    maxCapacity: c.max_capacity,
    coverageAreas: c.coverage_areas,
    rating: c.rating,
    isAvailable: c.is_available,
    notes: c.notes ?? undefined,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

/* ─── GET / – paginated list ──────────────────────────── */

carriersRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const sortBy = parseSort(req.query.sortBy);
    const q = normalizeText(req.query.q);
    const available = req.query.available;

    const where: Prisma.CarrierWhereInput = { company_id: companyId };

    if (available === 'true') where.is_available = true;
    else if (available === 'false') where.is_available = false;

    if (q) {
      where.OR = [
        { company_name: { contains: q, mode: 'insensitive' } },
        { contact_person: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.carrier.count({ where }),
      prisma.carrier.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.CarrierOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
        select: carrierSelect,
      }),
    ]);

    return okList(res, rows.map(carrierDto), {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/* ─── GET /:id ────────────────────────────────────────── */

carriersRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const row = await prisma.carrier.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: carrierSelect,
    });
    if (!row) return fail(res, 404, 'Carrier not found');
    return ok(res, carrierDto(row));
  }),
);

/* ─── GET /:id/orders – orders assigned to carrier ─────── */

carriersRouter.get(
  '/:id/orders',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 50);

    const carrier = await prisma.carrier.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!carrier) return fail(res, 404, 'Carrier not found');

    const where: Prisma.OrderWhereInput = { company_id: companyId, carrier_id: req.params.id };
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
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
          carrier_agreed_price: true,
          carrier_paid: true,
          created_at: true,
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
        carrierAgreedPrice: o.carrier_agreed_price,
        carrierPaid: o.carrier_paid,
        createdAt: o.created_at.toISOString(),
      })),
      { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    );
  }),
);

/* ─── POST / – create ─────────────────────────────────── */

carriersRouter.post(
  '/',
  validate(createCarrierSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const companyName = normalizeText(body.companyName ?? body.company_name);
    const contactPerson = normalizeText(body.contactPerson ?? body.contact_person);
    const phone = normalizeText(body.phone);
    const maxCapacity = toFloat(body.maxCapacity ?? body.max_capacity);

    if (!companyName || !contactPerson || !phone || maxCapacity === null) {
      return fail(res, 400, 'companyName, contactPerson, phone, maxCapacity are required');
    }

    const vehicleTypes = Array.isArray(body.vehicleTypes)
      ? (body.vehicleTypes as unknown[]).filter((t): t is VehicleType => typeof t === 'string' && VEHICLE_TYPES.includes(t as VehicleType))
      : [];

    const coverageAreas = Array.isArray(body.coverageAreas)
      ? (body.coverageAreas as unknown[]).filter((a): a is string => typeof a === 'string')
      : [];

    const rating = toFloat(body.rating) ?? 5.0;

    const created = await prisma.carrier.create({
      data: {
        company_name: companyName,
        contact_person: contactPerson,
        phone,
        email: normalizeText(body.email),
        vehicle_types: vehicleTypes,
        max_capacity: maxCapacity,
        coverage_areas: coverageAreas,
        rating: Math.min(5, Math.max(0, rating)),
        is_available: body.isAvailable !== false,
        notes: normalizeText(body.notes),
        company_id: companyId,
      },
      select: carrierSelect,
    });

    return ok(res, carrierDto(created), 201);
  }),
);

/* ─── PUT /:id – update ──────────────────────────────── */

carriersRouter.put(
  '/:id',
  validate(updateCarrierSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.carrier.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Carrier not found');

    const vehicleTypes = Array.isArray(body.vehicleTypes)
      ? (body.vehicleTypes as unknown[]).filter((t): t is VehicleType => typeof t === 'string' && VEHICLE_TYPES.includes(t as VehicleType))
      : undefined;

    const coverageAreas = Array.isArray(body.coverageAreas)
      ? (body.coverageAreas as unknown[]).filter((a): a is string => typeof a === 'string')
      : undefined;

    const rating = toFloat(body.rating);

    const updated = await prisma.carrier.update({
      where: { id: req.params.id },
      data: {
        ...(normalizeText(body.companyName ?? body.company_name) ? { company_name: normalizeText(body.companyName ?? body.company_name)! } : {}),
        ...(normalizeText(body.contactPerson ?? body.contact_person) ? { contact_person: normalizeText(body.contactPerson ?? body.contact_person)! } : {}),
        ...(normalizeText(body.phone) ? { phone: normalizeText(body.phone)! } : {}),
        ...(body.email !== undefined ? { email: normalizeText(body.email) } : {}),
        ...(vehicleTypes !== undefined ? { vehicle_types: vehicleTypes } : {}),
        ...(toFloat(body.maxCapacity ?? body.max_capacity) !== null ? { max_capacity: toFloat(body.maxCapacity ?? body.max_capacity)! } : {}),
        ...(coverageAreas !== undefined ? { coverage_areas: coverageAreas } : {}),
        ...(rating !== null ? { rating: Math.min(5, Math.max(0, rating)) } : {}),
        ...(typeof body.isAvailable === 'boolean' ? { is_available: body.isAvailable } : {}),
        ...(body.notes === null ? { notes: null } : normalizeText(body.notes) ? { notes: normalizeText(body.notes) } : {}),
      },
      select: carrierSelect,
    });

    return ok(res, carrierDto(updated));
  }),
);

/* ─── PATCH /:id/availability – toggle ────────────────── */

carriersRouter.patch(
  '/:id/availability',
  validate(availabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.carrier.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, is_available: true },
    });
    if (!existing) return fail(res, 404, 'Carrier not found');

    const isAvailable = typeof body.isAvailable === 'boolean' ? body.isAvailable : !existing.is_available;

    const updated = await prisma.carrier.update({
      where: { id: req.params.id },
      data: { is_available: isAvailable },
      select: carrierSelect,
    });

    return ok(res, carrierDto(updated));
  }),
);

/* ─── DELETE /:id – admin only ────────────────────────── */

carriersRouter.delete(
  '/:id',
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const existing = await prisma.carrier.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Carrier not found');
    await prisma.carrier.delete({ where: { id: req.params.id } });
    return ok(res, { ok: true });
  }),
);
