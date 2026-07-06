# COLOS CRM — Технічний звіт: ключові підсистеми

---

## 1. Авторизація та система middleware

### 1.1 JWT-авторизація

Система використовує два типи токенів: короткочасний **access token** (передається у заголовку `Authorization: Bearer`) та довгостроковий **refresh token** (зберігається у `httpOnly`-куці).

Структура payload access-токену:

```typescript
// server/src/utils/jwt.ts
export type AccessTokenPayload = {
  sub: string;        // userId
  email: string;
  company_id: string; // мультитенантна ізоляція
  roles: Role[];
};
```

Підпис та верифікація токенів:

```typescript
// server/src/utils/jwt.ts
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new Error("Invalid or expired access token");
  }
}
```

### 1.2 Процес входу (sign-in)

При вході система перевіряє активність облікового запису та хеш паролю через `bcrypt`, після чого видає обидва токени:

```typescript
// server/src/router/auth.router.ts
authRouter.post('/signin', validate(signInSchema), async (req, res) => {
  const user = await prisma.users.findUnique({
    where: { email },
    include: { user_roles: true },
  });
  if (!user) return fail(res, 401, 'Invalid email or password');
  if (!user.is_active) return fail(res, 403, 'User is inactive');

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) return fail(res, 401, 'Invalid email or password');

  const roles = user.user_roles.map((r) => r.role);
  const accessToken = signAccessToken({ sub: user.id, email: user.email, company_id: user.company_id, roles });
  const refreshToken = signRefreshToken({ sub: user.id, jti: randomUUID() });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
  });

  return ok(res, { accessToken, refreshToken, user: { ... } });
});
```

Оновлення access-токену через refresh:

```typescript
// server/src/router/auth.router.ts
authRouter.post('/refresh', async (req, res) => {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.users.findUnique({
    where: { id: payload.sub },
    include: { user_roles: true },
  });
  if (!user || !user.is_active) return fail(res, 401, 'User not found or inactive');
  const accessToken = signAccessToken({ sub: user.id, email: user.email, company_id: user.company_id, roles });
  return ok(res, { accessToken });
});
```

### 1.3 Middleware автентифікації

`requireAuth` — Express middleware, що перевіряє Bearer-токен і додає payload до об'єкту запиту:

```typescript
// server/src/middleware/auth.ts
export type AuthenticatedRequest = Request & { auth: AccessTokenPayload };

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

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
```

### 1.4 Middleware авторизації за ролями

`authorize` — фабрика middleware, що перевіряє наявність потрібної ролі у токені:

```typescript
// server/src/middleware/authorize.ts
export function authorize(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as AuthenticatedRequest).auth;
    const ok = auth.roles.some((r) => allowed.includes(r));
    if (!ok) return fail(res, 403, 'Forbidden');
    return next();
  };
}
```

Застосування у роутерах:

```typescript
// GET /api/orders — тільки ADMIN, LOGIST, MANAGER
ordersRouter.get('/', authorize(['ADMIN', 'LOGIST', 'MANAGER']), asyncHandler(...));

// POST /api/orders — тільки ADMIN, LOGIST
ordersRouter.post('/', authorize(['ADMIN', 'LOGIST']), validate(createOrderSchema), asyncHandler(...));

// GET /api/orders/my — тільки DRIVER
ordersRouter.get('/my', authorize(['DRIVER']), asyncHandler(...));
```

### 1.5 Middleware валідації (Zod)

`validate` перевіряє тіло запиту через Zod-схему та повертає детальну помилку при невідповідності:

```typescript
// server/src/middleware/validate.ts
export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return fail(res, 400, message);
    }
    req.body = result.data;
    return next();
  };
}
```

Приклад Zod-схеми для входу:

```typescript
// server/src/schemas/index.ts
export const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
```

### 1.6 Захист на рівні додатку (Rate Limiting + Helmet)

```typescript
// server/src/app.ts
app.use(helmet()); // HTTP security headers

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Жорсткіший ліміт для auth-ендпоінтів
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 спроб на 15 хвилин
  ...
});
app.use('/api/auth', authLimiter);
```

