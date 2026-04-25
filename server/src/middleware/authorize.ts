import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { fail } from '../utils/http';
import type { AuthenticatedRequest } from './auth';

export function authorize(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const ok = auth.roles.some((r) => allowed.includes(r));
    if (!ok) return fail(res, 403, 'Forbidden');
    return next();
  };
}

