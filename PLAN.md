# COLOS CRM — Diploma Project Plan

## Stack (після всіх доповнень)
**Backend:** Express · TypeScript · PostgreSQL · Prisma · Redis · JWT · Zod · Socket.io · pdf-lib · Swagger · Helmet · Rate Limiting · bcrypt  
**Frontend:** React 19 · Vite · TypeScript · Recharts · Mapbox GL · Socket.io-client  
**DevOps:** Docker Compose · GitHub Actions CI/CD  
**Testing:** Vitest  
**External APIs:** Fuel price API · Exchange rate API (НБУ)

---

## Тиждень 1 — База та аналітика

- [x] Carriers page (frontend) — сторінка управління перевізниками
- [x] Recharts на Dashboard (frontend) — графіки на основі існуючих backend даних
- [x] Zod валідація на всіх routes (backend) — schemas для всіх endpoints

## Тиждень 2 — Real-time та документи

- [x] Socket.io — real-time оновлення статусів замовлень (backend + frontend)
- [x] PDF генерація накладної — endpoint `/api/orders/:id/pdf`
- [x] Rate limiting (express-rate-limit) + Helmet (security headers)

## Тиждень 3 — Якість та DevOps

- [x] Redis кешування для `/api/dashboard/stats` та `/api/dashboard/summary`
- [x] Vitest — інтеграційні тести (12 тестів)
- [x] Винесення `app.ts` окремо від `index.ts` (для тестування без запуску сервера)

---

## Тиждень 4 — Ролі та права доступу

### Мета
Реалізувати чіткі ролі з різними правами: кожен тип користувача бачить і може робити тільки те, що йому дозволено.

### Ролі

| Роль | Що може |
|------|---------|
| **ADMIN** | Повний доступ: всі сторінки, всі дії, управління користувачами |
| **LOGIST** | Створювати/редагувати клієнтів та договори (замовлення). Не бачить фінансів. |
| **DRIVER** | Бачить тільки договори, призначені на нього. Може змінювати статус договору. |
| **MANAGER** | Додає нових водіїв та транспортні засоби. Бачить список договорів (без редагування). |

### Завдання

- [x] **Backend — Guards для кожної ролі**  
  `GET /api/orders` — ADMIN, LOGIST, MANAGER · `POST/PUT` — ADMIN, LOGIST  
  `PATCH /status` — ADMIN, LOGIST, DRIVER (тільки своє) · `GET /my` — DRIVER  
  `POST/PUT /drivers`, `/vehicles` — ADMIN, MANAGER · `POST/PUT /clients` — ADMIN, LOGIST

- [x] **Backend — Prisma: LOGIST та DRIVER у Role enum + `user_id` на Driver**  
  Міграція `20260413000001_add_logist_driver_roles_and_driver_user_link`

- [x] **Frontend — Role-based навігація**  
  `CrmShell` показує меню залежно від ролі. Badge з назвою ролі у topbar.

- [x] **Frontend — Driver Portal**  
  `DriverPortal.tsx` — список своїх договорів, зміна статусу (CONFIRMED→IN_TRANSIT→DELIVERED), без фінансів.

---

## Тиждень 5 — Геолокація водія

### Мета
Показувати на карті поточне місцезнаходження водія в реальному часі під час виконання замовлення.

### Архітектура
- Водій (браузер/телефон) → `socket.io` emits `driver:location` (lat, lng, orderId)  
- Сервер → зберігає останню позицію у Redis (TTL 5 хв), broadcast у кімнату замовлення  
- Менеджер/Адмін → підписується на `driver:location` для конкретного замовлення → оновлення маркера на Mapbox

### Завдання

- [ ] **Backend — Socket.io event `driver:location`**  
  Сервер приймає `{ orderId, lat, lng }` від DRIVER-сокету, зберігає у Redis:  
  `driver:location:{driverId}` → `{ lat, lng, orderId, updatedAt }`  
  Broadcast: `order:{orderId}:driver-location` у кімнату замовлення.