### 1.7 Уніфікований формат відповіді API

```typescript
// server/src/utils/http.ts
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data } satisfies ApiSuccess<T>);
}

export function okList<T>(res: Response, data: T[], pagination: ApiPagination) {
  return res.status(200).json({ success: true, data, pagination } as const);
}

export function fail(res: Response, status: number, message: string, details?: unknown) {
  const payload: ApiError = { success: false, message };
  if (details !== undefined && process.env.NODE_ENV !== 'production') payload.details = details;
  return res.status(status).json(payload);
}
```

---

## 2. Розрахунок вартості замовлення

### 2.1 Типи виконання

Система підтримує два типи виконання замовлення, що визначають склад витрат:

| Тип | Витрати |
|-----|---------|
| `INTERNAL` | паливо + зарплата водія (власний автопарк) |
| `EXTERNAL` | погоджена ціна перевізника (аутсорс) |

### 2.2 Функція розрахунку фінансових показників

```typescript
// server/src/router/orders.router.ts
function computeFinancials(data: {
  executionType: ExecutionType;
  estimatedFuelCost?: number | null;
  estimatedSalaryCost?: number | null;
  carrierAgreedPrice?: number | null;
  clientPrice: number;
}) {
  const internalCost = (data.estimatedFuelCost ?? 0) + (data.estimatedSalaryCost ?? 0);
  const externalCost = data.carrierAgreedPrice ?? 0;
  const totalCost = data.executionType === 'INTERNAL' ? internalCost : externalCost;
  const margin = data.clientPrice - totalCost;
  const marginPercent = data.clientPrice > 0 ? (margin / data.clientPrice) * 100 : 0;
  return {
    internal_cost: internalCost || null,
    external_cost: externalCost || null,
    total_cost: totalCost,
    margin: Math.round(margin * 100) / 100,
    margin_percent: Math.round(marginPercent * 100) / 100,
  };
}
```

**Формули:**
- `total_cost = estimatedFuelCost + estimatedSalaryCost` (INTERNAL)
- `total_cost = carrierAgreedPrice` (EXTERNAL)
- `margin = clientPrice − total_cost`
- `margin_percent = (margin / clientPrice) × 100`

### 2.3 Застосування при створенні та редагуванні замовлення

```typescript
// server/src/router/orders.router.ts  — POST /
const financials = computeFinancials({
  executionType,
  estimatedFuelCost: toFloat(body.estimatedFuelCost),
  estimatedSalaryCost: toFloat(body.estimatedSalaryCost),
  carrierAgreedPrice: toFloat(body.carrierAgreedPrice),
  clientPrice,
});

const created = await prisma.orders.create({
  data: {
    ...
    ...financials,   // розпаковує: internal_cost, external_cost, total_cost, margin, margin_percent
    client_price: clientPrice,
    ...
  },
  select: orderSelect,
});
```

При редагуванні існуючого замовлення використовуються поточні значення як fallback:

```typescript
// server/src/router/orders.router.ts  — PUT /:id
const financials = computeFinancials({
  executionType,
  estimatedFuelCost: toFloat(body.estimatedFuelCost) ?? existing.estimated_fuel_cost,
  estimatedSalaryCost: toFloat(body.estimatedSalaryCost) ?? existing.estimated_salary_cost,
  carrierAgreedPrice: toFloat(body.carrierAgreedPrice) ?? existing.carrier_agreed_price,
  clientPrice,
});
```

### 2.4 Відстеження оплат

Система реєструє двоетапну оплату замовлення:

```typescript
// Аванс (AWAITING_PREPAYMENT → PREPAID)
await prisma.orders.update({
  where: { id: req.params.id },
  data: {
    status: 'PREPAID',
    prepaid_amount: amount,
    prepaid_at: new Date(),
    total_paid: amount,
  },
});

// Фінальна оплата (AWAITING_FINAL_PAYMENT → COMPLETED)
const totalPaid = (order.prepaid_amount ?? 0) + amount;
await prisma.orders.update({
  where: { id: req.params.id },
  data: {
    status: 'COMPLETED',
    final_paid_amount: amount,
    final_paid_at: new Date(),
    total_paid: totalPaid,
    client_paid: true,
  },
});
```

