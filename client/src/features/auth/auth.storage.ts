export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

const STORAGE_KEY = 'colos.auth.tokens';

export function getAuthTokens(): AuthTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export function setAuthTokens(tokens: AuthTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearAuthTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}

