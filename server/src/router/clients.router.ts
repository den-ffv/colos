import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { createClientSchema, updateClientSchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parseLimit, parsePage, parseSortOrder } from '../utils/pagination';
import type { Prisma } from '@prisma/client';

export const clientsRouter = express.Router();

clientsRouter.use(requireAuth);

function getCompanyId(req: Request) {
  return (req as AuthenticatedRequest).auth.company_id;
}

function clientDto(c: {
  id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: string | null;
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
    address: c.address ?? undefined,
    notes: c.notes ?? undefined,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

function parseSort(sortBy: unknown) {
  const v = typeof sortBy === 'string' ? sortBy : '';
  const normalized = v.trim();
  if (normalized === 'companyName' || normalized === 'company_name') return 'company_name';
  if (normalized === 'contactPerson' || normalized === 'contact_person') return 'contact_person';
  if (normalized === 'createdAt' || normalized === 'created_at') return 'created_at';
  if (normalized === 'updatedAt' || normalized === 'updated_at') return 'updated_at';
  return 'company_name';
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s ? s : null;
}

clientsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const sortBy = parseSort(req.query.sortBy);
    const q = normalizeText(req.query.q);

    const where: Prisma.ClientWhereInput = { company_id: companyId };
    if (q) {
      where.OR = [
        { company_name: { contains: q, mode: 'insensitive' } },
        { contact_person: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.clients.count({ where }),
      prisma.clients.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.ClientOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          company_name: true,
          contact_person: true,
          phone: true,
          email: true,
          address: true,
          notes: true,
          created_at: true,
          updated_at: true,
        },
      }),
    ]);

    return okList(res, rows.map(clientDto), {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

clientsRouter.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const q = normalizeText(req.query.q);
    if (!q) return fail(res, 400, 'q is required');

    const rows = await prisma.clients.findMany({
      where: {
        company_id: companyId,
        OR: [
          { company_name: { contains: q, mode: 'insensitive' } },
          { contact_person: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { company_name: 'asc' },
      select: {
        id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        created_at: true,
        updated_at: true,
      },
    });

    return ok(res, rows.map(clientDto));
  }),
);

clientsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const id = req.params.id;
    const row = await prisma.clients.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        created_at: true,
        updated_at: true,
      },
    });
    if (!row) return fail(res, 404, 'Client not found');
    return ok(res, clientDto(row));
  }),
);

clientsRouter.post(
  '/',
  authorize(['ADMIN', 'LOGIST']),
  validate(createClientSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const companyName = normalizeText(body.companyName ?? body.company_name);
    const contactPerson = normalizeText(body.contactPerson ?? body.contact_person);
    const phone = normalizeText(body.phone);
    const email = normalizeText(body.email);
    const address = normalizeText(body.address);
    const notes = normalizeText(body.notes);

    if (!companyName || !contactPerson || !phone) {
      return fail(res, 400, 'companyName, contactPerson, phone are required');
    }

    const created = await prisma.clients.create({
      data: {
        company_name: companyName,
        contact_person: contactPerson,
        phone,
        email,
        address,
        notes,
        company_id: companyId,
      },
      select: {
        id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        created_at: true,
        updated_at: true,
      },
    });

    return ok(res, clientDto(created), 201);
  }),
);

clientsRouter.put(
  '/:id',
  authorize(['ADMIN', 'LOGIST']),
  validate(updateClientSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const id = req.params.id;
    const body = (req.body as Record<string, unknown> | null) ?? {};

    const companyName = normalizeText(body.companyName ?? body.company_name);
    const contactPerson = normalizeText(body.contactPerson ?? body.contact_person);
    const phone = normalizeText(body.phone);
    const email = normalizeText(body.email);
    const address = normalizeText(body.address);
    const notes = normalizeText(body.notes);

    const existing = await prisma.clients.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
    if (!existing) return fail(res, 404, 'Client not found');

    const updated = await prisma.clients.update({
      where: { id },
      data: {
        ...(companyName ? { company_name: companyName } : {}),
        ...(contactPerson ? { contact_person: contactPerson } : {}),
        ...(phone ? { phone } : {}),
        ...(body.email === null ? { email: null } : email ? { email } : {}),
        ...(body.address === null ? { address: null } : address ? { address } : {}),
        ...(body.notes === null ? { notes: null } : notes ? { notes } : {}),
      },
      select: {
        id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        created_at: true,
        updated_at: true,
      },
    });

    return ok(res, clientDto(updated));
  }),
);

clientsRouter.delete(
  '/:id',
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const id = req.params.id;
    const existing = await prisma.clients.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
    if (!existing) return fail(res, 404, 'Client not found');
    await prisma.clients.delete({ where: { id } });
    return ok(res, { ok: true });
  }),
);

clientsRouter.get(
  '/:id/orders',
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const id = req.params.id;
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);

    const client = await prisma.clients.findFirst({ where: { id, company_id: companyId }, select: { id: true } });
    if (!client) return fail(res, 404, 'Client not found');

    const where: Prisma.OrderWhereInput = { company_id: companyId, client_id: id };
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
          execution_type: true,
          pickup_address: true,
          delivery_address: true,
          pickup_date: true,
          delivery_date: true,
          total_cost: true,
          client_price: true,
          margin: true,
          margin_percent: true,
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
        executionType: o.execution_type,
        pickupAddress: o.pickup_address,
        deliveryAddress: o.delivery_address,
        pickupDate: o.pickup_date.toISOString(),
        deliveryDate: o.delivery_date?.toISOString(),
        totalCost: o.total_cost,
        clientPrice: o.client_price,
        margin: o.margin,
        marginPercent: o.margin_percent,
        createdAt: o.created_at.toISOString(),
      })),
      {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    );
  }),
);

