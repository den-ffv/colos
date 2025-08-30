# Colos Logistics Platform - Docker Setup

Цей проект містить повний стек логістичної платформи з React frontend та Node.js backend.

## Структура проекту

```
├── client/           # React frontend (Vite + TypeScript)
├── server/           # Node.js backend (Express + TypeScript)
├── docker/           # Docker конфігурації
├── Dockerfile        # Multi-stage Docker build
├── docker-compose.yml # Docker Compose конфігурація
└── package.json      # Root package.json з скриптами
```

## Запуск з Docker

### Вимоги

- Docker
- Docker Compose

### Швидкий запуск

1. **Збільшити та запустити з Docker Compose:**

   ```bash
   pnpm run docker:up
   ```

   або

   ```bash
   docker-compose up --build
   ```

2. **Запуск тільки Docker образу:**

   ```bash
   # Збудувати образ
   pnpm run docker:build

   # Запустити контейнер
   pnpm run docker:run
   ```

### Доступ до додатку

- **Frontend (React)**: http://localhost (порт 80)
- **Backend API**: http://localhost:3000
- **API через nginx proxy**: http://localhost/api/

### Архітектура контейнера

Контейнер використовує:

- **Nginx** - сервує статичні файли React додатку та проксує API запити
- **Node.js** - запускає Express сервер
- **Supervisor** - керує обома процесами

## Розробка без Docker

### Встановлення залежностей

```bash
# Root проект
pnpm install

# Клієнт
cd client && pnpm install

# Сервер
cd server && pnpm install
```

### Запуск в режимі розробки

```bash
# Запустити обидва сервіси одночасно
pnpm run dev

# Або окремо:
pnpm run dev:client  # http://localhost:5173
pnpm run dev:server  # http://localhost:3000
```

### Збірка для продакшену

```bash
pnpm run build
```

### Тестування

```bash
pnpm run test
```

## Налаштування середовища

### Server environment (.env)

Створіть файл `server/.env`:

```
NODE_ENV=development
PORT=3000
# Додайте інші змінні середовища
```

### Client environment (.env)

Створіть файл `client/.env`:

```
VITE_API_URL=http://localhost:3000
# Додайте інші змінні середовища
```

## Troubleshooting

### Docker помилки

1. Переконайтесь що Docker daemon запущений
2. Перевірте чи не використовуються порти 80 та 3000

### Проблеми з build

1. Очистіть Docker cache: `docker system prune`
2. Перезбуд образ: `docker-compose up --build --force-recreate`

### Логи

```bash
# Дивитись логи контейнера
docker-compose logs -f

# Логи окремого сервісу
docker-compose logs -f colos-app
```
