# User Management Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ADMIN-only "Співробітники" page where admins can list, create, edit, and deactivate employee accounts with multi-role assignment and optional driver profile linking.

**Architecture:** New `users.router.ts` on the backend with 4 endpoints (list, create, update, toggle status), all ADMIN-only and company-scoped via JWT. Frontend adds `features/users/` with a data hook, modal form, and table page wired into the existing CrmShell hash navigation.

**Tech Stack:** Express · Prisma · Zod · bcryptjs · asyncHandler · Vitest (mocked) · React 19 · TypeScript

---

## File Map

### Create
- `server/src/router/users.router.ts` — 4 endpoints: GET `/`, POST `/`, PUT `/:id`, PATCH `/:id/status`
- `server/src/tests/users.test.ts` — unit tests with mocked Prisma
- `client/src/features/users/useUsers.ts` — data fetching and mutation hook
- `client/src/features/users/UserModal.tsx` — create/edit modal form
- `client/src/features/users/UsersPage.tsx` — table page component
- `client/src/features/users/users.css` — page styles

### Modify
- `server/src/schemas/index.ts` — append `createUserSchema`, `updateUserSchema`
- `server/src/router/api.router.ts` — mount `usersRouter` at `/users`
- `client/src/features/crm/CrmShell.tsx` — add `'users'` to CrmView, nav item, render case

---

## Task 1: Write failing tests for /api/users

**Files:**
- Create: `server/src/tests/users.test.ts`

- [ ] **Step 1: Create the test file**

