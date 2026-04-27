import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/* ── Мокуємо Prisma та bcrypt до імпорту app ─────────────── */

vi.mock('../utils/prisma', () => {
  const userModel = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };

  const orderModel = { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() };
  const vehicleModel = { count: vi.fn(), findMany: vi.fn() };
  const driverModel = { findMany: vi.fn(), count: vi.fn() };
  const clientModel = { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn() };
  const carrierModel = { findMany: vi.fn(), count: vi.fn() };
  const companyModel = { findFirst: vi.fn() };

  return {
    prisma: {
      user: userModel,
      users: userModel,
      company: companyModel,
      companies: companyModel,
      order: orderModel,
      orders: orderModel,
      vehicle: vehicleModel,
      vehicles: vehicleModel,
      driver: driverModel,
      drivers: driverModel,
      client: clientModel,
      clients: clientModel,
      carrier: carrierModel,
      carriers: carrierModel,
      notifications: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      notification_preferences: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    },
  };
});

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
import { updateCompanySchema } from '../schemas';

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
  user_roles: [{ role: 'ADMIN' as const }],
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
      user_roles: [{ role: 'ADMIN' }],
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

/* ═══════════════════════════════════════════════════════════
   N. Orders — GET /lookups
═══════════════════════════════════════════════════════════ */

describe('GET /api/orders/lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('повертає payRate та payType для водіїв', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });

    // Мокуємо відповіді lookups
    (prisma.client.findMany as MockedFn).mockResolvedValue([]);
    (prisma.driver.findMany as MockedFn).mockResolvedValue([
      {
        id: 'driver-001',
        first_name: 'Олег',
        last_name: 'Шевченко',
        pay_rate: 8.5,
        pay_type: 'PER_KM',
      },
    ]);
    (prisma.vehicle.findMany as MockedFn).mockResolvedValue([]);
    (prisma.carrier.findMany as MockedFn).mockResolvedValue([]);
    (prisma.order.findMany as MockedFn).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/orders/lookups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const driver = res.body.data.drivers[0];
    expect(driver.payRate).toBe(8.5);
    expect(driver.payType).toBe('PER_KM');
    expect(driver.name).toBe('Олег Шевченко');
  });
});

/* ═══════════════════════════════════════════════════════════
   7. Notifications
═══════════════════════════════════════════════════════════ */

describe('GET /api/notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає сповіщення та unreadCount', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (prisma.notifications.findMany as MockedFn).mockResolvedValue([
      {
        id: 'notif-001',
        type: 'ORDER_CREATED',
        title: 'Договір №123 створено',
        body: 'Київ → Харків',
        order_id: 'order-001',
        is_read: false,
        created_at: new Date('2026-04-26T10:00:00Z'),
      },
    ]);
    (prisma.notifications.count as MockedFn).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].type).toBe('ORDER_CREATED');
    expect(res.body.data.unreadCount).toBe(1);
  });
});

describe('PATCH /api/notifications/read', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('позначає всі сповіщення прочитаними', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (prisma.notifications.updateMany as MockedFn).mockResolvedValue({ count: 3 });

    const res = await request(app)
      .patch('/api/notifications/read')
      .set('Authorization', `Bearer ${token}`)
      .send({ all: true });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });
});

describe('GET /api/notifications/preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає збережені преференції', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id, email: mockUser.email,
      company_id: mockUser.company_id, roles: ['ADMIN'],
    });
    (prisma.notification_preferences.findMany as MockedFn).mockResolvedValue([
      { event_type: 'ORDER_CREATED', email_enabled: false, in_app_enabled: true },
    ]);

    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].eventType).toBe('ORDER_CREATED');
    expect(res.body.data[0].emailEnabled).toBe(false);
  });
});

describe('PATCH /api/notifications/preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 200 при валідному тілі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id, email: mockUser.email,
      company_id: mockUser.company_id, roles: ['ADMIN'],
    });
    (prisma.notification_preferences.upsert as MockedFn).mockResolvedValue({});

    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'ORDER_CREATED', emailEnabled: false, inAppEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('повертає 400 при невалідному eventType', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id, email: mockUser.email,
      company_id: mockUser.company_id, roles: ['ADMIN'],
    });

    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'INVALID_TYPE', emailEnabled: true, inAppEnabled: true });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/auth/password', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 400 при неправильному поточному паролі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (bcrypt.compare as MockedFn).mockResolvedValue(false);

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/incorrect/i);
  });

  it('повертає 200 при правильному поточному паролі', async () => {
    (prisma.user.findUnique as MockedFn).mockResolvedValue(mockUser);
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (bcrypt.compare as MockedFn).mockResolvedValue(true);
    (bcrypt.hash as MockedFn).mockResolvedValue('$2b$10$newhash');
    (prisma.user.update as MockedFn).mockResolvedValue({ ...mockUser, password: '$2b$10$newhash' });

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'correctpass', newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });
});

describe('updateCompanySchema', () => {
  it('accepts a partial valid payload', () => {
    const result = updateCompanySchema.safeParse({ name: 'ТОВ Нова', email: null });
    expect(result.success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    const result = updateCompanySchema.safeParse({ name: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid operationMode', () => {
    const result = updateCompanySchema.safeParse({ operationMode: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });
});
