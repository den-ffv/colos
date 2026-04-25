import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let _client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_client) {
    _client = new Redis(REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    _client.on('error', (err: Error) => {
      // Fail silently — Redis is optional (cache-aside pattern)
      console.warn('[Redis] Connection error:', err.message);
    });
  }
  return _client;
}

/** Get cached JSON value. Returns null on miss or any Redis error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedisClient().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Store a value as JSON with an optional TTL (seconds). Fails silently. */
export async function cacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  try {
    await getRedisClient().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Fail silently
  }
}

/** Delete all keys matching a glob pattern. Fails silently. */
export async function cacheDel(pattern: string): Promise<void> {
  try {
    const keys = await getRedisClient().keys(pattern);
    if (keys.length > 0) await getRedisClient().del(...keys);
  } catch {
    // Fail silently
  }
}

export async function disconnectRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
