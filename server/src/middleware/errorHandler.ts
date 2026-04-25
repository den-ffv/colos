import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/http';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message =
    typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Internal server error';
  return fail(res, 500, 'Internal server error', message);
}