- [ ] **Backend — `GET /api/drivers/:id/location`**  
  Читає поточну позицію водія з Redis. Повертає `null` якщо старше 5 хвилин.

- [ ] **Frontend — Трекінг у Driver Portal**  
  Якщо договір у статусі IN_TRANSIT, кнопка "Надіслати моє місцезнаходження" (Geolocation API) → emit на сокет кожні 30 секунд.

- [ ] **Frontend — Карта замовлення з маркером водія**  
  На сторінці деталей договору: Mapbox карта з маршрутом (pickup → delivery) + рухомий маркер водія, що оновлюється через socket.

---

## Тиждень 6 — Детальний розрахунок вартості

### Мета
При створенні/редагуванні договору автоматично розраховувати повну вартість поїздки з урахуванням актуальних цін на пальне та курсу валют.

### Зовнішні API
- **Курс валют:** НБУ API `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json` (USD/EUR → UAH)
- **Ціни на пальне:** auto.ria.com HTML scraper `https://auto.ria.com/uk/toplivo/{region}/` (середня ціна по регіону)

### Формула розрахунку
```
відстань_км    → Mapbox Directions API (вже підключено)
витрата_л/100  → параметр авто (поле на Vehicle)
ціна_пального  → з API (UAH/літр, кешується 1 год)
вартість_пального = (відстань_км / 100) * витрата_л100 * ціна_UAH
зарплата_водія  → погодинна ставка * час_в_дорозі (або фіксована)
загальна_собівартість = вартість_пального + зарплата + інші_витрати
маржа = клієнтська_ціна - загальна_собівартість
```

### Завдання

- [x] **Backend — `GET /api/prices/fuel`**  
  Реалізовано як `/api/market-data/fuel-prices` (latest + history). Ціни беруться з auto.ria.com HTML scraper, кешуються у БД.

- [x] **Backend — `GET /api/prices/exchange`**  
  Реалізовано як `/api/market-data/exchange-rates` (latest + history). Дані НБУ API (USD/EUR/PLN/GBP/CHF), кешуються у БД.

- [x] **Backend — поля на Vehicle**  
  Поля `fuel_consumption` (Float?, л/100 км) та `fuel_type` (FuelType?) вже додані до моделі `Vehicle` у схемі Prisma.

- [x] **Frontend — Калькулятор у формі договору**  
  При виборі авто з `fuel_consumption` + маршруту з відомою відстанню → автоматичний розрахунок `estimatedFuelCost`.  
  Формула: `(distanceKm / 100) * fuelConsumption * fuelPrice`. Значення можна вручну відкоригувати.  
  Зелений badge "авто" та підказка з деталями розрахунку.

- [x] **Frontend — Відображення курсу валют**  
  Topbar CrmShell показує USD/EUR (з НБУ API), оновлення раз на годину через polling.

---

## Тиждень 7 — UX: Інтерактивна карта та оптимізація форми договору

### Мета
Зробити карту повністю інтерактивною та суттєво спростити процес заповнення форми замовлення.

### Інтерактивна карта

- [ ] **Drag-and-drop маркерів** — переміщення точок pickup/delivery прямо на карті оновлює адресні поля у формі.
- [ ] **Вибір адреси кліком на карту** — клік на карті → reverse geocoding → заповнення поля адреси.
- [ ] **Відображення кількох маршрутів** — на сторінці "всі договори" показати маршрути активних замовлень різними кольорами.
- [ ] **Fullscreen-режим карти** — кнопка розгорнути карту на весь екран.

### Оптимізація форми договору

- [ ] **Multi-step форма (wizard)**  
  Розбити форму на 3 кроки:  
  1. Клієнт та маршрут (clientId, pickupAddress, deliveryAddress, дати)  
  2. Вантаж та виконавець (тип виконання, водій/перевізник, характеристики вантажу)  
  3. Фінанси (ціни, розрахунок собівартості, нотатки)  

