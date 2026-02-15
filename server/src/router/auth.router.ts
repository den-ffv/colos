import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { signAccessToken, signRefreshToken } from '../utils/jwt';

export const authRouter = express.Router();

type JsonError = { message: string };

function badRequest(res: Response, message: string) {
  return res.status(400).json({ message } satisfies JsonError);
}

function unauthorized(res: Response, message = 'Invalid email or password') {
  return res.status(401).json({ message } satisfies JsonError);
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  return email;
}

function ensureString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s ? s : null;
}

authRouter.post('/signin', async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail((req.body as Record<string, unknown> | null)?.email);
    const password = ensureString((req.body as Record<string, unknown> | null)?.password);
    if (!email || !password) return badRequest(res, 'email and password are required');

    const user = await prisma.user.findUnique({
      where: { email },
      include: { UserRoles: true },
    });
    if (!user) return unauthorized(res);
    if (!user.is_active) return res.status(403).json({ message: 'User is inactive' } satisfies JsonError);

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return unauthorized(res);

    const roles = user.UserRoles.map((r) => r.role);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      company_id: user.company_id,
      roles,
    });
    const refreshToken = signRefreshToken({ sub: user.id, jti: randomUUID() });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
    });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_id: user.company_id,
        roles,
      },
    });
  } catch (err) {
    const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
    const message =
      typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Unknown error';
    if (name === 'PrismaClientInitializationError') {
      return res.status(500).json({
        message: 'Database connection/permissions error. Check DATABASE_URL and DB grants.',
        details: process.env.NODE_ENV === 'production' ? undefined : message,
      });
    }
    return res.status(500).json({
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'production' ? undefined : message,
    });
  }
});

authRouter.post('/signup', async (req: Request, res: Response) => {
  try {
    const body = (req.body as Record<string, unknown> | null) ?? {};
    const email = normalizeEmail(body.email);
    const password = ensureString(body.password);
    const firstName = ensureString(body.first_name);
    const lastName = ensureString(body.last_name);
    // const companyId = ensureString(body.company_id);
    // const companyName = ensureString(body.company_name);

    if (!email || !password || !firstName || !lastName) {
      return badRequest(res, 'email, password, first_name, last_name are required');
    }
    if (password.length < 6) return badRequest(res, 'password must be at least 6 characters');
    // if (!companyId && !companyName) return badRequest(res, 'company_id or company_name is required');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already in use' } satisfies JsonError);

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        first_name: firstName,
        last_name: lastName,
        company_id: '1231312',
        UserRoles: { create: [{ role: 'ADMIN' }] },
      },
      include: { UserRoles: true },
    });

    const roles = created.UserRoles.map((r) => r.role);
    const accessToken = signAccessToken({
      sub: created.id,
      email: created.email,
      company_id: created.company_id,
      roles,
    });
    const refreshToken = signRefreshToken({ sub: created.id, jti: randomUUID() });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
    });

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: created.id,
        email: created.email,
        first_name: created.first_name,
        last_name: created.last_name,
        company_id: created.company_id,
        roles,
      },
    });
  } catch (err) {
    const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
    const message =
      typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Unknown error';
    if (name === 'PrismaClientInitializationError') {
      return res.status(500).json({
        message: 'Database connection/permissions error. Check DATABASE_URL and DB grants.',
        details: process.env.NODE_ENV === 'production' ? undefined : message,
      });
    }
    return res.status(500).json({
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'production' ? undefined : message,
    });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.json({ ok: true });
});
