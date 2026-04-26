# Company Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Company Settings page where any authenticated user can view their company details, and only an ADMIN can edit them via a Drawer form.

**Architecture:** New `GET /companies/me` + `PUT /companies/me` backend endpoints scoped entirely by `company_id` from the JWT. Frontend `CompanyPage` component follows the existing `ClientsPage`/`CarriersPage` table + Drawer pattern, wired into `CrmShell` as a new nav item.

**Tech Stack:** Express + Prisma + Zod (backend), React 19 + TypeScript (frontend), Vitest + Supertest (tests)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `server/src/schemas/index.ts` | Add `updateCompanySchema` |
| Create | `server/src/router/companies.router.ts` | `GET /me`, `PUT /me` handlers |
| Modify | `server/src/router/api.router.ts` | Mount `/companies` router |
| Modify | `server/src/tests/app.test.ts` | Extend companyModel mock + add test suites |
| Create | `client/src/features/company/CompanyPage.tsx` | Company details table + edit Drawer |
| Modify | `client/src/features/crm/CrmShell.tsx` | Add `'company'` view, nav item, render case |

---

## Task 1: Add `updateCompanySchema` to Zod schemas

**Files:**
- Modify: `server/src/schemas/index.ts`

- [ ] **Step 1: Write the failing test**

Add this describe block at the bottom of `server/src/tests/app.test.ts` (before the file ends):

```ts
describe('updateCompanySchema', () => {
  it('accepts a partial valid payload', () => {
    const { updateCompanySchema } = require('../schemas');
    const result = updateCompanySchema.safeParse({ name: 'ТОВ Нова', email: null });
    expect(result.success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    const { updateCompanySchema } = require('../schemas');
    const result = updateCompanySchema.safeParse({ name: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid operationMode', () => {
    const { updateCompanySchema } = require('../schemas');
    const result = updateCompanySchema.safeParse({ operationMode: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/tests/app.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `updateCompanySchema` not exported from `../schemas`

- [ ] **Step 3: Add `updateCompanySchema` to `server/src/schemas/index.ts`**

Add after the existing `updateClientSchema` line:

```ts
/* ─── companies ────────────────────────────────────────── */

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2, 'Мінімум 2 символи').max(200, 'Максимум 200 символів').optional(),
  email: z.string().trim().email('Невірний email').nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  address: z.string().trim().max(500, 'Максимум 500 символів').nullable().optional(),
  hasOwnFleet: z.boolean().optional(),
  operationMode: z.enum(['OWN_FLEET', 'BROKER', 'HYBRID']).optional(),
  usesBrokerServices: z.boolean().optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/tests/app.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: PASS — 3 new tests green

- [ ] **Step 5: Commit**

```bash
git add server/src/schemas/index.ts server/src/tests/app.test.ts
git commit -m "feat: add updateCompanySchema for company settings endpoint"
```

---

## Task 2: Backend companies router + API tests

**Files:**
- Create: `server/src/router/companies.router.ts`
- Modify: `server/src/router/api.router.ts`
- Modify: `server/src/tests/app.test.ts`

- [ ] **Step 1: Extend the Prisma mock in `app.test.ts`**

Find this line (around line 19):

```ts
  const companyModel = { findFirst: vi.fn() };
```

Replace it with:

```ts
  const companyModel = { findFirst: vi.fn(), update: vi.fn() };
```

- [ ] **Step 2: Write failing tests for `GET /api/companies/me`**

Add this describe block at the end of `server/src/tests/app.test.ts`:

