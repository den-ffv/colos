import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createVehicleSchema, updateVehicleSchema, availabilitySchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parseLimit, parsePage, parseSortOrder } from '../utils/pagination';
import type { Prisma, FuelType, VehicleType } from '@prisma/client';

export const vehiclesRouter = express.Router();

vehiclesRouter.use(requireAuth);

/* ─── helpers ─────────────────────────────────────────── */

const VEHICLE_TYPES: VehicleType[] = ['TRUCK', 'VAN', 'CAR', 'REFRIGERATOR'];
const FUEL_TYPES: FuelType[] = ['DIESEL', 'PETROL_95', 'PETROL_92', 'GAS'];

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

function parseSort(sortBy: unknown) {
  const v = typeof sortBy === 'string' ? sortBy : '';
  const n = v.trim();
  if (n === 'plateNumber' || n === 'plate_number') return 'plate_number';
  if (n === 'type') return 'type';
  if (n === 'capacity') return 'capacity';
  if (n === 'isAvailable' || n === 'is_available') return 'is_available';
  if (n === 'createdAt' || n === 'created_at') return 'created_at';
  if (n === 'updatedAt' || n === 'updated_at') return 'updated_at';
  return 'plate_number';
}

function vehicleDto(v: {
  id: string;
  plate_number: string;
  type: VehicleType;
  capacity: number;
  fuel_type: FuelType | null;
  tank_capacity: number | null;
  fuel_consumption: number | null;
  cargo_volume: number | null;
  cost_per_km: number | null;
  max_range: number | null;
  is_available: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: v.id,
    plateNumber: v.plate_number,
    type: v.type,
    capacity: v.capacity,
    fuelType: v.fuel_type ?? undefined,
    tankCapacity: v.tank_capacity ?? undefined,
    fuelConsumption: v.fuel_consumption ?? undefined,
    cargoVolume: v.cargo_volume ?? undefined,
    costPerKm: v.cost_per_km ?? undefined,
    maxRange: v.max_range ?? undefined,
    isAvailable: v.is_available,
    notes: v.notes ?? undefined,
    createdAt: v.created_at.toISOString(),
    updatedAt: v.updated_at.toISOString(),
  };
}

const vehicleSelect = {
  id: true,
  plate_number: true,
  type: true,
  capacity: true,
  fuel_type: true,
  tank_capacity: true,
  fuel_consumption: true,
  cargo_volume: true,
  cost_per_km: true,
  max_range: true,
  is_available: true,
  notes: true,
  created_at: true,
  updated_at: true,
} as const;

/* ─── GET / – paginated list ──────────────────────────── */

vehiclesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const sortBy = parseSort(req.query.sortBy);
    const q = normalizeText(req.query.q);
    const available = req.query.available;
    const vehicleType = normalizeText(req.query.type);

    const where: Prisma.VehicleWhereInput = { company_id: companyId };

    if (available === 'true') where.is_available = true;
    else if (available === 'false') where.is_available = false;

    if (vehicleType && VEHICLE_TYPES.includes(vehicleType as VehicleType)) {
      where.type = vehicleType as VehicleType;
    }

    if (q) {
      where.OR = [{ plate_number: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }];
    }

    const [total, rows] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.VehicleOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
        select: vehicleSelect,
      }),
    ]);

    return okList(res, rows.map(vehicleDto), {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/* ─── GET /:id ────────────────────────────────────────── */

vehiclesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const row = await prisma.vehicle.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: vehicleSelect,
    });
    if (!row) return fail(res, 404, 'Vehicle not found');
    return ok(res, vehicleDto(row));
  }),
);

/* ─── GET /:id/orders – orders assigned to vehicle ────── */

vehiclesRouter.get(
  '/:id/orders',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 50);

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!vehicle) return fail(res, 404, 'Vehicle not found');

    const where: Prisma.OrderWhereInput = { company_id: companyId, vehicle_id: req.params.id };
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

