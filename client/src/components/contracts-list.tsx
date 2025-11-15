import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  FileText,
  MapPin,
  Calendar,
  Users,
  Phone,
  Search,
  Eye,
  Plus,
  Download,
  MoreHorizontal,
  Clock,
  Navigation
} from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const [statusFilter, setStatusFilter] = useState('all');

  // Тестові дані для демонстрації
  const mockContracts = useMemo(() => [
    {
      id: '1',
      customer_name: 'Іван Петренко',
      customer_phone: '+380501234567',
      departure_point: {
        address: 'вул. Хрещатик, 1, Київ, Україна',
        coordinates: [30.5234, 50.4501] as [number, number]
      },
      destination_point: {
        address: 'пл. Ринок, 1, Львів, Львівська область, Україна',
        coordinates: [24.0315, 49.8419] as [number, number]
      },
      departure_date: '2024-12-15',
      departure_time: '09:00',
      passenger_count: 4,
      status: 'new',
      created_at: '2024-11-03',
      route_data: {
        distance: 540000,
        duration: 19800
      }
    },
    {
      id: '2',
      customer_name: 'Марія Іванова',
      customer_phone: '+380671234567',
      departure_point: {
        address: 'Дерибасівська вул., 1, Одеса, Одеська область, Україна',
        coordinates: [30.7326, 46.4825] as [number, number]
      },
      destination_point: {
        address: 'пл. Свободи, 4, Харків, Харківська область, Україна',
        coordinates: [36.2310, 49.9935] as [number, number]
      },
      departure_date: '2024-12-20',
      departure_time: '14:30',
      passenger_count: 2,
      status: 'in_progress',
      created_at: '2024-11-02',
      route_data: {
        distance: 480000,
        duration: 17400
      }
    },
    {
      id: '3',
      customer_name: 'Олексій Коваленко',
      customer_phone: '+380931234567',
      departure_point: {
        address: 'вул. Соборна, 15, Дніпро, Дніпропетровська область, Україна',
        coordinates: [35.0462, 48.4647] as [number, number]
      },
      destination_point: {
        address: 'просп. Науки, 9, Київ, Україна',
        coordinates: [30.5234, 50.4501] as [number, number]
      },
      departure_date: '2024-12-18',
      departure_time: '11:15',
      passenger_count: 1,
      status: 'completed',
      created_at: '2024-11-01',
      route_data: {
        distance: 480000,
        duration: 17100
      }
    }
  ], []);

  const fetchContracts = useCallback(async (search: string = '') => {
    setLoading(true);
    try {
      // Тимчасово використовуємо тестові дані
      setTimeout(() => {
        let filteredContracts = mockContracts;

        if (statusFilter !== 'all') {
          filteredContracts = mockContracts.filter(c => c.status === statusFilter);
        }

        if (search) {
          filteredContracts = filteredContracts.filter(c =>
            c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
            c.customer_phone.includes(search) ||
            c.departure_point.address.toLowerCase().includes(search.toLowerCase()) ||
            c.destination_point.address.toLowerCase().includes(search.toLowerCase())
          );
        }

        setContracts(filteredContracts);
        setTotalPages(Math.ceil(filteredContracts.length / 10));
        setLoading(false);
      }, 500);

      /* Реальний API запит - розкоментуйте коли API буде готове
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10'
      });

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (search) {
        params.append('search', search);
      }

      const response = await fetch(`/api/contracts?${params}`);
      if (response.ok) {
        const result = await response.json();
        setContracts(result.data);
        setTotalPages(result.pagination.pages);
      } else {
        console.error('Error fetching contracts');
      }
      */
    } catch (error) {
      console.error('Error fetching contracts:', error);
      setLoading(false);
    }
  }, [statusFilter, mockContracts]);

  useEffect(() => {
    fetchContracts(searchTerm);
  }, [currentPage, searchTerm, statusFilter, fetchContracts]);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchContracts(searchTerm);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    return timeString;
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

  const getStatusBadge = (status: string) => {
    const variant = statusColors[status] || statusColors.new;
    const label = statusLabels[status] || status;

    return (
      <Badge className={`${variant} px-2 py-0.5 text-xs`}>
        {label}
      </Badge>
    );
  };

  return (
    <div className="flex-1 space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Договори перевезення
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Управління та перегляд всіх договорів перевезення
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm">
            <Link to={'/contract'}>
            <Plus className="h-4 w-4 mr-1" />
            Новий договір
            </Link>
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Експорт
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Пошук за клієнтом, телефоном..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={loading} size="sm">
                Пошук
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* <Filter className="h-4 w-4 text-gray-500" /> */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Всі статуси</option>
                <option value="new">Нові</option>
                <option value="in_progress">В роботі</option>
                <option value="completed">Завершені</option>
                <option value="cancelled">Скасовані</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <span>Список договорів</span>
            <span className="text-xs font-normal text-muted-foreground">
              {loading ? 'Завантаження...' : `Всього: ${contracts.length} договорів`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm">Завантаження договорів...</span>
              </div>
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-base font-medium text-gray-900 mb-2">Договори не знайдено</h3>
                <p className="text-gray-500 mb-4 text-sm">Створіть перший договір для початку роботи</p>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Створити договір
                </Button>
              </div>
          ) : (
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[40px] h-10 text-xs">#</TableHead>
                        <TableHead className="h-10 text-xs">Клієнт</TableHead>
                        <TableHead className="h-10 text-xs">Маршрут</TableHead>
                        <TableHead className="h-10 text-xs">Дата і час</TableHead>
                        <TableHead className="h-10 text-xs">Пасажири</TableHead>
                        <TableHead className="h-10 text-xs">Статус</TableHead>
                        <TableHead className="h-10 text-xs">Деталі поїздки</TableHead>
                        <TableHead className="text-right h-10 text-xs">Дії</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((contract, index) => (
                        <TableRow key={contract.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium text-gray-500 text-xs py-2">
                            {(currentPage - 1) * 10 + index + 1}
                          </TableCell>

                          <TableCell className="py-2">
                            <div className="space-y-1">
                              <div className="font-medium text-sm">{contract.customer_name}</div>
                              <div className="flex items-center text-xs text-gray-500">
                                <Phone className="h-3 w-3 mr-1" />
                                {contract.customer_phone}
                              </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        <div className="space-y-1 max-w-xs">
                          <div className="flex items-start gap-1">
                            <MapPin className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-xs truncate" title={contract.departure_point.address}>
                              {contract.departure_point.address}
                            </span>
                          </div>
                          <div className="flex items-start gap-1">
                            <MapPin className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                            <span className="text-xs truncate" title={contract.destination_point.address}>
                              {contract.destination_point.address}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        <div className="space-y-1">
                          <div className="flex items-center text-xs">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(contract.departure_date)}
                          </div>
                          <div className="flex items-center text-xs text-gray-500">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatTime(contract.departure_time)}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        <div className="flex items-center">
                          <Users className="h-3 w-3 mr-1 text-gray-500" />
                          <span className="font-medium text-sm">{contract.passenger_count}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-2">
                        {getStatusBadge(contract.status)}
                      </TableCell>

                      <TableCell className="py-2">
                        {contract.route_data ? (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center">
                              <Navigation className="h-3 w-3 mr-1 text-blue-500" />
                              {formatDistance(contract.route_data.distance)}
                            </div>
                            <div className="flex items-center text-gray-500">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDuration(contract.route_data.duration)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Немає даних</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Сторінка {currentPage} з {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Попередня
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Наступна
            </Button>
          </div>
        </div>
      )}
    </div>
) };