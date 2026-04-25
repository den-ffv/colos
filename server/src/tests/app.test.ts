import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/* ── Мокуємо Prisma та bcrypt до імпорту app ─────────────── */

vi.mock('../utils/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    company: {
      findFirst: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    vehicle: {
      count: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    carrier: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../utils/redis', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
  compare: vi.fn(),
  hash: vi.fn(),
}));

import { app } from '../app';
import { prisma } from '../utils/prisma';
import { signAccessToken } from '../utils/jwt';
import bcrypt from 'bcryptjs';

/* ── Типи для зручності ──────────────────────────────────── */

type MockedFn = ReturnType<typeof vi.fn>;

const mockUser = {
  id: 'user-uuid-001',
  email: 'test@colos.ua',
  password: '$2b$10$hashedpassword',
  first_name: 'Іван',
  last_name: 'Тест',
  company_id: 'company-uuid-001',
  is_active: true,
  UserRoles: [{ role: 'ADMIN' as const }],
};

/* ═══════════════════════════════════════════════════════════
   1. Health check
═══════════════════════════════════════════════════════════ */

describe('GET /api/health', () => {
  it('повертає 200 зі статусом OK', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body).toHaveProperty('timestamp');
  });
});

/* ═══════════════════════════════════════════════════════════
   2. Auth — Sign Up
═══════════════════════════════════════════════════════════ */

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('реєструє нового користувача і повертає 201 з токенами', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(null); // email вільний
    (bcrypt.hash as MockedFn).mockResolvedValue('$2b$10$hashed');
    (prisma.user.create as MockedFn).mockResolvedValue({
      ...mockUser,
      UserRoles: [{ role: 'ADMIN' }],
    });

    const res = await request(app).post('/api/auth/signup').send({
      email: 'newuser@colos.ua',
      password: 'password123',
      first_name: 'Ольга',
      last_name: 'Новак',
      company_name: 'ТОВ Нова Логістика',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.email).toBe('test@colos.ua'); // зі створеного мок-користувача
  });

  it('повертає 409 при дублюванні email', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser); // email зайнятий

    const res = await request(app).post('/api/auth/signup').send({
      email: 'test@colos.ua',
      password: 'password123',
      first_name: 'Тест',
      last_name: 'Юзер',
      company_name: 'Компанія',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already in use/i);
  });

  it('повертає 400 при відсутніх обовʼязкових полях (Zod)', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'not-a-valid-email',
      password: '',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════
   3. Auth — Sign In
═══════════════════════════════════════════════════════════ */

describe('POST /api/auth/signin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('повертає 200 з токенами при правильному паролі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    (bcrypt.compare as MockedFn).mockResolvedValue(true);

    const res = await request(app).post('/api/auth/signin').send({
      email: 'test@colos.ua',
      password: 'correctpassword',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data.user.roles).toContain('ADMIN');
  });

  it('повертає 401 при неправильному паролі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    (bcrypt.compare as MockedFn).mockResolvedValue(false);

    const res = await request(app).post('/api/auth/signin').send({
      email: 'test@colos.ua',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('повертає 401 якщо email не існує', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(null);

    const res = await request(app).post('/api/auth/signin').send({
      email: 'nobody@colos.ua',
      password: 'somepassword',
    });

    expect(res.status).toBe(401);
  });
});

/* ═══════════════════════════════════════════════════════════
   4. Захищені маршрути — перевірка автентифікації
═══════════════════════════════════════════════════════════ */

describe('Захищені маршрути без токена', () => {
  it('GET /api/clients → 401', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  it('GET /api/dashboard/summary → 401', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });

  it('GET /api/dashboard/stats → 401', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
  });
});

/* ═══════════════════════════════════════════════════════════
   5. Dashboard — з автентифікацією
═══════════════════════════════════════════════════════════ */

describe('GET /api/dashboard/summary (з токеном)', () => {
  it('повертає 200 з KPI-даними', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });

    (prisma.order.count as MockedFn).mockResolvedValue(5);
    (prisma.vehicle.count as MockedFn).mockResolvedValue(10);
    (prisma.order.findMany as MockedFn).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/dashboard/summary?period=today')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('kpi');
    expect(res.body.data).toHaveProperty('kanban');
    expect(res.body.data).toHaveProperty('sla');
  });
});

/* ═══════════════════════════════════════════════════════════
   6. Zod-валідація на рівні маршрутів
═══════════════════════════════════════════════════════════ */

describe('Zod-валідація при створенні клієнта', () => {
  it('POST /api/clients з невалідним тілом → 400', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });

    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyName: 'A', phone: 'not-a-phone' }); // companyName занадто короткий, phone невалідний

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