vehiclesRouter.post(
  '/',
  authorize(['ADMIN', 'MANAGER']),
  validate(createVehicleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const plateNumber = normalizeText(body.plateNumber ?? body.plate_number);
    const type = normalizeText(body.type) as VehicleType | null;
    const capacity = toFloat(body.capacity);
    const fuelType = normalizeText(body.fuelType ?? body.fuel_type) as FuelType | null;
    const tankCapacity = toFloat(body.tankCapacity ?? body.tank_capacity);
    const fuelConsumption = toFloat(body.fuelConsumption ?? body.fuel_consumption);
    const cargoVolume = toFloat(body.cargoVolume ?? body.cargo_volume);
    const costPerKm = toFloat(body.costPerKm ?? body.cost_per_km);
    const maxRange = toFloat(body.maxRange ?? body.max_range);

    if (
      !plateNumber ||
      !type ||
      capacity === null ||
      !fuelType ||
      tankCapacity === null ||
      fuelConsumption === null ||
      cargoVolume === null ||
      costPerKm === null ||
      maxRange === null
    ) {
      return fail(res, 400, 'plateNumber, type, capacity, fuelType, tankCapacity, fuelConsumption, cargoVolume, costPerKm, maxRange are required');
    }
    if (!VEHICLE_TYPES.includes(type)) {
      return fail(res, 400, `type must be one of: ${VEHICLE_TYPES.join(', ')}`);
    }
    if (!FUEL_TYPES.includes(fuelType)) {
      return fail(res, 400, `fuelType must be one of: ${FUEL_TYPES.join(', ')}`);
    }

    const created = await prisma.vehicle.create({
      data: {
        plate_number: plateNumber,
        type,
        capacity,
        fuel_type: fuelType,
        tank_capacity: tankCapacity,
        fuel_consumption: fuelConsumption,
        cargo_volume: cargoVolume,
        cost_per_km: costPerKm,
        max_range: maxRange,
        is_available: body.isAvailable !== false,
        notes: normalizeText(body.notes),
        company_id: companyId,
      },
      select: vehicleSelect,
    });

    return ok(res, vehicleDto(created), 201);
  }),
);

/* ─── PUT /:id – update ──────────────────────────────── */

vehiclesRouter.put(
  '/:id',
  authorize(['ADMIN', 'MANAGER']),
  validate(updateVehicleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.vehicle.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Vehicle not found');

    const plateNumber = normalizeText(body.plateNumber ?? body.plate_number);
    const type = normalizeText(body.type) as VehicleType | null;
    const capacity = toFloat(body.capacity);
    const fuelType = normalizeText(body.fuelType ?? body.fuel_type) as FuelType | null;
    const tankCapacity = toFloat(body.tankCapacity ?? body.tank_capacity);
    const fuelConsumption = toFloat(body.fuelConsumption ?? body.fuel_consumption);
    const cargoVolume = toFloat(body.cargoVolume ?? body.cargo_volume);
    const costPerKm = toFloat(body.costPerKm ?? body.cost_per_km);
    const maxRange = toFloat(body.maxRange ?? body.max_range);
    const notes = normalizeText(body.notes);

    if (type && !VEHICLE_TYPES.includes(type)) {
      return fail(res, 400, `type must be one of: ${VEHICLE_TYPES.join(', ')}`);
    }
    if (fuelType && !FUEL_TYPES.includes(fuelType)) {
      return fail(res, 400, `fuelType must be one of: ${FUEL_TYPES.join(', ')}`);
    }

    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        ...(plateNumber ? { plate_number: plateNumber } : {}),
        ...(type ? { type } : {}),
        ...(capacity !== null ? { capacity } : {}),
        ...(fuelType ? { fuel_type: fuelType } : {}),
        ...(tankCapacity !== null ? { tank_capacity: tankCapacity } : {}),
        ...(fuelConsumption !== null ? { fuel_consumption: fuelConsumption } : {}),
        ...(cargoVolume !== null ? { cargo_volume: cargoVolume } : {}),
        ...(costPerKm !== null ? { cost_per_km: costPerKm } : {}),
        ...(maxRange !== null ? { max_range: maxRange } : {}),
        ...(typeof body.isAvailable === 'boolean' ? { is_available: body.isAvailable } : {}),
        ...(body.notes === null ? { notes: null } : notes ? { notes } : {}),
      },
      select: vehicleSelect,
    });

    return ok(res, vehicleDto(updated));
  }),
);

/* ─── PATCH /:id/availability – toggle ────────────────── */

vehiclesRouter.patch(
  '/:id/availability',
  authorize(['ADMIN', 'MANAGER']),
  validate(availabilitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const existing = await prisma.vehicle.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true, is_available: true },
    });
    if (!existing) return fail(res, 404, 'Vehicle not found');

    const isAvailable = typeof body.isAvailable === 'boolean' ? body.isAvailable : !existing.is_available;

    const updated = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { is_available: isAvailable },
      select: vehicleSelect,
    });

    return ok(res, vehicleDto(updated));
  }),
);

/* ─── DELETE /:id – admin only ────────────────────────── */

vehiclesRouter.delete(
  '/:id',
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const existing = await prisma.vehicle.findFirst({
      where: { id: req.params.id, company_id: companyId },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Vehicle not found');
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    return ok(res, { ok: true });
  }),
);
