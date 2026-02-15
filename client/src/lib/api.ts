import { getApiBaseUrl } from './env';

export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text ? { message: text } : null;
}

export async function apiPostJson<TResponse>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'method' | 'body'>,
): Promise<TResponse> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl).toString();
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(url, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await readResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'message' in data && typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Request failed (${response.status})`;
    const error: ApiError = { status: response.status, message, details: data };
    throw error;
  }

  return data as TResponse;
}
