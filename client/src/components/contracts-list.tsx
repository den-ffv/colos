import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { FileText, MapPin, Calendar, Users, Phone, Search, Eye } from 'lucide-react';

interface Contract {
  id: string;
  customer_name: string;
  customer_phone: string;
  departure_point: {
    address: string;
    coordinates: [number, number];
  };
  destination_point: {
    address: string;
    coordinates: [number, number];
  };
  departure_date: string;
  departure_time: string;
  passenger_count: number;
  status: string;
  created_at: string;
  route_data?: {
    distance: number;
    duration: number;
  };
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusLabels: Record<string, string> = {
  new: 'Новий',
  in_progress: 'В роботі',
  completed: 'Завершено',
  cancelled: 'Скасовано'
};

export default function ContractsList() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchContracts = async (page: number = 1, search: string = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10'
      });

      const response = await fetch(`/api/contracts?${params}`);
      if (response.ok) {
        const result = await response.json();
        setContracts(result.data);
        setTotalPages(result.pagination.pages);
      } else {
        console.error('Error fetching contracts');
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts(currentPage, searchTerm);
  }, [currentPage, searchTerm]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchContracts(1, searchTerm);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('uk-UA');
  };

  const formatDistance = (meters: number) => {
    return (meters / 1000).toFixed(1) + ' км';
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}г ${minutes}хв`;
    }
    return `${minutes}хв`;
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Договори перевезення
        </h1>
        <p className="text-gray-600">Список всіх оформлених договорів</p>
      </div>

      {/* Пошук */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Input
              placeholder="Пошук за іменем клієнта або телефоном..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              Пошук
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Список договорів */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p>Завантаження...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Договори не знайдено</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            contracts.map((contract) => (
              <Card key={contract.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    {/* Інформація про клієнта */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">{contract.customer_name}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4" />
                        {contract.customer_phone}
                      </div>
                      <Badge className={statusColors[contract.status] || statusColors.new}>
                        {statusLabels[contract.status] || contract.status}
                      </Badge>
                    </div>

                    {/* Маршрут */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Відправлення:</p>
                          <p className="text-sm text-gray-600">{contract.departure_point.address}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-red-500 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Призначення:</p>
                          <p className="text-sm text-gray-600">{contract.destination_point.address}</p>
                        </div>
                      </div>
                    </div>

                    {/* Дата і час */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span className="text-sm">
                          {formatDate(contract.departure_date)} о {contract.departure_time}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span className="text-sm">{contract.passenger_count} пас.</span>
                      </div>
                      {contract.route_data && (
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Відстань: {formatDistance(contract.route_data.distance)}</p>
                          <p>Тривалість: {formatDuration(contract.route_data.duration)}</p>
                        </div>
                      )}
                    </div>

                    {/* Дії */}
                    <div className="flex flex-col justify-between">
                      <div className="text-xs text-gray-500 mb-2">
                        Створено: {formatDate(contract.created_at)}
                      </div>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        Переглянути
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Пагінація */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Попередня
          </Button>
          <span className="flex items-center px-4">
            Сторінка {currentPage} з {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Наступна
          </Button>
        </div>
      )}
    </div>
  );
}