### 2.5 Автоматична нумерація замовлень

```typescript
// server/src/router/orders.router.ts
async function generateOrderNumber(companyId: string): Promise<string> {
  const today = new Date();
  const ds = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const prefix = `ORD-${ds}-`;
  const last = await prisma.orders.findFirst({
    where: { company_id: companyId, order_number: { startsWith: prefix } },
    orderBy: { order_number: 'desc' },
    select: { order_number: true },
  });
  let seq = 1;
  if (last) {
    const tail = last.order_number.replace(prefix, '');
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`; // напр. ORD-20260429-0001
}
```

---

## 3. Інтеграція із зовнішніми API

### 3.1 Архітектура сервісу ринкових даних

Сервіс `market-data.service.ts` агрегує два зовнішні джерела та зберігає дані у PostgreSQL. Планувальник запускає оновлення двічі на день.

```typescript
// server/src/services/market-data.service.ts
export function startMarketDataScheduler(): void {
  // Запуск о 08:00 та 18:00 за київським часом (TZ=Europe/Kiev в .env)
  cron.schedule('0 8,18 * * *', async () => {
    console.log('[market-data] Scheduled fetch started');
    await fetchAllMarketData();
  });
}

export async function fetchAllMarketData(): Promise<{ exchange: boolean; fuel: boolean }> {
  const result = { exchange: false, fuel: false };

  await fetchExchangeRates()
    .then(() => { result.exchange = true; })
    .catch((err) => console.error('[market-data] Exchange rates fetch failed:', err.message));

  await fetchFuelPricesFromAutoRia()
    .then(() => { result.fuel = true; })
    .catch((err) => console.warn('[market-data] Fuel prices auto-fetch skipped:', err.message));

  return result;
}
```

### 3.2 НБУ API — курси валют

Офіційний безкоштовний API Національного банку України повертає масив об'єктів з курсами. Система відстежує 5 валют: USD, EUR, PLN, GBP, CHF.

```typescript
// server/src/services/market-data.service.ts
interface NbuRate {
  r030: number;
  txt: string;
  rate: number;   // курс до гривні
  cc: string;     // код валюти (ISO 4217)
  exchangedate: string;
}

const TRACKED_CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'];

async function fetchExchangeRates(): Promise<void> {
  const response = await axios.get<NbuRate[]>(
    'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json',
    { timeout: 10_000 },
  );

  const filtered = response.data.filter((r) => TRACKED_CURRENCIES.includes(r.cc));
  if (filtered.length === 0) throw new Error('NBU API returned empty data');

  await prisma.exchange_rates.createMany({
    data: filtered.map((r) => ({ currency: r.cc, rate: r.rate })),
  });

  console.log(`[market-data] Exchange rates saved: ${filtered.map((r) => `${r.cc}=${r.rate}`).join(', ')}`);
}
```

### 3.3 auto.ria.com — ціни на пальне (веб-скрапінг)

Оскільки публічного API для цін на пальне не існує, система парсить HTML-сторінку auto.ria.com для конкретного регіону (за замовчуванням — Київ).

```typescript
// server/src/services/market-data.service.ts
const FUEL_SLUG_MAP: Record<string, FuelType> = {
  a95: FuelType.PETROL_95,
  a92: FuelType.PETROL_92,
  dt:  FuelType.DIESEL,
  gaz: FuelType.GAS,
};

// Регулярний вираз для парсингу рядків з цінами
const ROW_PATTERN =
  /href="https:\/\/auto\.ria\.com\/uk\/toplivo\/[^/]+\/([a-z0-9]+)\/"[^>]*>[^<]+<\/a>\s*<\/div>\s*<div class="t-cell bold size18">([0-9]+\.[0-9]+|-)<\/div>/g;

