import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parsePage, parseLimit } from '../utils/pagination';
import { createUserSchema, updateUserSchema } from '../schemas';
import { Role } from '@prisma/client';

export const usersRouter = express.Router();

usersRouter.use(requireAuth);
usersRouter.use(authorize(['ADMIN']));

/* ── DTO ────────────────────────────────────────────────────── */

function toUserDto(user: {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
  user_roles: { role: string }[];
  drivers: { id: string; first_name: string; last_name: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    isActive: user.is_active,
    roles: user.user_roles.map((r) => r.role),
    driverProfile: user.drivers
      ? {
          id: user.drivers.id,
          firstName: user.drivers.first_name,
          lastName: user.drivers.last_name,
        }
      : null,
    createdAt: user.created_at,
  };
}

const userInclude = {
  user_roles: { select: { role: true } },
  drivers: { select: { id: true, first_name: true, last_name: true } },
} as const;

/* ── GET / ──────────────────────────────────────────────────── */

usersRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const skip = (page - 1) * limit;

    const where = {
      company_id: auth.company_id,
      ...(search
        ? {
            OR: [
              { first_name: { contains: search, mode: 'insensitive' as const } },
              { last_name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await prisma.$transaction([
      prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: userInclude,
      }),
      prisma.users.count({ where }),
    ]);

    return okList(res, users.map(toUserDto), {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

/* ── POST / ─────────────────────────────────────────────────── */

usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { email, password, first_name, last_name, roles, driverId } = req.body as {
      email: string;
      password: string;
      first_name: string;
      last_name: string;
      roles: string[];
      driverId?: string;
    };

    const existing = await prisma.users.findFirst({
      where: { email, company_id: auth.company_id },
    });
    if (existing) return fail(res, 409, 'Email already in use');

    if (driverId) {
      const driver = await prisma.drivers.findFirst({
        where: { id: driverId, company_id: auth.company_id },
      });
      if (!driver) return fail(res, 400, 'Driver not found');
      if (driver.user_id) return fail(res, 400, 'Driver already linked to another account');
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: {
          email,
          password: hash,
          first_name,
          last_name,
          company_id: auth.company_id,
          user_roles: { create: roles.map((role) => ({ role: role as Role })) },
        },
        include: userInclude,
      });
      if (driverId && roles.includes('DRIVER')) {
        await tx.drivers.update({ where: { id: driverId }, data: { user_id: newUser.id } });
      }
      return newUser;
    });

    return ok(res, toUserDto(user as Parameters<typeof toUserDto>[0]), 201);
  }),
);

/* ── PUT /:id ───────────────────────────────────────────────── */

usersRouter.put(
  '/:id',
  validate(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { id } = req.params;
    const { email, password, first_name, last_name, roles, driverId } = req.body as {
      email?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
      roles?: string[];
      driverId?: string | null;
    };

    const existing = await prisma.users.findFirst({
      where: { id, company_id: auth.company_id },
      include: { drivers: { select: { id: true } } },
    });
    if (!existing) return fail(res, 404, 'User not found');

    if (email && email !== existing.email) {
      const conflict = await prisma.users.findFirst({
        where: { email, company_id: auth.company_id },
      });
      if (conflict) return fail(res, 409, 'Email already in use');
    }

    const updateData: Record<string, unknown> = {};
    if (first_name) updateData.first_name = first_name;
    if (last_name) updateData.last_name = last_name;
    if (email) updateData.email = email;
    if (password && password.length > 0) updateData.password = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.users.update({
        where: { id },
        data: {
          ...updateData,
          ...(roles
            ? { user_roles: { deleteMany: {}, create: roles.map((role) => ({ role: role as Role })) } }
            : {}),
        },
        include: userInclude,
      });

      if (driverId === null && existing.drivers) {
        await tx.drivers.update({
          where: { id: existing.drivers.id },
          data: { user_id: null },
        });
      } else if (typeof driverId === 'string' && driverId.length > 0) {
        const driver = await tx.drivers.findFirst({
          where: { id: driverId, company_id: auth.company_id },
        });
        if (!driver) throw new Error('Driver not found');
        await tx.drivers.update({ where: { id: driverId }, data: { user_id: id } });
      }

      return updated;
    });

    return ok(res, toUserDto(user as Parameters<typeof toUserDto>[0]));
  }),
);

/* ── PATCH /:id/status ──────────────────────────────────────── */

usersRouter.patch(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { id } = req.params;

    if (id === auth.sub) return fail(res, 403, 'Cannot change your own status');

    const user = await prisma.users.findFirst({
      where: { id, company_id: auth.company_id },
      include: { user_roles: { select: { role: true } } },
    });
    if (!user) return fail(res, 404, 'User not found');

    if (user.is_active) {
      const isAdmin = user.user_roles.some((r) => r.role === 'ADMIN');
      if (isAdmin) {
        const activeAdminCount = await prisma.user_roles.count({
          where: { role: 'ADMIN', user: { company_id: auth.company_id, is_active: true } },
        });
        if (activeAdminCount <= 1) return fail(res, 403, 'Cannot deactivate the last active admin');
      }
    }

    const updated = await prisma.users.update({
      where: { id },
      data: { is_active: !user.is_active },
      include: userInclude,
    });

    return ok(res, toUserDto(updated));
  }),
);