- [ ] **Автозаповнення клієнта** — при виборі клієнта підтягувати його типову адресу відправлення.

- [ ] **Збереження чернетки** — форма автоматично зберігає прогрес у `localStorage` (не втрачається при перезавантаженні).

- [ ] **Шаблони договорів** — зберегти типовий договір як шаблон і створювати нові на його основі.

- [ ] **Валідація в реальному часі** — поля валідуються при виході з них (on-blur), а не тільки при сабміті.

- [ ] **Підказки-tooltip** — для складних полів (маржа, собівартість, тип виконання) додати інформаційні підказки.

---

---

## Тиждень 8 — Lifecycle договору: прийняття водієм та оплата клієнтом

### Мета
Договір після створення проходить через чіткий workflow: логіст створює → водій приймає → клієнт платить аванс → виконується доставка → клієнт платить залишок.

### Нові статуси та переходи

```
NEW → CONFIRMED (логіст підтвердив, водій призначений)
    → DRIVER_ACCEPTED (водій прийняв договір)
    → AWAITING_PREPAYMENT (система чекає авансу від клієнта)
    → PREPAID (клієнт оплатив аванс ≥ собівартості)
    → IN_TRANSIT (водій виїхав)
    → DELIVERED (водій позначив доставку)
    → AWAITING_FINAL_PAYMENT (чекає фінального платежу)
    → COMPLETED (клієнт повністю оплатив)
    → CANCELLED
```

### Завдання

#### Backend

- [ ] **Prisma migration — нові статуси**  
  Розширити `OrderStatus` enum: `DRIVER_ACCEPTED`, `AWAITING_PREPAYMENT`, `PREPAID`, `AWAITING_FINAL_PAYMENT`, `COMPLETED`.

- [ ] **`POST /api/orders/:id/accept` (DRIVER)**  
  Водій приймає договір. Перехід `CONFIRMED → DRIVER_ACCEPTED`.  
  Сервер емітить socket-подію `order:status-changed` + створює системне сповіщення для логіста.

- [ ] **`POST /api/orders/:id/request-prepayment` (LOGIST/ADMIN)**  
  Перехід `DRIVER_ACCEPTED → AWAITING_PREPAYMENT`.  
  Надсилає email-сповіщення клієнту з посиланням на сторінку оплати.

- [ ] **`POST /api/orders/:id/mark-prepaid` (ADMIN/LOGIST)**  
  Фіксує факт отримання авансу, перехід `AWAITING_PREPAYMENT → PREPAID`.  
  Поля: `prepaidAmount`, `prepaidAt`.

- [ ] **`POST /api/orders/:id/mark-final-paid` (ADMIN/LOGIST)**  
  Фіксує фінальну оплату, перехід `AWAITING_FINAL_PAYMENT → COMPLETED`.  
  Поля: `finalPaidAmount`, `finalPaidAt`.

- [ ] **Prisma migration — поля платежів на Order**  
  `prepaidAmount`, `prepaidAt`, `finalPaidAmount`, `finalPaidAt`, `totalPaid`.

- [ ] **Оновлення `PATCH /api/orders/:id/status` (DRIVER)**  
  `PREPAID → IN_TRANSIT`, `IN_TRANSIT → DELIVERED` → автоматичний перехід до `AWAITING_FINAL_PAYMENT`.

#### Frontend (CRM)

- [ ] **Оновлення StatusBar в OrdersPage**  
  Кнопки переходів відображаються залежно від ролі та поточного статусу.  
  Нові кнопки: "Запросити аванс", "Зафіксувати аванс", "Зафіксувати оплату".

- [ ] **Панель оплат у деталях договору**  
  Показує: аванс (сума + дата), фінальна оплата, загальна сума, залишок до оплати, відсоток покриття.

- [ ] **Driver Portal — кнопка "Прийняти договір"**  
  Статус `CONFIRMED` → кнопка "Прийняти". Після прийняття — статус `DRIVER_ACCEPTED`.

