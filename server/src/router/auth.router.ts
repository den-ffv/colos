import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { signInSchema, signUpSchema } from '../schemas';
import { fail, ok } from '../utils/http';

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

authRouter.post('/signin', validate(signInSchema), async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail((req.body as Record<string, unknown> | null)?.email);
    const password = ensureString((req.body as Record<string, unknown> | null)?.password);
    if (!email || !password) return fail(res, 400, 'email and password are required');

    const user = await prisma.user.findUnique({
      where: { email },
      include: { UserRoles: true },
    });
    if (!user) return fail(res, 401, 'Invalid email or password');
    if (!user.is_active) return fail(res, 403, 'User is inactive');

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) return fail(res, 401, 'Invalid email or password');

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

    return ok(res, {
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
      return fail(res, 500, 'Database connection/permissions error. Check DATABASE_URL and DB grants.', message);
    }
    return fail(res, 500, 'Internal server error', message);
  }
});

authRouter.post('/signup', validate(signUpSchema), async (req: Request, res: Response) => {
  try {
    const body = (req.body as Record<string, unknown> | null) ?? {};
    const email = normalizeEmail(body.email);
    const password = ensureString(body.password);
    const firstName = ensureString(body.first_name);
    const lastName = ensureString(body.last_name);
    const companyId = ensureString(body.company_id);
    const companyName = ensureString(body.company_name);

    if (!email || !password || !firstName || !lastName) {
      return fail(res, 400, 'email, password, first_name, last_name are required');
    }
    if (password.length < 6) return fail(res, 400, 'password must be at least 6 characters');
    if (!companyId && !companyName) return fail(res, 400, 'company_id or company_name is required');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(res, 409, 'Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        first_name: firstName,
        last_name: lastName,
        company: companyId ? { connect: { id: companyId } } : { create: { name: companyName as string } },
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

    return ok(
      res,
      {
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
      },
      201,
    );
  } catch (err) {
    const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
    const message =
      typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Unknown error';
    if (name === 'PrismaClientInitializationError') {
      return fail(res, 500, 'Database connection/permissions error. Check DATABASE_URL and DB grants.', message);
    }
    return fail(res, 500, 'Internal server error', message);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const body = (req.body as Record<string, unknown> | null) ?? {};
  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : null;
  if (!refreshToken) return fail(res, 401, 'Refresh token required');
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { UserRoles: true },
    });
    if (!user || !user.is_active) return fail(res, 401, 'User not found or inactive');
    const roles = user.UserRoles.map((r) => r.role);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      company_id: user.company_id,
      roles,
    });
    return ok(res, { accessToken });
  } catch {
    return fail(res, 401, 'Invalid or expired refresh token');
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('refresh_token', { path: '/api/auth' });
  return ok(res, { ok: true });
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    const user = await prisma.user.findFirst({
      where: { id: auth.sub, company_id: auth.company_id },
      include: { UserRoles: true, company: true },
    });
    if (!user) return fail(res, 404, 'User not found');

    return ok(res, {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      company: { id: user.company.id, name: user.company.name },
      roles: user.UserRoles.map((r) => r.role),
    });
  } catch (err) {
    const message =
      typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Unknown error';
    return fail(res, 500, 'Internal server error', message);
  }
});
