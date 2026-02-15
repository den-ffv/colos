export function getApiBaseUrl(): string {
  const fromEnv = (import.meta.env as unknown as Record<string, string | undefined>).VITE_API_URL;
  return (fromEnv && fromEnv.trim()) || 'http://localhost:4000';
}
