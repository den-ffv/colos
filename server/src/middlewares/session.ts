import type { Request, Response, NextFunction } from 'express'
import { getSessionBySid, touchSessionIfNeeded } from '@/services/session.service'
import cookie from 'cookie'
import type { SessionData } from '@/types'

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';

declare global {
  namespace Express {
    interface Request {
      session?: { sid: string; data: SessionData }
      user?: { id: string; type: 'user' | 'customer'; language: 'ENG' | 'UA'; roles?: string[] }
    }
  }
};

export const sessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.headers.cookie;
    if (!raw) return next();

    const parsed = cookie.parse(raw);
    const sid = parsed[SESSION_COOKIE_NAME];
    if (!sid) return next();

    const sess = await getSessionBySid(sid);
    if (!sess) return next();

    touchSessionIfNeeded(sid).catch(() => {});

    const data = sess.data as SessionData;
    req.session = { sid, data };
    req.user = { id: data.userId, type: data.type, language: data.language, roles: data.roles };
    
    return next();
  } catch (error: any) {
    return next();
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.data) return res.status(401).json({ message: 'Unauthorized' });

  next();
};

export const requireRole = (roleName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.data || req.session.data.type !== 'user') return res.status(401).json({ message: 'Unauthorized' });
    const roles = req.session.data.roles || [];
    if (!roles.includes(roleName)) return res.status(403).json({ message: 'Forbidden' });

    next();
  };
};