---

## Тиждень 9 — Клієнтський портал (окремий веб-модуль)

### Мета
Публічна веб-сторінка (окремий React SPA або нові routes у поточному Vite-проєкті), де клієнти самостійно реєструються, подають заявки на доставку та відстежують статус своїх договорів.

### Архітектура

```
client-portal/          ← новий Vite SPA або підрозділ routes у client/
  src/
    pages/
      Register.tsx      ← реєстрація нового клієнта
      Login.tsx         ← вхід клієнта (окремі JWT від внутрішніх)
      Dashboard.tsx     ← мої договори / статуси
      NewRequest.tsx    ← форма подачі заявки на доставку
      OrderStatus.tsx   ← деталі конкретного договору + трекінг
```

### Ролі та доступ

| Хто | Що може |
|-----|---------|
| **CLIENT** (новий Role enum) | Реєстрація/вхід, подача заявки, перегляд статусу своїх договорів, підтвердження оплати |
| **LOGIST/ADMIN** | Отримує заявки від клієнтів у черзі "Нові заявки", обробляє їх → створює повноцінний договір |

### Завдання

#### Backend

- [ ] **Prisma migration — роль CLIENT + таблиця ClientUser**  
  `ClientUser`: `id`, `email`, `password_hash`, `clientId` (→ Client), `createdAt`.  
  Окремі JWT-токени для клієнтського порталу (різний `audience`).

- [ ] **Auth routes для клієнтського порталу**  
  `POST /api/client-portal/auth/register` — реєстрація (створює ClientUser + Client).  
  `POST /api/client-portal/auth/login` — вхід, повертає JWT.

- [ ] **`POST /api/client-portal/requests`**  
  Клієнт подає заявку: `pickupAddress`, `deliveryAddress`, `productType`, `quantity`, `desiredDate`, `notes`.  
  Зберігається в нову таблицю `DeliveryRequest` зі статусом `PENDING`.

- [ ] **`GET /api/client-portal/requests`**  
  Список заявок поточного клієнта (по `clientId` із токена).

- [ ] **`GET /api/client-portal/orders`**  
  Список підтверджених договорів клієнта з поточним статусом.

- [ ] **`GET /api/orders/queue` (LOGIST/ADMIN)**  
  Черга необроблених заявок від клієнтів (`DeliveryRequest` зі статусом `PENDING`).

- [ ] **`POST /api/orders/from-request/:requestId` (LOGIST/ADMIN)**  
  Перетворює заявку клієнта на повноцінний договір — pre-fills форму CreateOrderPage.

#### Frontend (Клієнтський портал)

- [ ] **Окремий роутинг `/portal/*`**  
  React Router routes, недоступні для внутрішніх користувачів.

- [ ] **Сторінка реєстрації / входу клієнта**  
  Форма з валідацією, окремий localStorage-ключ для client-JWT.

- [ ] **Dashboard клієнта**  
  Список заявок та договорів. Статус у вигляді прогрес-бару (кроки lifecycle).  
  Real-time оновлення через Socket.io (кімната `client:{clientId}`).

- [ ] **Форма нової заявки**  
  Спрощена форма (без водія/авто/фінансів), AddressAutocomplete, карта маршруту.

#### Frontend (CRM — черга заявок)

- [ ] **Нова вкладка "Заявки" в CrmShell**  
  Таблиця `DeliveryRequest` зі статусом PENDING. Кнопка "Створити договір" → відкриває CreateOrderPage з pre-filled даними.

- [ ] **Badge-лічильник на вкладці "Заявки"**  
  Socket.io подія `request:new` оновлює лічильник у реальному часі.

---

## Тиждень 10 — Система сповіщень (внутрішні + email)

### Мета
Централізована система сповіщень: внутрішні (in-app bell icon) для всіх ролей CRM + email-сповіщення клієнту на ключових кроках lifecycle.

