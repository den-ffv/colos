import { useEffect, useState, useCallback } from 'react';

export type User = { id: string; type: string; language: string; roles?: string[] } | null;

export function useAuth() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  return { user, loading, refresh: fetchMe };
}
