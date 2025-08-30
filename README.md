# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

# 

<!-- Logo placeholder - добавте сюда логотип проекта -->

# Colos - Logistics Platform

> **Дипломна робота** - Система управління логістикою

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/den-ffv/colos)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.1-blue)](https://reactjs.org/)

## 📋 Про проект

Colos — це сучасна веб-платформа для управління логістичними процесами, розроблена як дипломна робота. Система забезпечує комплексне рішення для планування, відстеження та оптимізації логістичних операцій.

### ✨ Основні можливості

- 🚚 **Управління перевезеннями** - планування та відстеження маршрутів
- 📦 **Облік вантажів** - контроль завантаження та розвантаження
- 👥 **Система користувачів** - різні ролі та права доступу
- 📊 **Аналітика та звіти** - детальна статистика операцій
- 🔔 **Уведомлення** - real-time оновлення статусів
- 📱 **Адаптивний дизайн** - працює на всіх пристроях

## 🚀 Технології

### Frontend
- **React 19** - користувацький інтерфейс
- **TypeScript** - типізація
- **Vite** - збирач проекту
- **Ant Design** - UI компоненти
- **Redux Toolkit** - управління станом
- **React Query** - кешування даних

### Backend
- **Node.js** - серверна частина
- **Express** - веб-фреймворк
- **TypeScript** - типізація
- **Zod** - валідація даних
- **Pino** - логування

### DevOps
- **Docker** - контейнеризація
- **Docker Compose** - оркестрація
- **pnpm** - менеджер пакетів
- **ESLint** - лінтинг коду
- **Vitest** - тестування

## 🛠️ Швидкий старт

### Вимоги
- Node.js 22+
- pnpm 9+
- Docker (опціонально)

### Розробка

```bash
# Клонування репозиторію
git clone https://github.com/den-ffv/colos.git
cd colos

# Встановлення залежностей
pnpm install

# Запуск в режимі розробки
pnpm run dev
```

Додаток буде доступний:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000

### Docker

```bash
# Запуск з Docker
pnpm run docker:up

# Або
docker-compose up --build
```

Додаток буде доступний на http://localhost

## 📁 Структура проекту

```
├── client/          # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── server/          # Node.js backend
│   ├── src/
│   └── package.json
├── docker/          # Docker конфігурації
├── Dockerfile       # Multi-stage build
└── docker-compose.yml
```

## 🧪 Тестування

```bash
# Запуск всіх тестів
pnpm run test

# Тести клієнта
pnpm run test:client

# Тести сервера
pnpm run test:server
```

## 📦 Збірка для продакшену

```bash
# Збірка обох частин
pnpm run build

# Запуск production версії
pnpm run start
```

## 📖 Документація

- [API Documentation](docs/api.md)
- [Setup Guide](docs/setup.md)
- [Docker Guide](DOCKER.md)

## 👨‍💻 Автор

**Богдан Ч.**  
📧 bohdan.ch@example.com  
🎓 Дипломна робота, 2025

## 📄 Ліцензія

Цей проект захищений ліцензією MIT. Дивіться файл [LICENSE](LICENSE) для деталей.

---

<p align="center">
  <i>Розроблено як частина дипломної роботи</i>
</p>

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
