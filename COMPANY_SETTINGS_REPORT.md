# Company Settings Feature — Implementation Report

**Date:** 2026-04-27  
**Status:** ✅ Complete and Tested (41/41 tests passing)

---

## Overview

Реалізована функція управління налаштуваннями компанії для CRM системи COLOS. Користувачі можуть переглядати дані своєї компанії, а ADMIN може редагувати їх через форму в Drawer модалі.

---

## Architecture

```
Frontend (React 19 + TypeScript)
    ↓
API (Express + Prisma)
    ↓
Database (Prisma ORM)
```

### Data Flow

```
User views CompanyPage
    ↓ GET /api/companies/me
    ↓ (JWT company_id from auth)
    ↓
Backend retrieves company data
    ↓
Frontend displays table (read-only)
    ↓
ADMIN clicks "Edit" → Drawer opens
    ↓ User submits form
    ↓ PUT /api/companies/me
    ↓ (Zod validation, ADMIN check, JWT scope)
    ↓
Backend updates company
    ↓
Frontend closes drawer, refreshes data
```

---

## Backend Implementation

### 1. Zod Schema (`server/src/schemas/index.ts`)

```typescript
const operationModeEnum = z.enum(['OWN_FLEET', 'BROKER', 'HYBRID']);

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2, 'Мінімум 2 символи').max(200, 'Максимум 200 символів').optional(),
  email: z.string().trim().email('Невірний email').nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  address: z.string().trim().max(500, 'Максимум 500 символів').nullable().optional(),
  hasOwnFleet: z.boolean().optional(),
  operationMode: operationModeEnum.optional(),
  usesBrokerServices: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'Потрібно вказати хоча б одне поле' }
);
```

**Валідація:**
- ✅ Всі поля опціональні (частковне оновлення)
- ✅ Принаймні одне поле обов'язково
- ✅ `name` — мінімум 2 символи
- ✅ `email` — валідний email або null
- ✅ `operationMode` — перелік допустимих значень

---

### 2. Express Router (`server/src/router/companies.router.ts`)

#### GET /companies/me

```typescript
companiesRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const company_id = getCompanyId(req);  // JWT, not from body
    
    const company = await prisma.companies.findFirst({
      where: { id: company_id },
      select: {
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
      },
    });
    
    if (!company) return fail(res, 404, 'Company not found');
    return ok(res, companyDto(company));  // camelCase DTO
  }),
);
```

**Характеристики:**
- ✅ Доступна всім авторизованим користувачам
- ✅ `company_id` — тільки з JWT
- ✅ Повертає camelCase об'єкт
- ✅ 404 якщо компанія не знайдена

#### PUT /companies/me

```typescript
companiesRouter.put(
  '/me',
  authorize(['ADMIN']),              // Тільки ADMIN
  validate(updateCompanySchema),     // Zod валідація
  asyncHandler(async (req: Request, res: Response) => {
    const company_id = getCompanyId(req);
    const body = (req.body as Record<string, unknown>) ?? {};

    // Перевірка існування перед оновленням
    const existing = await prisma.companies.findFirst({
      where: { id: company_id },
      select: { id: true },
    });
    if (!existing) return fail(res, 404, 'Company not found');

    // Оновлення з безпечною обробкою null-значень
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
        // Аналогічно для phone, address
        ...(typeof body.hasOwnFleet === 'boolean'
          ? { has_own_fleet: body.hasOwnFleet }
          : {}),
        ...(typeof body.operationMode === 'string'
          ? { operation_mode: body.operationMode as any }
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

**Безпека:**
- ✅ Middleware `authorize(['ADMIN'])` — 403 для не-ADMIN
- ✅ `company_id` ніколи не приймається з body — тільки з JWT
- ✅ Zod валідація перед DB операцією
- ✅ 404 guard перед update
- ✅ Trim усіх строк перед збереженням

---

### 3. Helper Functions & DTO Mapping

```typescript
// Отримання company_id з JWT
function getCompanyId(req: Request) {
  return (req as AuthenticatedRequest).auth.company_id;
}