### Архітектура

```
Notification (БД)
  id, userId, type, title, body, orderId?, isRead, createdAt

NotificationService (backend)
  create(userId, payload)   → INSERT + socket.io emit → user:{userId}:notification
  markRead(id)
  getUnread(userId)
```

### Типи сповіщень

| Подія | Кому | Канал |
|-------|------|-------|
| Новий договір створено | LOGIST (автор) | In-app |
| Водій призначений на договір | DRIVER | In-app |
| Договір прийнятий водієм | LOGIST | In-app |
| Заявка від клієнта надійшла | LOGIST/ADMIN | In-app |
| Запит авансу | CLIENT | Email + In-app (портал) |
| Аванс отримано | LOGIST, DRIVER | In-app |
| Договір в дорозі | CLIENT | Email |
| Договір доставлено | CLIENT | Email |
| Запит фінальної оплати | CLIENT | Email + In-app (портал) |
| Договір завершено | LOGIST, ADMIN | In-app |

### Завдання

#### Backend

- [ ] **Prisma migration — таблиця `Notification`**  
  `id`, `userId`, `type` (enum), `title`, `body`, `orderId` (nullable FK), `isRead` (default false), `createdAt`.

- [ ] **`NotificationService`**  
  `create(userId, data)` — INSERT у БД + `socket.io.to(userId).emit('notification', payload)`.  
  `markRead(userId, ids[])` — PATCH isRead.  
  `getUnread(userId)` — SELECT WHERE isRead=false.

- [ ] **`GET /api/notifications`**  
  Повертає 50 останніх сповіщень для поточного користувача.

- [ ] **`PATCH /api/notifications/read`**  
  `{ ids: string[] }` — позначити прочитаними. `{ all: true }` — позначити всі.

- [ ] **EmailService (Nodemailer / Resend)**  
  `sendOrderStatusEmail(clientEmail, { orderNumber, status, link })`.  
  HTML-шаблон з логотипом, статусом, посиланням на портал.  
  Конфіг через `.env`: `EMAIL_FROM`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`.

- [ ] **Інтеграція NotificationService у всі lifecycle-endpoints**  
  Кожен `POST /accept`, `mark-prepaid`, `PATCH /status` тощо викликає `NotificationService.create(...)` + за потреби `EmailService.send(...)`.

#### Frontend (CRM)

- [ ] **Bell icon у topbar з лічильником непрочитаних**  
  Socket.io `notification` подія → `+1` до badge. Клік → dropdown-панель.

- [ ] **Dropdown-панель сповіщень**  
  Список останніх 20 сповіщень (title, body, час, посилання на договір).  
  Кнопка "Позначити всі прочитаними". Автоматичний `markRead` при відкритті.

- [ ] **Toast-сповіщення**  
  Нове сповіщення через сокет → короткий toast у нижньому правому куті (3 сек).

#### Frontend (Клієнтський портал)

- [ ] **Панель сповіщень на Dashboard клієнта**  
  Аналогічна CRM-панелі, але спрощена. Email-підтвердження при реєстрації.

---

## Прогрес

| Тиждень   | Статус |
|-----------|--------|
| Тиждень 1 | ✅ Завершено (26.03.2026) |
| Тиждень 2 | ✅ Завершено (28.03.2026) |
| Тиждень 3 | ✅ Завершено (13.04.2026) |
| Тиждень 4 — Ролі | ✅ Завершено (13.04.2026) |
| Тиждень 5 — Геолокація | ⏳ Не розпочато |
| Тиждень 6 — Розрахунок вартості | ✅ Завершено (18.04.2026) |
| Тиждень 7 — UX / Форма | ⏳ Не розпочато |
| Тиждень 8 — Lifecycle / Оплати | ⏳ Не розпочато |
| Тиждень 9 — Клієнтський портал | ⏳ Не розпочато |
| Тиждень 10 — Система сповіщень | ⏳ Не розпочато |
