export type ApiResponse<T> = { success: true; data: T } | { success: false; message: string; details?: unknown };

export type ApiListResponse<T> =
  | { success: true; data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
  | { success: false; message: string; details?: unknown };

export function isApiSuccess<T>(res: ApiResponse<T>): res is { success: true; data: T } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true;
}

export function unwrapApi<T>(res: ApiResponse<T>): T {
  if (isApiSuccess(res)) return res.data;
  throw new Error(res.message);
}

