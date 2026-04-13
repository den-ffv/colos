# COLOS CRM — Diploma Project Plan

## Stack (після всіх доповнень)
**Backend:** Express · TypeScript · PostgreSQL · Prisma · Redis · JWT · Zod · Socket.io · pdf-lib · Swagger · Helmet · Rate Limiting · bcrypt  
**Frontend:** React 19 · Vite · TypeScript · Recharts · Mapbox GL · Socket.io-client  
**DevOps:** Docker Compose · GitHub Actions CI/CD  
**Testing:** Vitest

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

- [x] Redis кешування для `/api/dashboard/stats`
- [x] Vitest — інтеграційні тести (5-10 тестів)


## Прогрес

| Тиждень   |         Статус            |
|-----------|---------------------------|
| Тиждень 1 | ✅ Завершено (26.03.2026) |
| Тиждень 2 | ✅ Завершено (28.03.2026) |
| Тиждень 3 | ✅ Завершено (28.04.2026) |