```ts
/* ═══════════════════════════════════════════════════════════
   Companies
═══════════════════════════════════════════════════════════ */

const mockCompany = {
  id: 'company-uuid-001',
  name: 'ТОВ Тест Логістика',
  email: 'info@test.ua',
  phone: '+380671234567',
  address: 'вул. Хрещатик, 1, Київ',
  has_own_fleet: true,
  operation_mode: 'HYBRID',
  uses_broker_services: true,
  created_at: new Date('2024-01-01T00:00:00.000Z'),
  updated_at: new Date('2024-06-01T00:00:00.000Z'),
};

describe('GET /api/companies/me', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 200 з даними компанії для авторизованого користувача', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (prisma.companies.findFirst as MockedFn).mockResolvedValue(mockCompany);

    const res = await request(app)
      .get('/api/companies/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('ТОВ Тест Логістика');
    expect(res.body.data.hasOwnFleet).toBe(true);
    expect(res.body.data.operationMode).toBe('HYBRID');
  });

  it('повертає 401 без токена', async () => {
    const res = await request(app).get('/api/companies/me');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/companies/me', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 200 при оновленні ADMIN-ом', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    const updatedCompany = { ...mockCompany, name: 'Нова Назва', updated_at: new Date() };
    (prisma.companies.update as MockedFn).mockResolvedValue(updatedCompany);

    const res = await request(app)
      .put('/api/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Нова Назва' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Нова Назва');
  });

  it('повертає 403 для не-ADMIN', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['MANAGER'],
    });

    const res = await request(app)
      .put('/api/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Нова Назва' });

    expect(res.status).toBe(403);
  });

  it('повертає 400 при невалідних даних (name занадто коротке)', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });

    const res = await request(app)
      .put('/api/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });

    expect(res.status).toBe(400);
  });

  it('повертає 401 без токена', async () => {
    const res = await request(app)
      .put('/api/companies/me')
      .send({ name: 'Тест' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd server && npx vitest run src/tests/app.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — routes not yet defined (404 responses)

- [ ] **Step 4: Create `server/src/router/companies.router.ts`**

```ts
import express, { type Request, type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { updateCompanySchema } from '../schemas';
import { asyncHandler } from '../utils/asyncHandler';
import { fail, ok } from '../utils/http';

export const companiesRouter = express.Router();

companiesRouter.use(requireAuth);

function getAuth(req: Request) {
  return (req as AuthenticatedRequest).auth;
}

function companyDto(c: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  has_own_fleet: boolean;
  operation_mode: string;
  uses_broker_services: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    hasOwnFleet: c.has_own_fleet,
    operationMode: c.operation_mode,
    usesBrokerServices: c.uses_broker_services,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

const companySelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  has_own_fleet: true,
  operation_mode: true,
  uses_broker_services: true,
  created_at: true,
  updated_at: true,
} as const;

companiesRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const { company_id } = getAuth(req);
    const company = await prisma.companies.findFirst({
      where: { id: company_id },
      select: companySelect,
    });
    if (!company) return fail(res, 404, 'Company not found');
    return ok(res, companyDto(company));
  }),
);

