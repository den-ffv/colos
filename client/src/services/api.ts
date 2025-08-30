import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true,
});

// приклад хелпера
export async function getHealth() {
  const r = await api.get('/api/health');
  return r.data;
}
