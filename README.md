# Colos fullstack (Express + React + Postgres)

## Структура

- server – бекенд на Node.js, Express, TypeScript, Prisma (Postgres)
- client – фронтенд на React + TypeScript (Vite)

## Локальний запуск без Docker

1. Встановити залежності

```bash
cd server && npm install
cd ../client && npm install
```

2. Налаштувати .env для server (за бажанням)

Створи файл `server/.env` на основі `server/.env.example` і за потреби зміни `DATABASE_URL`.

3. Запуск серверу

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

4. Запуск клієнта

В іншому терміналі:

```bash
cd client
npm run dev
```

## Запуск з кореня проєкту

З кореня (`colos`):

```bash
npm run dev:server   # запустить сервер
npm run dev:client   # запустить клієнт
```

(попередньо все одно потрібно виконати `npm install` в `server` та `client`).

## Запуск через Docker

Переконайся, що Docker запущений.

З кореня проєкту:

```bash
docker compose up --build
```

Це підніме:

- Postgres (порт 5432)
- бекенд на порту 4000
- фронтенд (Vite preview) на порту 5173

Після запуску відкрий у браузері:

- клієнт: http://localhost:5173
- бекенд health: http://localhost:4000/health

Prisma в контейнері серверу застосує міграції при старті (`prisma migrate deploy`).