companiesRouter.put(
  '/me',
  authorize(['ADMIN']),
  validate(updateCompanySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { company_id } = getAuth(req);
    const body = (req.body as Record<string, unknown>) ?? {};

    const updated = await prisma.companies.update({
      where: { id: company_id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim()
          ? { name: body.name.trim() }
          : {}),
        ...(body.email === null
          ? { email: null }
          : typeof body.email === 'string' && body.email.trim()
            ? { email: body.email.trim() }
            : {}),
        ...(body.phone === null
          ? { phone: null }
          : typeof body.phone === 'string' && body.phone.trim()
            ? { phone: body.phone.trim() }
            : {}),
        ...(body.address === null
          ? { address: null }
          : typeof body.address === 'string' && body.address.trim()
            ? { address: body.address.trim() }
            : {}),
        ...(typeof body.hasOwnFleet === 'boolean'
          ? { has_own_fleet: body.hasOwnFleet }
          : {}),
        ...(typeof body.operationMode === 'string'
          ? { operation_mode: body.operationMode as 'OWN_FLEET' | 'BROKER' | 'HYBRID' }
          : {}),
        ...(typeof body.usesBrokerServices === 'boolean'
          ? { uses_broker_services: body.usesBrokerServices }
          : {}),
        updated_at: new Date(),
      },
      select: companySelect,
    });

    return ok(res, companyDto(updated));
  }),
);
```

- [ ] **Step 5: Mount the router in `server/src/router/api.router.ts`**

Add import at the top with the other router imports:

```ts
import { companiesRouter } from './companies.router';
```

Add the mount line after the existing `apiRouter.use('/users', usersRouter);` line:

```ts
apiRouter.use('/companies', companiesRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd server && npx vitest run src/tests/app.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All tests PASS (including the 5 new Companies tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/router/companies.router.ts server/src/router/api.router.ts server/src/tests/app.test.ts
git commit -m "feat: add GET/PUT /companies/me endpoints with ADMIN-only write guard"
```

---

## Task 3: Frontend CompanyPage component

**Files:**
- Create: `client/src/features/company/CompanyPage.tsx`

- [ ] **Step 1: Create `client/src/features/company/CompanyPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiGetJson, apiPutJson, type ApiError } from '../../lib/api'
import { isApiSuccess, type ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { tryGetRolesFromJwt } from '../crm/jwt'

type OperationMode = 'OWN_FLEET' | 'BROKER' | 'HYBRID'

type Company = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  hasOwnFleet: boolean
  operationMode: OperationMode
  usesBrokerServices: boolean
  createdAt: string
  updatedAt: string
}

const OPERATION_MODE_LABELS: Record<OperationMode, string> = {
  OWN_FLEET: 'Власний флот',
  BROKER: 'Брокер',
  HYBRID: 'Гібрид',
}

export function CompanyPage({
  tokens,
  onUnauthorized,
}: {
  tokens: AuthTokens
  onUnauthorized: () => void
}) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken])
  const isAdmin = roles.includes('ADMIN')
  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${tokens.accessToken}` }),
    [tokens.accessToken],
  )

  const [company, setCompany] = useState<Company | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    hasOwnFleet: true,
    operationMode: 'HYBRID' as OperationMode,
    usesBrokerServices: true,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function loadCompany() {
    setIsLoading(true)
    setError(null)
    apiGetJson<ApiResponse<Company>>('/api/companies/me', { headers: authHeaders })
      .then((res) => {
        if (isApiSuccess(res)) setCompany(res.data)
        else setError('Помилка завантаження даних компанії')
      })
      .catch((err: ApiError) => {
        if (err.status === 401) onUnauthorized()
        else setError(err.message ?? 'Помилка')
      })
      .finally(() => setIsLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCompany() }, [])

  function openEdit() {
    if (!company) return
    setForm({
      name: company.name,
      email: company.email ?? '',
      phone: company.phone ?? '',
      address: company.address ?? '',
      hasOwnFleet: company.hasOwnFleet,
      operationMode: company.operationMode,
      usesBrokerServices: company.usesBrokerServices,
    })
    setSaveError(null)
    setEditOpen(true)
  }

  function handleSave() {
    setSaving(true)
    setSaveError(null)
    apiPutJson<ApiResponse<Company>>(
      '/api/companies/me',
      {
        name: form.name || undefined,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        hasOwnFleet: form.hasOwnFleet,
        operationMode: form.operationMode,
        usesBrokerServices: form.usesBrokerServices,
      },
      { headers: authHeaders },
    )
      .then((res) => {
        if (isApiSuccess(res)) {
          setCompany(res.data)
          setEditOpen(false)
        } else {
          setSaveError('Помилка збереження')
        }
      })
      .catch((err: ApiError) => {
        setSaveError(err.message ?? 'Помилка збереження')
      })
      .finally(() => setSaving(false))
  }

  if (isLoading) return <div className="pageState">Завантаження...</div>
  if (error) return <div className="pageState pageState--error">{error}</div>
  if (!company) return null

  return (
    <div className="company">
      <div className="company__header">
        <h2 className="company__title">Компанія</h2>
        {isAdmin && (
          <Button variant="primary" onClick={openEdit}>
            Редагувати
          </Button>
        )}
      </div>

      <Card>
        <table className="company__table">
          <tbody>
            <tr>
              <th>Назва</th>
              <td>{company.name}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>{company.email ?? '—'}</td>
            </tr>
            <tr>
              <th>Телефон</th>
              <td>{company.phone ?? '—'}</td>
            </tr>
            <tr>
              <th>Адреса</th>
              <td>{company.address ?? '—'}</td>
            </tr>
            <tr>
              <th>Режим роботи</th>
              <td>{OPERATION_MODE_LABELS[company.operationMode]}</td>
            </tr>
            <tr>
              <th>Власний флот</th>
              <td>{company.hasOwnFleet ? 'Так' : 'Ні'}</td>
            </tr>
            <tr>
              <th>Брокерські послуги</th>
              <td>{company.usesBrokerServices ? 'Так' : 'Ні'}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Drawer
        open={editOpen}
        title="Редагувати компанію"
        onClose={() => setEditOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Збереження...' : 'Зберегти'}
            </Button>
          </div>
        }
      >
        <div className="company__form">
          <label className="company__label">
            Назва *
            <input
              className="company__input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Email
            <input
              className="company__input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Телефон
            <input
              className="company__input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Адреса
            <input
              className="company__input"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Режим роботи
            <select
              className="company__input"
              value={form.operationMode}
              onChange={(e) =>
                setForm((f) => ({ ...f, operationMode: e.target.value as OperationMode }))
              }
            >
              <option value="OWN_FLEET">Власний флот</option>
              <option value="BROKER">Брокер</option>
              <option value="HYBRID">Гібрид</option>
            </select>
          </label>
          <label className="company__checkLabel">
            <input
              type="checkbox"
              checked={form.hasOwnFleet}
              onChange={(e) => setForm((f) => ({ ...f, hasOwnFleet: e.target.checked }))}
            />
            Власний флот
          </label>
          <label className="company__checkLabel">
            <input
              type="checkbox"
              checked={form.usesBrokerServices}
              onChange={(e) =>
                setForm((f) => ({ ...f, usesBrokerServices: e.target.checked }))
              }
            />
            Брокерські послуги
          </label>
          {saveError && <div className="company__saveError">{saveError}</div>}
        </div>
      </Drawer>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to `CompanyPage.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/features/company/CompanyPage.tsx
