import { useState, useEffect, useCallback } from 'react';
import type { AuthTokens } from '../auth/auth.storage';

export type UserRole = 'ADMIN' | 'MANAGER' | 'DISPATCHER' | 'ACCOUNTANT' | 'LOGIST' | 'DRIVER';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: UserRole[];
  driverProfile: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  roles: UserRole[];
  driverId?: string;
}

export interface UpdateUserPayload {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  roles?: UserRole[];
  driverId?: string | null;
}

function authHeaders(tokens: AuthTokens): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokens.accessToken}`,
  };
}

export function useUsers(tokens: AuthTokens, onUnauthorized: () => void) {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (search = '', page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20', search });
        const res = await fetch(`/api/users?${params}`, { headers: authHeaders(tokens) });
        if (res.status === 401) { onUnauthorized(); return; }
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Failed to load users');
        setUsers(json.data);
        setTotal(json.pagination.total);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [tokens, onUnauthorized],
  );

  const createUser = useCallback(
    async (payload: CreateUserPayload): Promise<UserDto> => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { onUnauthorized(); throw new Error('Unauthorized'); }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create user');
      return json.data as UserDto;
    },
    [tokens, onUnauthorized],
  );

  const updateUser = useCallback(
    async (id: string, payload: UpdateUserPayload): Promise<UserDto> => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: authHeaders(tokens),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { onUnauthorized(); throw new Error('Unauthorized'); }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to update user');
      return json.data as UserDto;
    },
    [tokens, onUnauthorized],
  );

  const toggleStatus = useCallback(
    async (id: string): Promise<UserDto> => {
      const res = await fetch(`/api/users/${id}/status`, {
        method: 'PATCH',
        headers: authHeaders(tokens),
      });
      if (res.status === 401) { onUnauthorized(); throw new Error('Unauthorized'); }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to toggle status');
      return json.data as UserDto;
    },
    [tokens, onUnauthorized],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, total, loading, error, fetchUsers, createUser, updateUser, toggleStatus };
}
