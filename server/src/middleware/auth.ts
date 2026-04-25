import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt';
import { fail } from '../utils/http';

export type AuthenticatedRequest = Request & { auth: AccessTokenPayload };

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return fail(res, 401, 'Missing access token');
  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).auth = payload;
    return next();
  } catch {
    return fail(res, 401, 'Invalid or expired access token');
  }
}