Create `server/src/tests/users.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../utils/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    driver: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    userRole: {
      count: vi.fn(),
    },
  },
}));

vi.mock('../utils/redis', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../app';
import { prisma } from '../utils/prisma';
import { signAccessToken } from '../utils/jwt';

type MockedFn = ReturnType<typeof vi.fn>;

const COMPANY_ID = 'company-uuid-001';
const ADMIN_TOKEN = signAccessToken({
  sub: 'admin-uuid-001',
  email: 'admin@colos.ua',
  company_id: COMPANY_ID,
  roles: ['ADMIN'],
});

const mockUser = {
  id: 'user-uuid-002',
  email: 'logist@colos.ua',
  first_name: 'Логіст',
  last_name: 'Тест',
  is_active: true,
  company_id: COMPANY_ID,
  created_at: new Date('2026-01-01'),
  UserRoles: [{ role: 'LOGIST' }],
  DriverProfile: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── GET /api/users ───────────────────────────────────────── */

describe('GET /api/users', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns 200 with admin token and paginated list', async () => {
    (prisma.user.findMany as MockedFn).mockResolvedValue([mockUser]);
    (prisma.user.count as MockedFn).mockResolvedValue(1);
    (prisma.$transaction as MockedFn).mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toHaveProperty('total');
  });
});

/* ── POST /api/users ──────────────────────────────────────── */

describe('POST /api/users', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/users').send({});
    expect(res.status).toBe(401);
  });

  it('returns 422 with invalid body', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  it('returns 409 when email already exists in company', async () => {
    (prisma.user.findFirst as MockedFn).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'logist@colos.ua',
        password: 'password123',
        first_name: 'A',
        last_name: 'B',
        roles: ['LOGIST'],
      });
    expect(res.status).toBe(409);
  });

  it('creates a user and returns 201', async () => {
    (prisma.user.findFirst as MockedFn).mockResolvedValue(null);
    (prisma.$transaction as MockedFn).mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb(prisma),
    );
    (prisma.user.create as MockedFn).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'new@colos.ua',
        password: 'password123',
        first_name: 'Новий',
        last_name: 'Юзер',
        roles: ['LOGIST'],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
  });
});

/* ── PATCH /api/users/:id/status ─────────────────────────── */

describe('PATCH /api/users/:id/status', () => {
  it('returns 403 when trying to deactivate self', async () => {
    const selfToken = signAccessToken({
      sub: 'self-uuid',
      email: 'self@colos.ua',
      company_id: COMPANY_ID,
      roles: ['ADMIN'],
    });

    const res = await request(app)
      .patch('/api/users/self-uuid/status')
      .set('Authorization', `Bearer ${selfToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    (prisma.user.findFirst as MockedFn).mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/users/nonexistent-uuid/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('toggles is_active and returns updated user', async () => {
    (prisma.user.findFirst as MockedFn).mockResolvedValue({
      ...mockUser,
      id: 'user-uuid-002',
      is_active: true,
      UserRoles: [{ role: 'LOGIST' }],
    });
    (prisma.user.update as MockedFn).mockResolvedValue({ ...mockUser, is_active: false });

    const res = await request(app)
      .patch('/api/users/user-uuid-002/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (route does not exist yet)**

```bash
cd server && npx vitest run src/tests/users.test.ts 2>&1 | tail -20
```

Expected: Tests fail — most return 404 because `/api/users` is not mounted.

- [ ] **Step 3: Commit failing tests**

```bash
git add server/src/tests/users.test.ts
git commit -m "test: add failing tests for /api/users"
```

---

## Task 2: Add Zod schemas

**Files:**
- Modify: `server/src/schemas/index.ts`

- [ ] **Step 1: Append schemas to end of server/src/schemas/index.ts**

```typescript
// ── User Management ──────────────────────────────────────────────────────────

const userRoleEnum = z.enum([
  'ADMIN',
  'MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'LOGIST',
  'DRIVER',
]);

export const createUserSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  roles: z.array(userRoleEnum).min(1, 'At least one role is required'),
  driverId: z.string().uuid('Invalid driver ID').optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email('Invalid email').optional(),
  password: z
    .union([z.string().min(6, 'Password must be at least 6 characters'), z.literal('')])
    .optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  roles: z.array(userRoleEnum).min(1, 'At least one role is required').optional(),
  driverId: z.string().uuid().nullable().optional(),
});
```

- [ ] **Step 2: Commit**

```bash
git add server/src/schemas/index.ts
git commit -m "feat: add createUserSchema and updateUserSchema"
```

---

## Task 3: Create users router

**Files:**
- Create: `server/src/router/users.router.ts`

- [ ] **Step 1: Create server/src/router/users.router.ts**

```typescript
import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok, okList } from '../utils/http';
import { parsePage, parseLimit } from '../utils/pagination';
import { createUserSchema, updateUserSchema } from '../schemas';

export const usersRouter = express.Router();

usersRouter.use(requireAuth);
usersRouter.use(authorize(['ADMIN']));

/* ── DTO ────────────────────────────────────────────────────── */

function toUserDto(user: {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
  UserRoles: { role: string }[];
  DriverProfile: { id: string; first_name: string; last_name: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    isActive: user.is_active,
    roles: user.UserRoles.map((r) => r.role),
    driverProfile: user.DriverProfile
      ? {
          id: user.DriverProfile.id,
          firstName: user.DriverProfile.first_name,
          lastName: user.DriverProfile.last_name,
        }
      : null,
    createdAt: user.created_at,
  };
}

const userInclude = {
  UserRoles: { select: { role: true } },
  DriverProfile: { select: { id: true, first_name: true, last_name: true } },
} as const;

/* ── GET / ──────────────────────────────────────────────────── */

usersRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const skip = (page - 1) * limit;

    const where = {
      company_id: auth.company_id,
      ...(search
        ? {
            OR: [
              { first_name: { contains: search, mode: 'insensitive' as const } },
              { last_name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: userInclude }),
      prisma.user.count({ where }),
    ]);

    return okList(res, users.map(toUserDto), {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

/* ── POST / ─────────────────────────────────────────────────── */

usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { email, password, first_name, last_name, roles, driverId } = req.body as {
      email: string;
      password: string;
      first_name: string;
      last_name: string;
      roles: string[];
      driverId?: string;
    };

    const existing = await prisma.user.findFirst({ where: { email, company_id: auth.company_id } });
    if (existing) return fail(res, 409, 'Email already in use');

    if (driverId) {
      const driver = await prisma.driver.findFirst({ where: { id: driverId, company_id: auth.company_id } });
      if (!driver) return fail(res, 400, 'Driver not found');
      if (driver.user_id) return fail(res, 400, 'Driver already linked to another account');
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          password: hash,
          first_name,
          last_name,
          company_id: auth.company_id,
          UserRoles: { create: roles.map((role) => ({ role })) },
        },
        include: userInclude,
      });
      if (driverId && roles.includes('DRIVER')) {
        await tx.driver.update({ where: { id: driverId }, data: { user_id: newUser.id } });
      }
      return newUser;
    });

    return ok(res, toUserDto(user), 201);
  }),
);

/* ── PUT /:id ───────────────────────────────────────────────── */

usersRouter.put(
  '/:id',
  validate(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { id } = req.params;
    const { email, password, first_name, last_name, roles, driverId } = req.body as {
      email?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
      roles?: string[];
      driverId?: string | null;
    };

    const existing = await prisma.user.findFirst({
      where: { id, company_id: auth.company_id },
      include: { DriverProfile: { select: { id: true } } },
    });
    if (!existing) return fail(res, 404, 'User not found');

    if (email && email !== existing.email) {
      const conflict = await prisma.user.findFirst({ where: { email, company_id: auth.company_id } });
      if (conflict) return fail(res, 409, 'Email already in use');
    }

    const updateData: Record<string, unknown> = {};
    if (first_name) updateData.first_name = first_name;
    if (last_name) updateData.last_name = last_name;
    if (email) updateData.email = email;
    if (password && password.length > 0) updateData.password = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...updateData,
          ...(roles
            ? { UserRoles: { deleteMany: {}, create: roles.map((role) => ({ role })) } }
            : {}),
        },
        include: userInclude,
      });

      if (driverId === null && existing.DriverProfile) {
        await tx.driver.update({ where: { id: existing.DriverProfile.id }, data: { user_id: null } });
      } else if (typeof driverId === 'string' && driverId.length > 0) {
        const driver = await tx.driver.findFirst({ where: { id: driverId, company_id: auth.company_id } });
        if (!driver) throw new Error('Driver not found');
        await tx.driver.update({ where: { id: driverId }, data: { user_id: id } });
      }

      return updated;
    });

    return ok(res, toUserDto(user));
  }),
);

/* ── PATCH /:id/status ──────────────────────────────────────── */

usersRouter.patch(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = (req as AuthenticatedRequest).auth;
    const { id } = req.params;

    if (id === auth.sub) return fail(res, 403, 'Cannot change your own status');

    const user = await prisma.user.findFirst({
      where: { id, company_id: auth.company_id },
      include: { UserRoles: { select: { role: true } } },
    });
    if (!user) return fail(res, 404, 'User not found');

    if (user.is_active) {
      const isAdmin = user.UserRoles.some((r) => r.role === 'ADMIN');
      if (isAdmin) {
        const activeAdminCount = await prisma.userRole.count({
          where: { role: 'ADMIN', user: { company_id: auth.company_id, is_active: true } },
        });
        if (activeAdminCount <= 1) return fail(res, 403, 'Cannot deactivate the last active admin');
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { is_active: !user.is_active },
      include: userInclude,
    });

    return ok(res, toUserDto(updated));
  }),
);
```

- [ ] **Step 2: Commit**

```bash
git add server/src/router/users.router.ts
git commit -m "feat: add users router (list, create, update, toggle status)"
```

---

## Task 4: Mount users router

**Files:**
- Modify: `server/src/router/api.router.ts`

- [ ] **Step 1: Open api.router.ts and add the import**

Find the block of router imports (lines with `import { ... } from './*.router'`). Add:

```typescript
import { usersRouter } from './users.router';
```

- [ ] **Step 2: Mount the router**

Find the block of `apiRouter.use(...)` calls. Add after the existing ones:

```typescript
apiRouter.use('/users', usersRouter);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/router/api.router.ts
git commit -m "feat: mount usersRouter at /api/users"
```

---

## Task 5: Run tests and verify they pass

- [ ] **Step 1: Run users tests**

```bash
cd server && npx vitest run src/tests/users.test.ts 2>&1
```

Expected: All tests pass. If any fail, read the error and fix the router before continuing.

Common issues:
- `$transaction` mock: for GET route it receives `[Promise, Promise]`, use `Promise.all(ops)`. For POST/PUT it receives a callback function `(tx) => ...`, use `cb(prisma)`.
- The test mock for GET already handles both cases with the `typeof` check. If not, update the mock setup.

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
cd server && npx vitest run 2>&1 | tail -20
```

Expected: All existing tests still pass.

- [ ] **Step 3: Commit any fixes made**

```bash
git add -p
git commit -m "fix: resolve test issues in users tests"
```

---

## Task 6: Create useUsers hook

**Files:**
- Create: `client/src/features/users/useUsers.ts`

- [ ] **Step 1: Create client/src/features/users/useUsers.ts**

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { AuthTokens } from '../auth/auth.storage';

export type UserRole = 'ADMIN' | 'MANAGER' | 'DISPATCHER' | 'ACCOUNTANT' | 'LOGIST' | 'DRIVER';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: UserRole[];
  driverProfile: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  roles: UserRole[];
  driverId?: string;
}

export interface UpdateUserPayload {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  roles?: UserRole[];
  driverId?: string | null;
}

function authHeaders(tokens: AuthTokens): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokens.accessToken}`,
  };
}

export function useUsers(tokens: AuthTokens, onUnauthorized: () => void) {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (search = '', page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20', search });
        const res = await fetch(`/api/users?${params}`, { headers: authHeaders(tokens) });
        if (res.status === 401) { onUnauthorized(); return; }
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Failed to load users');
        setUsers(json.data);
        setTotal(json.pagination.total);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [tokens, onUnauthorized],
  );

  const createUser = useCallback(
    async (payload: CreateUserPayload): Promise<UserDto> => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { onUnauthorized(); throw new Error('Unauthorized'); }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create user');
      return json.data as UserDto;
    },
    [tokens, onUnauthorized],
  );

  const updateUser = useCallback(
    async (id: string, payload: UpdateUserPayload): Promise<UserDto> => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: authHeaders(tokens),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { onUnauthorized(); throw new Error('Unauthorized'); }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to update user');
      return json.data as UserDto;
    },
    [tokens, onUnauthorized],
  );

  const toggleStatus = useCallback(
    async (id: string): Promise<UserDto> => {
      const res = await fetch(`/api/users/${id}/status`, {
        method: 'PATCH',
        headers: authHeaders(tokens),
      });
      if (res.status === 401) { onUnauthorized(); throw new Error('Unauthorized'); }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to toggle status');
      return json.data as UserDto;
    },
    [tokens, onUnauthorized],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, total, loading, error, fetchUsers, createUser, updateUser, toggleStatus };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/features/users/useUsers.ts
git commit -m "feat: add useUsers hook"
```

---

## Task 7: Create UserModal component

**Files:**
- Create: `client/src/features/users/UserModal.tsx`

- [ ] **Step 1: Verify Modal and Button APIs**

Run:
```bash
grep -n "export\|props\|interface\|variant\|size" client/src/ui/Modal.tsx client/src/ui/Button.tsx | head -20
```

Confirm: `Modal` accepts `open`, `title`, `onClose`, `size?: 'default' | 'lg'`. `Button` accepts `variant: 'primary' | 'secondary' | 'ghost'`, `size?: 'sm' | 'md'`, `type`, `disabled`.

- [ ] **Step 2: Create client/src/features/users/UserModal.tsx**

```tsx
import { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { AuthTokens } from '../auth/auth.storage';
import type { UserDto, UserRole, CreateUserPayload, UpdateUserPayload } from './useUsers';

const ALL_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'LOGIST', 'DRIVER'];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Адмін',
  MANAGER: 'Менеджер',
  DISPATCHER: 'Диспетчер',
  ACCOUNTANT: 'Бухгалтер',
  LOGIST: 'Логіст',
  DRIVER: 'Водій',
};

