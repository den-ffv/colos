# Multi-stage build для оптимізації розміру образу
FROM node:22-alpine AS base

# Встановлюємо pnpm глобально
RUN npm install -g pnpm

# Створюємо робочу директорію
WORKDIR /app

# Копіюємо package.json файли для встановлення залежностей
COPY package.json pnpm-lock.yaml* ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Встановлюємо залежності
RUN pnpm install --frozen-lockfile

# Стадія збірки клієнта
FROM base AS client-build
COPY client/ ./client/
WORKDIR /app/client
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# Стадія збірки сервера
FROM base AS server-build
COPY server/ ./server/
WORKDIR /app/server
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# Фінальна стадія - production образ
FROM node:22-alpine AS production

# Встановлюємо pnpm та nginx для статичних файлів
RUN npm install -g pnpm
RUN apk add --no-cache nginx supervisor

# Створюємо робочу директорію
WORKDIR /app

# Копіюємо package.json файли
COPY package.json pnpm-lock.yaml* ./
COPY server/package.json server/pnpm-lock.yaml ./server/

# Встановлюємо production залежності для сервера
WORKDIR /app/server
RUN pnpm install --prod --frozen-lockfile

# Повертаємось в root
WORKDIR /app

# Копіюємо збудований сервер
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/src ./server/src
COPY server/tsconfig.json ./server/

# Копіюємо збудований клієнт
COPY --from=client-build /app/client/dist ./client/dist

# Налаштовуємо nginx для клієнта
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Налаштовуємо supervisor для запуску обох сервісів
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Створюємо необхідні директорії
RUN mkdir -p /var/log/supervisor /run/nginx

# Відкриваємо порти
EXPOSE 80 3000

# Запускаємо supervisor який керуватиме nginx та node сервером
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
