import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { updateCompanySchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok } from '../utils/http';

export const companiesRouter = express.Router();

companiesRouter.use(requireAuth);

function getAuth(req: Request) {
  return (req as AuthenticatedRequest).auth;
}

function companyDto(c: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  has_own_fleet: boolean;
  operation_mode: string;
  uses_broker_services: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    hasOwnFleet: c.has_own_fleet,
    operationMode: c.operation_mode,
    usesBrokerServices: c.uses_broker_services,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

const companySelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  has_own_fleet: true,
  operation_mode: true,
  uses_broker_services: true,
  created_at: true,
  updated_at: true,
} as const;

companiesRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const { company_id } = getAuth(req);
    const company = await prisma.companies.findFirst({
      where: { id: company_id },
      select: companySelect,
    });
    if (!company) return fail(res, 404, 'Company not found');
    return ok(res, companyDto(company));
  }),
);

companiesRouter.put(
  '/me',
  authorize(['ADMIN']),
  validate(updateCompanySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { company_id } = getAuth(req);
    const body = (req.body as Record<string, unknown>) ?? {};

    const updated = await prisma.companies.update({
      where: { id: company_id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim()
          ? { name: body.name.trim() }
          : {}),
        ...(body.email === null
          ? { email: null }
          : typeof body.email === 'string' && body.email.trim()
            ? { email: body.email.trim() }
            : {}),
        ...(body.phone === null
          ? { phone: null }
          : typeof body.phone === 'string' && body.phone.trim()
            ? { phone: body.phone.trim() }
            : {}),
        ...(body.address === null
          ? { address: null }
          : typeof body.address === 'string' && body.address.trim()
            ? { address: body.address.trim() }
            : {}),
        ...(typeof body.hasOwnFleet === 'boolean'
          ? { has_own_fleet: body.hasOwnFleet }
          : {}),
        ...(typeof body.operationMode === 'string'
          ? { operation_mode: body.operationMode as 'OWN_FLEET' | 'BROKER' | 'HYBRID' }
          : {}),
        ...(typeof body.usesBrokerServices === 'boolean'
          ? { uses_broker_services: body.usesBrokerServices }
          : {}),
        updated_at: new Date(),
      },
      select: companySelect,
    });

    return ok(res, companyDto(updated));
  }),
);
