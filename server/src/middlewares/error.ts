import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: 'Not found' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err?.status || 500;
  const message = err?.message || 'Internal server error';
  res.status(status).json({ message });
}
