import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '@/utils/prisma'
import { hashPassword, verifyPassword } from '@/auth/password'
import { createSession, destroySession } from '@/services/session.service'
import { requireAuth } from '@/middlewares/session'
import type { SessionData } from '@/types'

export const authRouter: Router = Router();

const RegisterDto = z.object({
  login: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  language: z.enum(['ENG', 'UA']).default('UA'),
})

authRouter.post('/register', async (request: Request, response: Response, next: NextFunction) => {
  try {
    const dto = RegisterDto.parse(request.body);

    const [byLogin, byEmail] = await Promise.all([
      prisma.user.findUnique({ where: { login: dto.login } }),
      prisma.user.findUnique({ where: { email: dto.email } }),
    ]);
    if (byLogin) return response.status(409).json({ message: 'Login already used' });
    if (byEmail) return response.status(409).json({ message: 'Email already used' });

    const roleUser = await prisma.role.findUnique({ where: { name: 'user' } });
    if (!roleUser) return response.status(500).json({ message: 'Base role "user" is missing. Seed roles first.' });

      const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login: dto.login,
          email: dto.email,
          password: await hashPassword(dto.password),
          name: dto.name,
          language: dto.language,
          is_active: true,
        },
      })
      await tx.userRole.create({
        data: { user_id: user.id, role_id: roleUser.id, is_active: true },
      });
      return user;
    });

    // підготуємо сесію
    const data: SessionData = {
      cookie: {
        originalMaxAge: undefined,
        expires: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        secure: false, httpOnly: true, path: '/', sameSite: 'lax',
      },
      type: 'user',
      userId: result.id,
      language: result.language,
      roles: ['user'],
    }

    await createSession(response, data)
    response.json({ id: result.id, type: 'user', language: result.language, roles: data.roles })
  } catch (e) { next(e) }
});

const LoginDto = z.object({
  loginOrEmail: z.string(),
  password: z.string(),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { loginOrEmail, password } = LoginDto.parse(req.body)
    const user = await prisma.user.findFirst({
      where: { OR: [{ login: loginOrEmail }, { email: loginOrEmail }], is_active: true },
    })
    if (!user || !(await verifyPassword(user.password, password))) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const roles = await prisma.userRole.findMany({
      where: { user_id: user.id, is_active: true, role: { is_active: true } },
      include: { role: true },
    })
    const roleNames = roles.map(r => r.role.name)
    if (!roleNames.includes('user')) roleNames.push('user') // safety net

    const data: SessionData = {
      cookie: {
        originalMaxAge: undefined,
        expires: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        secure: false, httpOnly: true, path: '/', sameSite: 'lax',
      },
      type: 'user',
      userId: user.id,
      language: user.language,
      roles: roleNames,
    }

    await createSession(res, data)
    res.json({ id: user.id, type: 'user', language: user.language, roles: roleNames })
  } catch (e) { next(e) }
})


authRouter.get('/me', requireAuth, async (req, res) => {
  const u = req.user!
  res.json({ id: u.id, type: 'user', language: u.language, roles: u.roles })
})


authRouter.get('/logout', async (req, res, next) => {
  try {
    const sid = (req.cookies?.sid as string) || ''
    if (sid) await destroySession(res, sid);
    else res.clearCookie('sid', { path: '/' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})