git commit -m "feat: add CompanyPage component with view/edit Drawer"
```

---

## Task 4: Wire CompanyPage into CrmShell

**Files:**
- Modify: `client/src/features/crm/CrmShell.tsx`

- [ ] **Step 1: Add `'company'` to the `CrmView` type**

Find this line in `CrmShell.tsx`:

```ts
type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit' | 'users' | 'profile';
```

Replace it with:

```ts
type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit' | 'users' | 'profile' | 'company';
```

- [ ] **Step 2: Import `CompanyPage`**

Add this import after the existing `ProfilePage` import line:

```ts
import { CompanyPage } from '../company/CompanyPage';
```

- [ ] **Step 3: Add the nav item in `buildNav`**

Find the block that adds the `'carriers'` and `'users'` nav items:

```ts
  if (isAdmin) {
    main.push({ view: 'carriers', label: 'Перевізники', Icon: Building01Icon });
    main.push({ view: 'users', label: 'Співробітники', Icon: UserEdit01Icon });
  }
```

Replace it with:

```ts
  if (isAdmin) {
    main.push({ view: 'carriers', label: 'Перевізники', Icon: Building01Icon });
    main.push({ view: 'users', label: 'Співробітники', Icon: UserEdit01Icon });
  }
```

Then find the `return { main, fleet };` line at the end of `buildNav` and add the company entry immediately before it, so it appears for all non-driver users:

```ts
  main.push({ view: 'company', label: 'Компанія', Icon: Settings01Icon });

  return { main, fleet };
```

- [ ] **Step 4: Add the render case**

Find this line in the render switch:

```ts
           view === 'profile'    ? <ProfilePage tokens={tokens} /> :
           null}
```

Replace it with:

```ts
           view === 'profile'    ? <ProfilePage tokens={tokens} /> :
           view === 'company'    ? <CompanyPage tokens={tokens} onUnauthorized={onLogout} /> :
           null}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/features/crm/CrmShell.tsx
git commit -m "feat: wire CompanyPage into CrmShell nav and routing"
```

---

## Task 5: Run full test suite and verify

- [ ] **Step 1: Run all server tests**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -40
```

Expected: All tests PASS, no failures

- [ ] **Step 2: Run TypeScript check on entire client**

```bash
cd client && npx tsc --noEmit 2>&1
```

Expected: No errors

- [ ] **Step 3: Final commit if any lint fixes were needed**

If no changes needed, skip. Otherwise:

```bash
git add -p
git commit -m "fix: resolve type/lint issues after company settings integration"
```