async function fetchFuelPricesFromAutoRia(): Promise<void> {
  const region = process.env.AUTORIA_REGION ?? 'kiev';
  const url = `https://auto.ria.com/uk/toplivo/${region}/`;

  const response = await axios.get<string>(url, {
    timeout: 10_000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; COLOS-CRM/1.0; +https://colos.ua)',
      'Accept-Language': 'uk-UA,uk;q=0.9',
    },
  });

  const entries: Array<{ fuel_type: FuelType; price: number; source: string }> = [];
  const seen = new Set<FuelType>();
  let match: RegExpExecArray | null;
  ROW_PATTERN.lastIndex = 0;

  while ((match = ROW_PATTERN.exec(response.data)) !== null) {
    const slug = match[1];
    const rawPrice = match[2];
    const fuelType = FUEL_SLUG_MAP[slug];

    if (!fuelType) continue;         // пропускаємо a100, a95plus тощо
    if (seen.has(fuelType)) continue; // беремо тільки перший (середній) збіг
    if (rawPrice === '-') continue;   // ціна недоступна

    const price = parseFloat(rawPrice);
    if (isNaN(price) || price <= 0) continue;

    entries.push({ fuel_type: fuelType, price, source: `auto.ria.com/toplivo/${region}` });
    seen.add(fuelType);
  }

  if (entries.length === 0) {
    throw new Error(`auto.ria.com: no fuel prices found for region "${region}"`);
  }

  await prisma.fuel_prices.createMany({ data: entries });
}
```

### 3.4 Ручне введення цін на пальне

Якщо автоматичний скрапінг недоступний, адміністратор може ввести ціни вручну через API:

```typescript
// server/src/services/market-data.service.ts
export async function saveFuelPricesManually(
  prices: FuelPriceInput,
  source = 'manual',
): Promise<void> {
  const map: Array<[FuelType, number | undefined]> = [
    [FuelType.DIESEL,    prices.diesel],
    [FuelType.PETROL_95, prices.petrol_95],
    [FuelType.PETROL_92, prices.petrol_92],
    [FuelType.GAS,       prices.gas],
  ];

  const entries = map
    .filter(([, price]) => price !== undefined && price > 0)
    .map(([fuel_type, price]) => ({ fuel_type, price: price!, source }));

  if (entries.length === 0) throw new Error('No valid prices provided');
  await prisma.fuel_prices.createMany({ data: entries });
}
```

### 3.5 REST-ендпоінти ринкових даних

```typescript
// server/src/router/market-data.router.ts
marketDataRouter.use(requireAuth); // всі ендпоінти захищені

