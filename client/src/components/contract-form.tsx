import React, { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Field } from './ui/field';
import { Separator } from './ui/separator';
import { MapPin, Route, Calendar, Clock, User, Phone, AlertCircle } from 'lucide-react';
import { useFormValidation } from '../hooks/useFormValidation';

// Встановіть ваш безкоштовний токен з mapbox.com в файлі .env
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiY29sb3MtZGlwbG9tIiwiYSI6ImNsejV3eDB6ZzBqaDIybXM0OGx6ejhsZjIifQ.xxx';

interface RoutePoint {
  name: string;
  coordinates: [number, number];
  address: string;
}

interface ContractData {
  customerName: string;
  customerPhone: string;
  departurePoint: RoutePoint;
  destinationPoint: RoutePoint;
  departureDate: string;
  departureTime: string;
  passengerCount: number;
  additionalInfo: string;
}

export default function ContractForm() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const { errors, validateContract, clearError } = useFormValidation();

  const [contractData, setContractData] = useState<ContractData>({
    customerName: '',
    customerPhone: '',
    departurePoint: {
      name: '',
      coordinates: [30.5234, 50.4501], // Київ за замовчуванням
      address: ''
    },
    destinationPoint: {
      name: '',
      coordinates: [30.5234, 50.4501],
      address: ''
    },
    departureDate: '',
    departureTime: '',
    passengerCount: 1,
    additionalInfo: ''
  });

  const [markers, setMarkers] = useState<{
    departure?: mapboxgl.Marker;
    destination?: mapboxgl.Marker;
  }>({});

  const [route, setRoute] = useState<{
    distance: number;
    duration: number;
    geometry: any;
  } | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (map.current) return; // Карта вже ініціалізована

    if (mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [30.5234, 50.4501], // Київ
        zoom: 10
      });

      map.current.addControl(new mapboxgl.NavigationControl());
    }
  }, []);

  const addMarker = (coordinates: [number, number], type: 'departure' | 'destination') => {
    if (!map.current) return;

    // Видаляємо попередній маркер цього типу
    if (markers[type]) {
      markers[type]!.remove();
    }

    const color = type === 'departure' ? '#10b981' : '#ef4444';
    const marker = new mapboxgl.Marker({ color })
      .setLngLat(coordinates)
      .addTo(map.current);

    setMarkers(prev => ({
      ...prev,
      [type]: marker
    }));

    // Оновлюємо дані контракту
    setContractData(prev => ({
      ...prev,
      [`${type}Point`]: {
        ...prev[type === 'departure' ? 'departurePoint' : 'destinationPoint'],
        coordinates
      }
    }));
  };

  const getRoute = useCallback(async () => {
    if (!contractData.departurePoint.coordinates || !contractData.destinationPoint.coordinates) {
      return;
    }

    setLoading(true);
    const [startLng, startLat] = contractData.departurePoint.coordinates;
    const [endLng, endLat] = contractData.destinationPoint.coordinates;

    try {
      const query = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`,
        { method: 'GET' }
      );

      const json = await query.json();
      const data = json.routes[0];
      const routeGeoJSON = data.geometry;

      setRoute(data);

      if (map.current) {
        // Видаляємо попередній маршрут
        if (map.current.getSource('route')) {
          map.current.removeLayer('route');
          map.current.removeSource('route');
        }

        // Додаємо новий маршрут
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: routeGeoJSON
          }
        });

        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 5,
            'line-opacity': 0.75
          }
        });

        // Підганяємо вигляд карти під маршрут
        const coordinates = routeGeoJSON.coordinates;
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord: [number, number]) => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: 50 });
      }
    } catch (error) {
      console.error('Error getting route:', error);
    } finally {
      setLoading(false);
    }
  }, [contractData.departurePoint.coordinates, contractData.destinationPoint.coordinates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateContract(contractData)) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName: contractData.customerName,
          customerPhone: contractData.customerPhone,
          departurePoint: contractData.departurePoint,
          destinationPoint: contractData.destinationPoint,
          departureDate: contractData.departureDate,
          departureTime: contractData.departureTime,
          passengerCount: contractData.passengerCount,
          additionalInfo: contractData.additionalInfo,
          routeData: route
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert('Договір успішно оформлений!');
        console.log('Contract created:', result.data);

        // Очищуємо форму
        setContractData({
          customerName: '',
          customerPhone: '',
          departurePoint: {
            name: '',
            coordinates: [30.5234, 50.4501],
            address: ''
          },
          destinationPoint: {
            name: '',
            coordinates: [30.5234, 50.4501],
            address: ''
          },
          departureDate: '',
          departureTime: '',
          passengerCount: 1,
          additionalInfo: ''
        });

        // Очищуємо карту
        if (map.current) {
          if (markers.departure) markers.departure.remove();
          if (markers.destination) markers.destination.remove();
          if (map.current.getSource('route')) {
            map.current.removeLayer('route');
            map.current.removeSource('route');
          }
        }
        setMarkers({});
        setRoute(null);

      } else {
        const error = await response.json();
        alert(`Помилка: ${error.error}`);
      }
    } catch (error) {
      console.error('Error submitting contract:', error);
      alert('Помилка відправки даних. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleLocationClick = (type: 'departure' | 'destination') => {
    if (map.current) {
      map.current.once('click', (e) => {
        const { lng, lat } = e.lngLat;
        addMarker([lng, lat], type);

        // Отримуємо адресу за координатами (зворотнє геокодування)
        fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`)
          .then(response => response.json())
          .then(data => {
            const address = data.features[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            setContractData(prev => ({
              ...prev,
              [`${type}Point`]: {
                ...prev[type === 'departure' ? 'departurePoint' : 'destinationPoint'],
                address
              }
            }));
          });
      });
    }
  };

  useEffect(() => {
    if (contractData.departurePoint.coordinates && contractData.destinationPoint.coordinates) {
      getRoute();
    }
  }, [contractData.departurePoint.coordinates, contractData.destinationPoint.coordinates, getRoute]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Форма договору */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              Оформлення договору перевезення
            </CardTitle>
            <CardDescription>
              Заповніть всі необхідні дані для оформлення договору
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Дані клієнта */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Дані клієнта
                </h3>
                <Field>
                  <Label htmlFor="customerName">Ім'я клієнта</Label>
                  <Input
                    id="customerName"
                    value={contractData.customerName}
                    onChange={(e) => {
                      setContractData(prev => ({ ...prev, customerName: e.target.value }));
                      clearError('customerName');
                    }}
                    className={errors.customerName ? 'border-red-500' : ''}
                    required
                  />
                  {errors.customerName && (
                    <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.customerName}
                    </p>
                  )}
                </Field>
                <Field>
                  <Label htmlFor="customerPhone">Телефон</Label>
                  <Input
                    id="customerPhone"
                    type="tel"
                    value={contractData.customerPhone}
                    onChange={(e) => {
                      setContractData(prev => ({ ...prev, customerPhone: e.target.value }));
                      clearError('customerPhone');
                    }}
                    className={errors.customerPhone ? 'border-red-500' : ''}
                    required
                  />
                  {errors.customerPhone && (
                    <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {errors.customerPhone}
                    </p>
                  )}
                </Field>
              </div>

              <Separator />

              {/* Маршрут */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Маршрут
                </h3>

                <div className="space-y-2">
                  <Label>Пункт відправлення</Label>
                  <div className="flex gap-2">
                    <Input
                      value={contractData.departurePoint.address}
                      placeholder="Клікніть на карті або введіть адресу"
                      onChange={(e) => setContractData(prev => ({
                        ...prev,
                        departurePoint: { ...prev.departurePoint, address: e.target.value }
                      }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleLocationClick('departure')}
                    >
                      Обрати на карті
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Пункт призначення</Label>
                  <div className="flex gap-2">
                    <Input
                      value={contractData.destinationPoint.address}
                      placeholder="Клікніть на карті або введіть адресу"
                      onChange={(e) => setContractData(prev => ({
                        ...prev,
                        destinationPoint: { ...prev.destinationPoint, address: e.target.value }
                      }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleLocationClick('destination')}
                    >
                      Обрати на карті
                    </Button>
                  </div>
                </div>

                {route && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">
                      Відстань: <span className="font-medium">{(route.distance / 1000).toFixed(1)} км</span>
                    </p>
                    <p className="text-sm text-gray-600">
                      Тривалість: <span className="font-medium">{Math.round(route.duration / 60)} хв</span>
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Час і дата */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Час відправлення
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="departureDate">Дата</Label>
                    <Input
                      id="departureDate"
                      type="date"
                      value={contractData.departureDate}
                      onChange={(e) => {
                        setContractData(prev => ({ ...prev, departureDate: e.target.value }));
                        clearError('departureDate');
                      }}
                      className={errors.departureDate ? 'border-red-500' : ''}
                      required
                    />
                    {errors.departureDate && (
                      <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {errors.departureDate}
                      </p>
                    )}
                  </Field>
                  <Field>
                    <Label htmlFor="departureTime">Час</Label>
                    <Input
                      id="departureTime"
                      type="time"
                      value={contractData.departureTime}
                      onChange={(e) => {
                        setContractData(prev => ({ ...prev, departureTime: e.target.value }));
                        clearError('departureTime');
                      }}
                      className={errors.departureTime ? 'border-red-500' : ''}
                      required
                    />
                    {errors.departureTime && (
                      <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {errors.departureTime}
                      </p>
                    )}
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Додаткова інформація */}
              <div className="space-y-4">
                <Field>
                  <Label htmlFor="passengerCount">Кількість пасажирів</Label>
                  <Input
                    id="passengerCount"
                    type="number"
                    min="1"
                    max="50"
                    value={contractData.passengerCount}
                    onChange={(e) => setContractData(prev => ({ ...prev, passengerCount: parseInt(e.target.value) }))}
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="additionalInfo">Додаткова інформація</Label>
                  <textarea
                    id="additionalInfo"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={contractData.additionalInfo}
                    onChange={(e) => setContractData(prev => ({ ...prev, additionalInfo: e.target.value }))}
                    placeholder="Особливі вимоги, коментарі..."
                  />
                </Field>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Обробка...' : 'Оформити договір'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Карта */}
        <Card>
          <CardHeader>
            <CardTitle>Карта маршруту</CardTitle>
            <CardDescription>
              Клікніть на карті для вибору точок відправлення та призначення
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  Відправлення
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  Призначення
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-1 bg-blue-500 rounded"></div>
                  Маршрут
                </div>
              </div>
              <div
                ref={mapContainer}
                className="w-full h-96 rounded-lg border"
                style={{ minHeight: '400px' }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}