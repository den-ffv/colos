import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createDriverSchema, updateDriverSchema, availabilitySchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parseLimit, parsePage, parseSortOrder } from '../utils/pagination';
import type { Prisma } from '@prisma/client';

export const driversRouter = express.Router();

driversRouter.use(requireAuth);

/* ─── helpers ─────────────────────────────────────────── */

function getCompanyId(req: Request) {
  return (req as AuthenticatedRequest).auth.company_id;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s || null;
}

function parseSort(sortBy: unknown) {
  const v = typeof sortBy === 'string' ? sortBy : '';
  const n = v.trim();
  if (n === 'firstName' || n === 'first_name') return 'first_name';
  if (n === 'lastName' || n === 'last_name') return 'last_name';
  if (n === 'phone') return 'phone';
  if (n === 'licenseNumber' || n === 'license_number') return 'license_number';
  if (n === 'isAvailable' || n === 'is_available') return 'is_available';
  if (n === 'createdAt' || n === 'created_at') return 'created_at';
  if (n === 'updatedAt' || n === 'updated_at') return 'updated_at';
  return 'last_name';
}

function driverDto(d: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  license_number: string;
  is_available: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: d.id,
    firstName: d.first_name,
    lastName: d.last_name,
    phone: d.phone,
    licenseNumber: d.license_number,
    isAvailable: d.is_available,
    notes: d.notes ?? undefined,
    createdAt: d.created_at.toISOString(),
    updatedAt: d.updated_at.toISOString(),
  };
}

const driverSelect = {
  id: true,
  first_name: true,
  last_name: true,
  phone: true,
  license_number: true,
  is_available: true,
  notes: true,
  created_at: true,
  updated_at: true,
} as const;

/* ─── GET / – paginated list ──────────────────────────── */

driversRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const sortBy = parseSort(req.query.sortBy);
    const q = normalizeText(req.query.q);
    const available = req.query.available;

    const where: Prisma.DriverWhereInput = { company_id: companyId };

    if (available === 'true') where.is_available = true;
    else if (available === 'false') where.is_available = false;

    if (q) {
      where.OR = [
        { first_name: { contains: q, mode: 'insensitive' } },
        { last_name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { license_number: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.driver.count({ where }),
      prisma.driver.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.DriverOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
        select: driverSelect,
      }),
    ]);

    return okList(res, rows.map(driverDto), {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/* ─── GET /:id ────────────────────────────────────────── */

driversRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const row = await prisma.driver.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: driverSelect,
    });
    if (!row) return fail(res, 404, 'Driver not found');
    return ok(res, driverDto(row));
  }),
);

/* ─── GET /:id/orders – orders assigned to driver ─────── */

driversRouter.get(
  '/:id/orders',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 50);

    const driver = await prisma.driver.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!driver) return fail(res, 404, 'Driver not found');

    const where: Prisma.OrderWhereInput = { company_id: companyId, driver_id: req.params.id };
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
        createdAt: o.created_at.toISOString(),
      })),
      { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    );
  }),
);

/* ─── POST / – create ─────────────────────────────────── */

driversRouter.post(
  '/',
  validate(createDriverSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const firstName = normalizeText(body.firstName ?? body.first_name);
    const lastName = normalizeText(body.lastName ?? body.last_name);
    const phone = normalizeText(body.phone);
    const licenseNumber = normalizeText(body.licenseNumber ?? body.license_number);

    if (!firstName || !lastName || !phone || !licenseNumber) {
      return fail(res, 400, 'firstName, lastName, phone, licenseNumber are required');
    }

    const created = await prisma.driver.create({
      data: {
        first_name: firstName,
        last_name: lastName,
        phone,
        license_number: licenseNumber,
        is_available: body.isAvailable !== false,
        notes: normalizeText(body.notes),
        company_id: companyId,
      },
      select: driverSelect,
    });

    return ok(res, driverDto(created), 201);
  }),
);

/* ─── PUT /:id – update ──────────────────────────────── */

driversRouter.put(
  '/:id',
  validate(updateDriverSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.driver.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Driver not found');

    const firstName = normalizeText(body.firstName ?? body.first_name);
    const lastName = normalizeText(body.lastName ?? body.last_name);
    const phone = normalizeText(body.phone);
    const licenseNumber = normalizeText(body.licenseNumber ?? body.license_number);
    const notes = normalizeText(body.notes);

    const updated = await prisma.driver.update({
      where: { id: req.params.id },
      data: {
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
        ...(phone ? { phone } : {}),
        ...(licenseNumber ? { license_number: licenseNumber } : {}),
        ...(typeof body.isAvailable === 'boolean' ? { is_available: body.isAvailable } : {}),
        ...(body.notes === null ? { notes: null } : notes ? { notes } : {}),
      },
      select: driverSelect,
    });

    return ok(res, driverDto(updated));
  }),
);

/* ─── PATCH /:id/availability – toggle ────────────────── */

driversRouter.patch(
  '/:id/availability',
  validate(availabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.driver.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, is_available: true },
    });
    if (!existing) return fail(res, 404, 'Driver not found');

    const isAvailable = typeof body.isAvailable === 'boolean' ? body.isAvailable : !existing.is_available;

    const updated = await prisma.driver.update({
      where: { id: req.params.id },
      data: { is_available: isAvailable },
      select: driverSelect,
    });

    return ok(res, driverDto(updated));
  }),
);

/* ─── DELETE /:id – admin only ────────────────────────── */

driversRouter.delete(
  '/:id',
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const existing = await prisma.driver.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Driver not found');
    await prisma.driver.delete({ where: { id: req.params.id } });
    return ok(res, { ok: true });
  }),
);
