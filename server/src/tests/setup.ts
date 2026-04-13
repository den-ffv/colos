// Встановлюємо тестові env-змінні до імпорту будь-яких модулів
process.env.JWT_ACCESS_SECRET = 'test_access_secret_minimum_32_chars!!';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_minimum_32_chars!';
process.env.NODE_ENV = 'test';
// Redis не потрібен у тестах — заглушки не кидатимуть помилок
process.env.REDIS_URL = 'redis://localhost:9999'; // навмисно неіснуючий порт