// GET /api/market-data/exchange-rates          — останній курс кожної валюти
// GET /api/market-data/exchange-rates/history  — ?currency=USD&limit=30
// GET /api/market-data/fuel-prices             — останні ціни по кожному типу
// GET /api/market-data/fuel-prices/history     — ?type=DIESEL&limit=30
// POST /api/market-data/fuel-prices            — ручне введення цін
// POST /api/market-data/fetch                  — примусовий запуск оновлення
```

---

## 4. Real-time оновлення (Socket.io)

### 4.1 Ініціалізація сервера

Socket.io-сервер ініціалізується поверх HTTP-сервера Express. CORS налаштовується з того ж джерела, що й REST API.

```typescript
// server/src/services/socket.ts
let io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN ? [env.CLIENT_ORIGIN] : true,
      credentials: true,
    },
  });
  ...
  return io;
}
```

### 4.2 JWT-авторизація WebSocket-з'єднань

Кожне Socket.io-з'єднання проходить ту ж JWT-перевірку, що й HTTP-запити. Токен передається через `socket.handshake.auth.token`.

```typescript
// server/src/services/socket.ts
io.use((socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload = verifyAccessToken(token);
    socket.data.companyId = payload.company_id;
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
```

### 4.3 Мультитенантна ізоляція через кімнати

Після успішної автентифікації сокет автоматично вступає у дві кімнати — компанії та користувача. Це забезпечує ізоляцію між різними компаніями (мультитенантність).

```typescript
// server/src/services/socket.ts
io.on('connection', (socket) => {
  const companyId = socket.data.companyId as string;
  socket.join(`company:${companyId}`); // кімната компанії
  socket.join(`user:${socket.data.userId as string}`); // кімната користувача

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});
```

### 4.4 Emit-функції

```typescript
// server/src/services/socket.ts

/** Зміна статусу замовлення → всі сокети компанії */
export function emitOrderStatusChanged(
  companyId: string,
  data: { orderId: string; orderNumber: string; newStatus: string; previousStatus: string },
): void {
  io?.to(`company:${companyId}`).emit('order:statusChanged', data);
}

/** Створення / оновлення / видалення замовлення → всі сокети компанії */
export function emitOrderUpdated(
  companyId: string,
  data: { orderId: string; orderNumber: string; action: 'created' | 'updated' | 'deleted' },
): void {
  io?.to(`company:${companyId}`).emit('order:updated', data);
}

/** Персональне сповіщення → конкретний користувач */
export function emitNotification(userId: string, payload: NotificationPayload): void {
  io?.to(`user:${userId}`).emit('notification', payload);
}
```

### 4.5 Інтеграція у бізнес-логіку замовлень

Real-time події автоматично відправляються при кожній зміні стану замовлення:

```typescript
// server/src/router/orders.router.ts — POST / (створення)
emitOrderUpdated(companyId, {
  orderId: created.id,
  orderNumber: created.order_number,
  action: 'created',
});

// PATCH /:id/status (зміна статусу)
emitOrderStatusChanged(companyId, {
  orderId: updated.id,
  orderNumber: updated.order_number,
  newStatus: finalStatus,
  previousStatus: existing.status,
});

// DELETE /:id (видалення)
emitOrderUpdated(companyId, {
  orderId: req.params.id,
  orderNumber: existing.order_number,
  action: 'deleted',
});
```

### 4.6 Ланцюжок статусів замовлення з real-time переходами

```
NEW → CONFIRMED → DRIVER_ACCEPTED → AWAITING_PREPAYMENT
    → PREPAID → IN_TRANSIT → DELIVERED* → AWAITING_FINAL_PAYMENT → COMPLETED
```

\* При переході `IN_TRANSIT → DELIVERED` система автоматично переводить замовлення у `AWAITING_FINAL_PAYMENT` та фіксує час доставки. Кожен перехід супроводжується Socket.io-подією `order:statusChanged` та персональними сповіщеннями через `order:notification`.

### 4.7 Сповіщення, пов'язані з real-time подіями

| Подія | Отримувачі | Канали |
|-------|-----------|--------|
| Замовлення підтверджено (`CONFIRMED`) | Водій | Socket + Email |
| Водій прийняв рейс (`DRIVER_ACCEPTED`) | Менеджер | Socket |
| Аванс отримано (`PREPAID`) | Менеджер + Водій | Socket |
| Замовлення завершено (`COMPLETED`) | Менеджер + ADMIN-и | Socket |
| Статус `IN_TRANSIT` / `DELIVERED` | Клієнт | Email |

---

## Підсумок архітектурних рішень

| Підсистема | Технологія | Ключові особливості |
|------------|-----------|---------------------|
| Авторизація | JWT (access + refresh) + bcrypt | httpOnly-кука для refresh token, мультитенантний `company_id` у payload |
| Middleware | Express chain: `requireAuth → authorize → validate` | Розділення автентифікації, авторизації та валідації |
| Захист | Helmet + Rate Limiting | 300 req/15 хв загально, 20 req/15 хв для auth |
| Валідація | Zod | Схеми компілюються у TypeScript-типи |
| Розрахунок вартості | `computeFinancials()` | Автоматичний перерахунок при будь-якій зміні полів |
| Зовнішні API | НБУ (офіційний JSON API) + auto.ria.com (скрапінг) | Cron 08:00/18:00, fallback на ручне введення |
| Real-time | Socket.io + JWT-middleware | Кімнати `company:{id}` + `user:{id}` для мультитенантної ізоляції |