interface DriverOption {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
}

interface UserModalProps {
  open: boolean;
  user: UserDto | null;
  tokens: AuthTokens;
  onClose: () => void;
  onSubmit: (payload: CreateUserPayload | UpdateUserPayload) => Promise<void>;
}

export function UserModal({ open, user, tokens, onClose, onSubmit }: UserModalProps) {
  const isEdit = user !== null;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [driverId, setDriverId] = useState('');
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
      setPassword('');
      setRoles(user.roles);
      setDriverId(user.driverProfile?.id ?? '');
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRoles([]);
      setDriverId('');
    }
    setError(null);
  }, [open, user]);

  useEffect(() => {
    if (!open || !roles.includes('DRIVER')) {
      setDrivers([]);
      return;
    }
    fetch('/api/drivers?limit=500', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((r) => r.json())
      .then((json) => {
        const all: DriverOption[] = json.data ?? [];
        // Include drivers with no account, plus the currently linked one
        setDrivers(all.filter((d) => !d.userId || d.id === user?.driverProfile?.id));
      })
      .catch(() => setDrivers([]));
  }, [open, roles, user, tokens.accessToken]);

  const toggleRole = (role: UserRole) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
    if (role === 'DRIVER') setDriverId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roles.length === 0) {
      setError('Оберіть хоча б одну роль');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        const payload: UpdateUserPayload = {
          first_name: firstName,
          last_name: lastName,
          email,
          roles,
          driverId: roles.includes('DRIVER') ? (driverId || null) : undefined,
        };
        if (password) payload.password = password;
        await onSubmit(payload);
      } else {
        const payload: CreateUserPayload = {
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          roles,
          ...(roles.includes('DRIVER') && driverId ? { driverId } : {}),
        };
        await onSubmit(payload);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка збереження');
    } finally {
      setSubmitting(false);
    }
  };

  const showDriverWarning = isEdit && !!user?.driverProfile && !roles.includes('DRIVER');

  return (
    <Modal
      open={open}
      title={isEdit ? 'Редагувати співробітника' : 'Новий співробітник'}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div className="ui-alert ui-alert--error">{error}</div>}

        {showDriverWarning && (
          <div className="ui-alert ui-alert--warning">
            Роль DRIVER знято, але водій {user!.driverProfile!.firstName}{' '}
            {user!.driverProfile!.lastName} залишається прив&apos;язаним.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="ui-field">
            <span className="ui-label">Ім&apos;я</span>
            <input
              className="ui-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label className="ui-field">
            <span className="ui-label">Прізвище</span>
            <input
              className="ui-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="ui-field">
          <span className="ui-label">Email</span>
          <input
            className="ui-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-label">
            Пароль{isEdit ? ' (залишити порожнім щоб не змінювати)' : ''}
          </span>
          <input
            className="ui-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            minLength={6}
          />
        </label>

        <div className="ui-field">
          <span className="ui-label">Ролі</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {ALL_ROLES.map((role) => (
              <label
                key={role}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </div>

        {roles.includes('DRIVER') && (
          <label className="ui-field">
            <span className="ui-label">Прив&apos;язати до водія</span>
            <select
              className="ui-input"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">— не прив&apos;язувати —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Скасувати
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Збереження...' : isEdit ? 'Зберегти' : 'Створити'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/features/users/UserModal.tsx
git commit -m "feat: add UserModal component"
```

---

## Task 8: Create UsersPage and CSS

**Files:**
- Create: `client/src/features/users/UsersPage.tsx`
- Create: `client/src/features/users/users.css`

- [ ] **Step 1: Create client/src/features/users/users.css**

```css
.users-page {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.users-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.users-page__title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.users-page__search {
  display: flex;
  gap: 8px;
  max-width: 480px;
}

.users-page__search .ui-input {
  flex: 1;
}

.users-page__loading {
  color: var(--text-muted);
  padding: 24px 0;
  text-align: center;
}

.users-page__footer {
  padding: 12px 16px;
  color: var(--text-muted);
  font-size: 0.875rem;
  border-top: 1px solid var(--border);
}

.users-page__status--active {
  color: var(--color-success, #16a34a);
  font-weight: 500;
}

.users-page__status--inactive {
  color: var(--text-muted);
}
```

- [ ] **Step 2: Create client/src/features/users/UsersPage.tsx**

```tsx
import { useState } from 'react';
import { Button } from '../../ui/Button';
import type { AuthTokens } from '../auth/auth.storage';
import { useUsers, type UserDto, type CreateUserPayload, type UpdateUserPayload } from './useUsers';
import { UserModal } from './UserModal';
import './users.css';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Адмін',
  MANAGER: 'Менеджер',
  DISPATCHER: 'Диспетчер',
  ACCOUNTANT: 'Бухгалтер',
  LOGIST: 'Логіст',
  DRIVER: 'Водій',
};

export function UsersPage({ tokens, onUnauthorized }: { tokens: AuthTokens; onUnauthorized: () => void }) {
  const { users, total, loading, error, fetchUsers, createUser, updateUser, toggleStatus } =
    useUsers(tokens, onUnauthorized);

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreate = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEdit = (user: UserDto) => {
    setEditingUser(user);
    setModalOpen(true);
  };

  const handleSubmit = async (payload: CreateUserPayload | UpdateUserPayload) => {
    if (editingUser) {
      await updateUser(editingUser.id, payload as UpdateUserPayload);
    } else {
      await createUser(payload as CreateUserPayload);
    }
    await fetchUsers(search);
  };

  const handleToggleStatus = async (id: string) => {
    setActionError(null);
    try {
      await toggleStatus(id);
      await fetchUsers(search);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Помилка');
    }
    setConfirmId(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(search);
  };

  const confirmTarget = users.find((u) => u.id === confirmId);

  return (
    <div className="users-page">
      <div className="users-page__header">
        <h1 className="users-page__title">Співробітники</h1>
        <Button variant="primary" onClick={openCreate}>
          + Створити співробітника
        </Button>
      </div>

      <form className="users-page__search" onSubmit={handleSearch}>
        <input
          className="ui-input"
          placeholder="Пошук за ім'ям або email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" type="submit">
          Пошук
        </Button>
      </form>

      {(error ?? actionError) && (
        <div className="ui-alert ui-alert--error">{error ?? actionError}</div>
      )}

      {loading ? (
        <div className="users-page__loading">Завантаження...</div>
      ) : (
        <div className="ui-card">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Email</th>
                <th>Ролі</th>
                <th>Водій</th>
                <th>Статус</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}
                  >
                    Співробітників не знайдено
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.firstName} {u.lastName}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {u.roles.map((r) => (
                          <span key={r} className="ui-badge">
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {u.driverProfile
                        ? `${u.driverProfile.firstName} ${u.driverProfile.lastName}`
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={
                          u.isActive
                            ? 'users-page__status--active'
                            : 'users-page__status--inactive'
                        }
                      >
                        {u.isActive ? 'Активний' : 'Неактивний'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                          Ред.
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmId(u.id)}
                          title={u.isActive ? 'Деактивувати' : 'Активувати'}
                        >
                          {u.isActive ? 'Деакт.' : 'Акт.'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {total > 0 && <div className="users-page__footer">Всього: {total}</div>}
        </div>
      )}

      {confirmId && confirmTarget && (
        <div className="ui-modal__overlay" onMouseDown={() => setConfirmId(null)}>
          <div
            className="ui-modal ui-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ maxWidth: 380 }}
          >
            <div className="ui-modal__head">
              <div className="ui-modal__title">Підтвердження</div>
            </div>
            <div className="ui-modal__body">
              {confirmTarget.isActive
                ? `Деактивувати ${confirmTarget.firstName} ${confirmTarget.lastName}?`
                : `Активувати ${confirmTarget.firstName} ${confirmTarget.lastName}?`}
            </div>
            <div
              className="ui-modal__footer"
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <Button variant="secondary" onClick={() => setConfirmId(null)}>
                Скасувати
              </Button>
              <Button variant="primary" onClick={() => handleToggleStatus(confirmId)}>
                Підтвердити
              </Button>
            </div>
          </div>
        </div>
      )}

      <UserModal
        open={modalOpen}
        user={editingUser}
        tokens={tokens}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/features/users/UsersPage.tsx client/src/features/users/users.css
git commit -m "feat: add UsersPage component"
```

---

## Task 9: Wire UsersPage into CrmShell

**Files:**
- Modify: `client/src/features/crm/CrmShell.tsx`

- [ ] **Step 1: Add import for UsersPage**

In `client/src/features/crm/CrmShell.tsx`, find the block of feature page imports (lines ~21-29). Add:

```typescript
import { UsersPage } from '../users/UsersPage';
```

- [ ] **Step 2: Add icon import for the nav item**

In the `hugeicons-react` import block at the top of the file, add `UserEdit01Icon`:

```typescript
import {
  // ...existing icons...,
  UserEdit01Icon,
} from 'hugeicons-react';
```

- [ ] **Step 3: Add 'users' to CrmView type**

Find line 29:
```typescript
type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit';
```

Replace with:
```typescript
type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit' | 'users';
```

- [ ] **Step 4: Add nav item inside buildNav for ADMIN**

Find the block (around line 64-66) where ADMIN-only items are pushed:
```typescript
  if (isAdmin) {
    main.push({ view: 'carriers', label: 'Carriers', Icon: Building01Icon });
  }
```

Add the new item right after that block:
```typescript
  if (isAdmin) {
    main.push({ view: 'users', label: 'Співробітники', Icon: UserEdit01Icon });
  }
```

- [ ] **Step 5: Add render case for 'users' view**

Find lines 218-230 (the inline ternary rendering block):
```typescript
{view === 'carriers'   ? <CarriersPage tokens={tokens} onUnauthorized={onLogout} /> :
```

Add a new line in the same ternary chain, right before the final `null`:
```typescript
 view === 'users'     ? <UsersPage    tokens={tokens} onUnauthorized={onLogout} /> :
```

- [ ] **Step 6: Commit**

```bash
git add client/src/features/crm/CrmShell.tsx
git commit -m "feat: add Співробітники nav item and route for ADMIN"
```

---

## Task 10: Final verification

- [ ] **Step 1: TypeScript check**

```bash
cd client && npx tsc --noEmit 2>&1
```
```bash
cd server && npx tsc --noEmit 2>&1
```

Fix any type errors before continuing.

- [ ] **Step 2: Run full test suite**

```bash
cd server && npx vitest run 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 3: Manual end-to-end checklist**

Start servers: `cd server && npm run dev` + `cd client && npm run dev`

- [ ] Log in as ADMIN — "Співробітники" appears in sidebar
- [ ] Click "+ Створити співробітника" — modal opens with empty form
- [ ] Create a user with role LOGIST — appears in table with correct role badge
- [ ] Create a user with role DRIVER — dropdown for linking driver appears; after save, driver column shows linked driver name
- [ ] Click "Ред." on an existing user — modal opens with pre-filled data; save updates the row
- [ ] Remove DRIVER checkbox from a driver-linked user — yellow warning banner appears
- [ ] Click "Деакт." on a non-admin user → confirm dialog → user shows "Неактивний"
- [ ] Try to deactivate your own account — error "Cannot change your own status" shown
- [ ] Log in as LOGIST — "Співробітники" is NOT visible in sidebar
