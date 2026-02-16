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

async function requestJson<TResponse>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown; method: string },
): Promise<TResponse> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl).toString();
  const headers = new Headers(init?.headers);
  const hasBody = init.body !== undefined && init.body !== null && init.method !== 'GET' && init.method !== 'HEAD';
  if (hasBody && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(url, {
    ...init,
    headers,
    body: hasBody ? JSON.stringify(init.body) : undefined,
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

export async function apiPostJson<TResponse>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'method' | 'body'>,
): Promise<TResponse> {
  return requestJson<TResponse>(path, { ...init, method: 'POST', body });
}

export async function apiPutJson<TResponse>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'method' | 'body'>,
): Promise<TResponse> {
  return requestJson<TResponse>(path, { ...init, method: 'PUT', body });
}

export async function apiDeleteJson<TResponse>(
  path: string,
  init?: Omit<RequestInit, 'method' | 'body'>,
): Promise<TResponse> {
  return requestJson<TResponse>(path, { ...init, method: 'DELETE' });
}

export async function apiGetJson<TResponse>(
  path: string,
  init?: Omit<RequestInit, 'method'>,
): Promise<TResponse> {
  return requestJson<TResponse>(path, { ...init, method: 'GET' });
}