// DTO: Convert snake_case (DB) → camelCase (API)
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
    email: c.email ?? undefined,  // null → undefined (JSON omission)
    phone: c.phone ?? undefined,
    address: c.address ?? undefined,
    hasOwnFleet: c.has_own_fleet,
    operationMode: c.operation_mode,
    usesBrokerServices: c.uses_broker_services,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

// Переиспользуемый select для обох запитів
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
```

**Особливості:**
- ✅ `null` → `undefined` перетворення (лаконічніший JSON)
- ✅ ISO дати для фронтенду
- ✅ camelCase конвенція для API
- ✅ Повторне використання `companySelect`

---

### 4. Middleware Chain

```typescript
// Порядок middleware критично важливий:
companiesRouter.put(
  '/me',
  authorize(['ADMIN']),           // 1. Перевірка ролі (403 перед DB)
  validate(updateCompanySchema),  // 2. Zod валідація (400 перед DB)
  asyncHandler(async (req, res) => {  // 3. Логіка
    // Тільки ADMIN доходить сюди
    // Тільки валідні дані доходять сюди
  }),
);
```

**Middleware stack:**
1. `requireAuth` — глобально на роутері (`companiesRouter.use(requireAuth)`)
2. `authorize(['ADMIN'])` — на PUT (403 для інших)
3. `validate(updateCompanySchema)` — Zod (400 на помилку)
4. `asyncHandler` — Try/catch wrapper для async помилок

---

### 5. Error Handling

```typescript
// Приклади обробки помилок на сервері:

// 401 — Обробляється middleware requireAuth
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return fail(res, 401, 'Missing access token');
  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).auth = payload;
    return next();
  } catch {
    return fail(res, 401, 'Invalid or expired access token');
  }
}

// 403 — Обробляється middleware authorize
export function authorize(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const ok = auth.roles.some((r) => allowed.includes(r));
    if (!ok) return fail(res, 403, 'Forbidden');
    return next();
  };
}

// 400 — Обробляється middleware validate (Zod)
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, 'Validation error', parsed.error.errors);
    }
    req.body = parsed.data;
    next();
  };
}

// 404 — Явна перевірка в обробнику
if (!existing) return fail(res, 404, 'Company not found');

// Приклад HTTP відповіді:
// ✅ 200 OK:
{
  "success": true,
  "data": { "id": "...", "name": "..." }
}

// ❌ 400 Bad Request:
{
  "success": false,
  "message": "Validation error",
  "details": [{ "code": "too_small", "path": ["name"] }]
}

// ❌ 403 Forbidden:
{
  "success": false,
  "message": "Forbidden"
}
```

---

### 6. Database Operations with Prisma

```typescript
// GET — findFirst з умовою company_id
const company = await prisma.companies.findFirst({
  where: { id: company_id },  // Скопінг за JWT
  select: companySelect,      // Тільки потрібні поля
});

// Якщо не знайдена — fail 404
if (!company) return fail(res, 404, 'Company not found');

