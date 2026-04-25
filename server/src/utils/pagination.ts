export function parsePage(value: unknown, defaultValue = 1) {
  const n = typeof value === 'string' ? Number(value) : defaultValue;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : defaultValue;
}

export function parseLimit(value: unknown, defaultValue = 20, max = 100) {
  const n = typeof value === 'string' ? Number(value) : defaultValue;
  const safe = Number.isFinite(n) && n >= 1 ? Math.floor(n) : defaultValue;
  return Math.min(safe, max);
}

export function parseSortOrder(value: unknown): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

