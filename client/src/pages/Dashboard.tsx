import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../services/api';

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['health'], queryFn: getHealth });
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Дашборд</h1>
      <div className="text-gray-600">Статус API: {isLoading ? '...' : JSON.stringify(data)}</div>
    </div>
  );
}
