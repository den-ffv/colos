import type { Response } from 'express';

export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = { success: false; message: string; details?: unknown };
export type ApiPagination = { page: number; limit: number; total: number; totalPages: number };

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data } satisfies ApiSuccess<T>);
}

export function okList<T>(res: Response, data: T[], pagination: ApiPagination) {
  return res.status(200).json({ success: true, data, pagination } as const);
}

export function fail(res: Response, status: number, message: string, details?: unknown) {
  const payload: ApiError = { success: false, message };
  if (details !== undefined && process.env.NODE_ENV !== 'production') payload.details = details;
  return res.status(status).json(payload);
}