// PUT — Умовний update з null handling
const updated = await prisma.companies.update({
  where: { id: company_id },  // Гарантіює скопінг
  
  data: {
    // Умовно встановлюємо поля (не перезаписуємо на undefined)
    ...(typeof body.name === 'string' && body.name.trim()
      ? { name: body.name.trim() }
      : {}),
    
    // Explicit null clearing
    ...(body.email === null
      ? { email: null }
      : typeof body.email === 'string' && body.email.trim()
        ? { email: body.email.trim() }
        : {}),
    
    // Булеви флаги
    ...(typeof body.hasOwnFleet === 'boolean'
      ? { has_own_fleet: body.hasOwnFleet }
      : {}),
    
    // Enum значення
    ...(typeof body.operationMode === 'string'
      ? { operation_mode: body.operationMode as any }
      : {}),
    
    // Завжди оновлюємо timestamp
    updated_at: new Date(),
  },
  
  select: companySelect,
});
```

**Prisma паттерни:**
- ✅ `findFirst` + `where` для scoping
- ✅ `select` для оптимізації
- ✅ Spread operator `...` для умовних полів
- ✅ Explicit `null` для очищення
- ✅ `updated_at` завжди оновлюється

---

### 7. API Tests

```typescript
describe('GET /api/companies/me', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('повертає 200 з даними компанії для авторизованого користувача', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    (prisma.companies.findFirst as MockedFn).mockResolvedValue({
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
    });

    const res = await request(app)
      .get('/api/companies/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('ТОВ Тест Логістика');
    expect(res.body.data.hasOwnFleet).toBe(true);
    expect(res.body.data.operationMode).toBe('HYBRID');
    expect(res.body.data.email).toBeDefined();
  });

  it('повертає 401 без токена', async () => {
    const res = await request(app).get('/api/companies/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('повертає 404 коли компанія не знайдена', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: 'nonexistent-uuid',
      roles: ['ADMIN'],
    });
    (prisma.companies.findFirst as MockedFn).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/companies/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
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
    
    // Mock findFirst для 404 guard
    (prisma.companies.findFirst as MockedFn).mockResolvedValue({
      id: mockUser.company_id,
    });
    
    // Mock update для успішного оновлення
    (prisma.companies.update as MockedFn).mockResolvedValue({
      id: 'company-uuid-001',
      name: 'Нова Назва',
      email: 'info@test.ua',
      phone: '+380671234567',
      address: 'вул. Хрещатик, 1, Київ',
      has_own_fleet: true,
      operation_mode: 'HYBRID',
      uses_broker_services: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

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
      roles: ['MANAGER'],  // Не ADMIN
    });

    const res = await request(app)
      .put('/api/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Тест' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // prisma не був викликаний (403 перед DB)
    expect(prisma.companies.findFirst).not.toHaveBeenCalled();
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
      .send({ name: 'X' });  // Менше 2 символів

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // prisma не був викликаний (валідація перед DB)
    expect(prisma.companies.update).not.toHaveBeenCalled();
  });

  it('очищає nullable поля коли значення null', async () => {
    const token = signAccessToken({
      sub: mockUser.id,
      email: mockUser.email,
      company_id: mockUser.company_id,
      roles: ['ADMIN'],
    });
    
    (prisma.companies.findFirst as MockedFn).mockResolvedValue({
      id: mockUser.company_id,
    });
    
    (prisma.companies.update as MockedFn).mockResolvedValue({
      id: 'company-uuid-001',
      name: 'ТОВ Тест',
      email: null,  // Очищено
      phone: null,  // Очищено
      address: null,  // Очищено
      has_own_fleet: true,
      operation_mode: 'HYBRID',
      uses_broker_services: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const res = await request(app)
      .put('/api/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: null,
        phone: null,
        address: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBeUndefined();  // null → undefined в DTO
    expect(res.body.data.phone).toBeUndefined();
    expect(res.body.data.address).toBeUndefined();
  });

  it('повертає 401 без токена', async () => {
    const res = await request(app)
      .put('/api/companies/me')
      .send({ name: 'Тест' });
    expect(res.status).toBe(401);
  });
});
```

**Тестова покриття:**
- ✅ GET 200 (успіх, camelCase DTO)
- ✅ GET 401 (no token)
- ✅ GET 404 (не знайдена)
- ✅ PUT 200 (ADMIN успіх)
- ✅ PUT 403 (не-ADMIN)
- ✅ PUT 400 (валідація)
- ✅ PUT null clearing (очищення полів)
- ✅ PUT 401 (no token)
- ✅ Schema validation (4 тести)

**Всього:** 41/41 тестів passing

---

## Frontend Implementation

### 1. CompanyPage Component (`client/src/features/company/CompanyPage.tsx`)

```typescript
type Company = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  hasOwnFleet: boolean
  operationMode: 'OWN_FLEET' | 'BROKER' | 'HYBRID'
  usesBrokerServices: boolean
  createdAt: string
  updatedAt: string
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

  const [company, setCompany] = useState<Company | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  function loadCompany() {
    apiGetJson<ApiResponse<Company>>('/api/companies/me', { headers: authHeaders })
      .then((res) => {
        if (isApiSuccess(res)) setCompany(res.data)
        else setError('Помилка завантаження даних компанії')
      })
      .catch((err: ApiError) => {
        if (err.status === 401) onUnauthorized()
        else setError(err.message ?? 'Помилка')
      })
  }

  useEffect(() => {
    void loadCompany()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSave() {
    setSaving(true)
    apiPutJson<ApiResponse<Company>>(
      '/api/companies/me',
      {
        name: form.name.trim() || undefined,
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
        }
      })
      .catch((err: ApiError) => {
        if (err.status === 401) onUnauthorized()  // Правильна обробка 401
        else setSaveError(err.message ?? 'Помилка збереження')
      })
      .finally(() => setSaving(false))
  }

  // Таблиця з одним рядком
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
            <tr><th>Назва</th><td>{company.name}</td></tr>
            <tr><th>Email</th><td>{company.email ?? '—'}</td></tr>
            <tr><th>Телефон</th><td>{company.phone ?? '—'}</td></tr>
            <tr><th>Адреса</th><td>{company.address ?? '—'}</td></tr>
            <tr><th>Режим роботи</th><td>{OPERATION_MODE_LABELS[company.operationMode]}</td></tr>
            <tr><th>Власний флот</th><td>{company.hasOwnFleet ? 'Так' : 'Ні'}</td></tr>
            <tr><th>Брокерські послуги</th><td>{company.usesBrokerServices ? 'Так' : 'Ні'}</td></tr>
          </tbody>
        </table>
      </Card>

      {/* Drawer форма для редагування */}
      <Drawer
        open={editOpen}
        title="Редагувати компанію"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Збереження...' : 'Зберегти'}
            </Button>
          </>
        }
      >
        <div className="company__form">
          <label className="company__label">
            Назва *
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Режим роботи
            <select
              value={form.operationMode}
              onChange={(e) =>
                setForm((f) => ({ ...f, operationMode: e.target.value as OperationMode }))
              }
            >
              {Object.entries(OPERATION_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
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
          {saveError && <div className="company__saveError">{saveError}</div>}
        </div>
      </Drawer>
    </div>
  )
}
```

---

### 2. CRM Navigation Integration

```typescript
// CrmShell.tsx

type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit' | 'users' | 'profile' | 'company';

import { CompanyPage } from '../company/CompanyPage';

function buildNav(roles: string[]): { main: NavItem[]; fleet: NavItem[] } {
  // ... інші пункти меню ...
  
  // Видимо для всіх (крім водіїв)
  main.push({ view: 'company', label: 'Компанія', Icon: Settings01Icon });

  return { main, fleet };
}

// У рендері:
{view === 'company' ? <CompanyPage tokens={tokens} onUnauthorized={onLogout} /> : null}
```

**Навігація:**
- ✅ Пункт "Компанія" видимий у сайдбарі
- ✅ Видимий для всіх ролей (не тільки ADMIN)
- ✅ Кнопка "Редагувати" видима тільки для ADMIN

---

## Key Features

| Функція | Статус | Деталі |
|---------|--------|--------|
| GET компанії | ✅ | Безпечний доступ з JWT `company_id` |
| Редагування | ✅ | Тільки ADMIN, через Drawer форму |
| Валідація | ✅ | Zod schema, серверна перевірка |
| Безпека | ✅ | JWT scoping, role gates, 401 handling |
| Тести | ✅ | 9 нових тестів, 41/41 passing |
| TypeScript | ✅ | Без помилок типів |
| UI/UX | ✅ | Drawer модаль, таблиця, CSS стилізація |

---

## Security Considerations

### JWT Scoping
```
Користувач з JWT:
{
  "sub": "user-123",
  "email": "admin@company.ua",
  "company_id": "company-456",  ← Тільки своя компанія
  "roles": ["ADMIN", "MANAGER"]
}
```

Backend ніколи не приймає `company_id` з body:
```typescript
const company_id = getCompanyId(req);  // Тільки з JWT
// Не робимо:
// const company_id = req.body.company_id;  ❌ ЗАБИВАЄ
```

### Authorization
```
PUT /companies/me
  1. requireAuth → 401 без токена
  2. authorize(['ADMIN']) → 403 для інших ролей
  3. validate(updateCompanySchema) → 400 при невалідних даних
  4. Тільки потім → Database операція
```

### Null Handling
```typescript
// Дозволяє очищати поля:
{ email: null }  // → email NULL у БД
{ email: undefined }  // → email не змінюється

// DTO повертає undefined замість null:
email: c.email ?? undefined  // JSON лаконічніший
```

---

## Database Schema (Prisma)

```prisma
model companies {
  id                   String        @id
  name                 String
  email                String?
  phone                String?
  address              String?
  has_own_fleet        Boolean       @default(true)
  operation_mode       OperationMode @default(HYBRID)
  uses_broker_services Boolean       @default(true)
  created_at           DateTime      @default(now())
  updated_at           DateTime
  
  // Relations...
  users                users[]
  carriers             carriers[]
  clients              clients[]
  drivers              drivers[]
  orders               orders[]
  vehicles             vehicles[]
  invoices             invoices[]
}

enum OperationMode {
  OWN_FLEET
  BROKER
  HYBRID
}
```

---

## Test Results

```
PASS  server/src/tests/app.test.ts
  updateCompanySchema
    ✓ приймає частковий валідний payload
    ✓ відхиляє name коротше 2 символів
    ✓ відхиляє невалідний operationMode
    ✓ відхиляє порожній payload

  GET /api/companies/me
    ✓ повертає 200 з даними компанії для авторизованого користувача
    ✓ повертає 401 без токена
    ✓ повертає 404 коли компанія не знайдена

  PUT /api/companies/me
    ✓ повертає 200 при оновленні ADMIN-ом
    ✓ повертає 403 для не-ADMIN
    ✓ повертає 400 при невалідних даних
    ✓ повертає 401 без токена
    ✓ очищає nullable поля коли значення null

Test Files  2 passed (2)
Tests  41 passed (41)
```

---

## Files Modified/Created

### Backend
- ✅ `server/src/schemas/index.ts` — Zod schema
- ✅ `server/src/router/companies.router.ts` — API endpoints (нових 120 строк)
- ✅ `server/src/router/api.router.ts` — Router mounting
- ✅ `server/src/tests/app.test.ts` — 9 нових тестів

### Frontend
- ✅ `client/src/features/company/CompanyPage.tsx` — React component (261 строк)
- ✅ `client/src/features/company/company.css` — Styling
- ✅ `client/src/features/crm/CrmShell.tsx` — Navigation wiring

### Documentation
- ✅ `docs/superpowers/specs/2026-04-26-company-settings-design.md` — Design spec
- ✅ `docs/superpowers/plans/2026-04-26-company-settings.md` — Implementation plan

---

## Conclusion

Функція **Company Settings** повністю реалізована, протестована та готова до продакшену:

✅ **Backend:** Express router з Zod валідацією  
✅ **Frontend:** React component з Drawer редагуванням  
✅ **Security:** JWT scoping, role gates, null safety  
✅ **Tests:** 41/41 passing, 9 нових тестів  
✅ **TypeScript:** Без помилок типів  
✅ **UI/UX:** Вписується в існуючі паттерни  

**Готово до merge!**
