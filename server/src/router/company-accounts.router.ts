import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok } from '../utils/http';

export const companyAccountsRouter = express.Router();

function getCompanyId(req: Request): string {
  return (req as AuthenticatedRequest).auth.company_id;
}

/* ─── GET /api/company-accounts ─────────────────────────── */

companyAccountsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const accounts = await prisma.company_accounts.findMany({
      where: { company_id: getCompanyId(req) },
      orderBy: [{ is_active: 'desc' }, { created_at: 'asc' }],
    });
    return ok(res, accounts);
  }),
);

/* ─── POST /api/company-accounts ────────────────────────── */

companyAccountsRouter.post(
  '/',
  requireAuth,
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, account } = req.body as { name?: string; account?: string };
    if (!name?.trim()) return fail(res, 422, 'Назва обов\'язкова');
    if (!account?.trim()) return fail(res, 422, 'Номер рахунку обов\'язковий');

    const created = await prisma.company_accounts.create({
      data: {
        id: crypto.randomUUID(),
        company_id: getCompanyId(req),
        name: name.trim(),
        account: account.trim(),
        is_active: true,
      },
    });
    return ok(res, created);
  }),
);

/* ─── PATCH /api/company-accounts/:id ───────────────────── */

companyAccountsRouter.patch(
  '/:id',
  requireAuth,
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const existing = await prisma.company_accounts.findFirst({
      where: { id: req.params.id, company_id: companyId },
    });
    if (!existing) return fail(res, 404, 'Рахунок не знайдено');

    const { name, account, is_active } = req.body as {
      name?: string;
      account?: string;
      is_active?: boolean;
    };

    const updated = await prisma.company_accounts.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(account !== undefined ? { account: account.trim() } : {}),
        ...(is_active !== undefined ? { is_active } : {}),
      },
    });
    return ok(res, updated);
  }),
);

/* ─── DELETE /api/company-accounts/:id ──────────────────── */

companyAccountsRouter.delete(
  '/:id',
  requireAuth,
  authorize(['ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const companyId = getCompanyId(req);
    const existing = await prisma.company_accounts.findFirst({
      where: { id: req.params.id, company_id: companyId },
    });
    if (!existing) return fail(res, 404, 'Рахунок не знайдено');

    await prisma.company_accounts.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  }),
);
