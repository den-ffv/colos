import React, { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Field } from './ui/field';
import { Separator } from './ui/separator';
import { MapPin, Calendar, Package, Truck, User, Plus, Trash2 } from 'lucide-react';

// Встановіть ваш безкоштовний токен з mapbox.com в файлі .env
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiY29sb3MtZGlwbG9tIiwiYSI6ImNsejV3eDB6ZzBqaDIybXM0OGx6ejhsZjIifQ.xxx';

interface RoutePoint {
  name: string;
  coordinates: [number, number];
  address: string;
}

interface CargoItem {
  id: string;
  name: string;
  quantity: number;
  weight: number; // в кг
  volume?: number; // в м³
  value?: number; // вартість в грн
  category: string;
  fragile: boolean;
  description?: string;
}

interface ContractData {
  // Відправник
  senderName: string;
  senderPhone: string;
  senderEmail?: string;
  senderCompany?: string;

  // Отримувач
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  recipientCompany?: string;

  // Логістика
  pickupPoint: RoutePoint;
  deliveryPoint: RoutePoint;
  pickupDate: string;
  pickupTime: string;
  deliveryDate?: string;
  deliveryTime?: string;

  // Товари
  cargoItems: CargoItem[];
  totalWeight: number;
  totalVolume: number;
  totalValue: number;

  // Додаткові послуги
  packingRequired: boolean;
  insuranceRequired: boolean;
  expressDelivery: boolean;

  // Спеціальні вимоги
  temperatureControlled: boolean;
  hazardousMaterials: boolean;
  oversizedCargo: boolean;

  additionalInfo: string;
}

export default function LogisticsContractForm() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const [contractData, setContractData] = useState<ContractData>({
    // Відправник
    senderName: '',
    senderPhone: '',
    senderEmail: '',
    senderCompany: '',

    // Отримувач
    recipientName: '',
    recipientPhone: '',
    recipientEmail: '',
    recipientCompany: '',

    // Логістика
    pickupPoint: {
      name: '',
      coordinates: [30.5234, 50.4501], // Київ за замовчуванням
      address: ''
    },
    deliveryPoint: {
      name: '',
      coordinates: [30.5234, 50.4501],
      address: ''
    },
    pickupDate: '',
    pickupTime: '',
    deliveryDate: '',
    deliveryTime: '',

    // Товари
    cargoItems: [],
    totalWeight: 0,
    totalVolume: 0,
    totalValue: 0,

    // Додаткові послуги
    packingRequired: false,
    insuranceRequired: false,
    expressDelivery: false,

    // Спеціальні вимоги
    temperatureControlled: false,
    hazardousMaterials: false,
    oversizedCargo: false,

    additionalInfo: ''
  });

  const [markers, setMarkers] = useState<{
    pickup?: mapboxgl.Marker;
    delivery?: mapboxgl.Marker;
  }>({});

  const [route, setRoute] = useState<{
    distance: number;
    duration: number;
    geometry: object;
  } | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (map.current) return; // Карта вже ініціалізована

    if (mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [30.5234, 50.4501], // Київ
        zoom: 6, // Зменшили zoom для більш широкого огляду
        minZoom: 3, // Мінімальний zoom для України
        maxZoom: 16 // Максимальний zoom
      });

      map.current.addControl(new mapboxgl.NavigationControl());
    }
  }, []);

  const addMarker = (coordinates: [number, number], type: 'pickup' | 'delivery') => {
    if (!map.current) return;

    // Видаляємо попередній маркер цього типу
    if (markers[type]) {
      markers[type]!.remove();
    }

    const color = type === 'pickup' ? '#10b981' : '#ef4444';
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
        ...prev[type === 'pickup' ? 'pickupPoint' : 'deliveryPoint'],
        coordinates
      }
    }));
  };

  const getRoute = useCallback(async () => {
    if (!contractData.pickupPoint.coordinates || !contractData.deliveryPoint.coordinates) {
      return;
    }

    setLoading(true);
    const [startLng, startLat] = contractData.pickupPoint.coordinates;
    const [endLng, endLat] = contractData.deliveryPoint.coordinates;

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
        map.current.fitBounds(bounds, {
          padding: 100, // Збільшили відступи
          maxZoom: 12   // Обмежили максимальний zoom
        });
      }
    } catch (error) {
      console.error('Error getting route:', error);
    } finally {
      setLoading(false);
    }
  }, [contractData.pickupPoint.coordinates, contractData.deliveryPoint.coordinates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);

    try {
      const response = await fetch('/api/logistics-contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...contractData,
          routeData: route
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert('Договір логістики успішно оформлений!');
        console.log('Contract created:', result.data);

        // Очищуємо форму
        setContractData({
          senderName: '',
          senderPhone: '',
          senderEmail: '',
          senderCompany: '',
          recipientName: '',
          recipientPhone: '',
          recipientEmail: '',
          recipientCompany: '',
          pickupPoint: {
            name: '',
            coordinates: [30.5234, 50.4501],
            address: ''
          },
          deliveryPoint: {
            name: '',
            coordinates: [30.5234, 50.4501],
            address: ''
          },
          pickupDate: '',
          pickupTime: '',
          deliveryDate: '',
          deliveryTime: '',
          cargoItems: [],
          totalWeight: 0,
          totalVolume: 0,
          totalValue: 0,
          packingRequired: false,
          insuranceRequired: false,
          expressDelivery: false,
          temperatureControlled: false,
          hazardousMaterials: false,
          oversizedCargo: false,
          additionalInfo: ''
        });

        // Очищуємо карту
        if (map.current) {
          if (markers.pickup) markers.pickup.remove();
          if (markers.delivery) markers.delivery.remove();
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

  const handleLocationClick = (type: 'pickup' | 'delivery') => {
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
                ...prev[type === 'pickup' ? 'pickupPoint' : 'deliveryPoint'],
                address
              }
            }));
          });
      });
    }
  };

  const addCargoItem = () => {
    const newItem: CargoItem = {
      id: Date.now().toString(),
      name: '',
      quantity: 1,
      weight: 0,
      volume: 0,
      value: 0,
      category: 'general',
      fragile: false,
      description: ''
    };

    setContractData(prev => ({
      ...prev,
      cargoItems: [...prev.cargoItems, newItem]
    }));
  };

  const removeCargoItem = (id: string) => {
    setContractData(prev => ({
      ...prev,
      cargoItems: prev.cargoItems.filter(item => item.id !== id)
    }));
  };

  const updateCargoItem = (id: string, updates: Partial<CargoItem>) => {
    setContractData(prev => ({
      ...prev,
      cargoItems: prev.cargoItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      )
    }));
  };

  useEffect(() => {
    if (contractData.pickupPoint.coordinates && contractData.deliveryPoint.coordinates) {
      getRoute();
    }
  }, [contractData.pickupPoint.coordinates, contractData.deliveryPoint.coordinates, getRoute]);

  // Розраховуємо загальні показники
  useEffect(() => {
    const totalWeight = contractData.cargoItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
    const totalVolume = contractData.cargoItems.reduce((sum, item) => sum + ((item.volume || 0) * item.quantity), 0);
    const totalValue = contractData.cargoItems.reduce((sum, item) => sum + ((item.value || 0) * item.quantity), 0);

    setContractData(prev => ({
      ...prev,
      totalWeight,
      totalVolume,
      totalValue
    }));
  }, [contractData.cargoItems]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Форма договору */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Договір логістики товарів
            </CardTitle>
            <CardDescription>
              Заповніть всі необхідні дані для оформлення договору доставки товарів
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Відправник */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Відправник
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="senderName">Ім'я відправника</Label>
                    <Input
                      id="senderName"
                      value={contractData.senderName}
                      onChange={(e) => setContractData(prev => ({ ...prev, senderName: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="senderPhone">Телефон</Label>
                    <Input
                      id="senderPhone"
                      type="tel"
                      value={contractData.senderPhone}
                      onChange={(e) => setContractData(prev => ({ ...prev, senderPhone: e.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="senderEmail">Email</Label>
                    <Input
                      id="senderEmail"
                      type="email"
                      value={contractData.senderEmail}
                      onChange={(e) => setContractData(prev => ({ ...prev, senderEmail: e.target.value }))}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="senderCompany">Компанія</Label>
                    <Input
                      id="senderCompany"
                      value={contractData.senderCompany}
                      onChange={(e) => setContractData(prev => ({ ...prev, senderCompany: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Отримувач */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Отримувач
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="recipientName">Ім'я отримувача</Label>
                    <Input
                      id="recipientName"
                      value={contractData.recipientName}
                      onChange={(e) => setContractData(prev => ({ ...prev, recipientName: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="recipientPhone">Телефон</Label>
                    <Input
                      id="recipientPhone"
                      type="tel"
                      value={contractData.recipientPhone}
                      onChange={(e) => setContractData(prev => ({ ...prev, recipientPhone: e.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="recipientEmail">Email</Label>
                    <Input
                      id="recipientEmail"
                      type="email"
                      value={contractData.recipientEmail}
                      onChange={(e) => setContractData(prev => ({ ...prev, recipientEmail: e.target.value }))}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="recipientCompany">Компанія</Label>
                    <Input
                      id="recipientCompany"
                      value={contractData.recipientCompany}
                      onChange={(e) => setContractData(prev => ({ ...prev, recipientCompany: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Логістика */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Маршрут
                </h3>

                <div className="space-y-2">
                  <Label>Пункт забору</Label>
                  <div className="flex gap-2">
                    <Input
                      value={contractData.pickupPoint.address}
                      placeholder="Клікніть на карті або введіть адресу"
                      onChange={(e) => setContractData(prev => ({
                        ...prev,
                        pickupPoint: { ...prev.pickupPoint, address: e.target.value }
                      }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleLocationClick('pickup')}
                    >
                      Обрати на карті
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Пункт доставки</Label>
                  <div className="flex gap-2">
                    <Input
                      value={contractData.deliveryPoint.address}
                      placeholder="Клікніть на карті або введіть адресу"
                      onChange={(e) => setContractData(prev => ({
                        ...prev,
                        deliveryPoint: { ...prev.deliveryPoint, address: e.target.value }
                      }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleLocationClick('delivery')}
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

              {/* Час забору та доставки */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Час забору та доставки
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="pickupDate">Дата забору</Label>
                    <Input
                      id="pickupDate"
                      type="date"
                      value={contractData.pickupDate}
                      onChange={(e) => setContractData(prev => ({ ...prev, pickupDate: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="pickupTime">Час забору</Label>
                    <Input
                      id="pickupTime"
                      type="time"
                      value={contractData.pickupTime}
                      onChange={(e) => setContractData(prev => ({ ...prev, pickupTime: e.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label htmlFor="deliveryDate">Дата доставки (бажана)</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      value={contractData.deliveryDate}
                      onChange={(e) => setContractData(prev => ({ ...prev, deliveryDate: e.target.value }))}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="deliveryTime">Час доставки (бажаний)</Label>
                    <Input
                      id="deliveryTime"
                      type="time"
                      value={contractData.deliveryTime}
                      onChange={(e) => setContractData(prev => ({ ...prev, deliveryTime: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Товари */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Товари для доставки
                  </h3>
                  <Button type="button" onClick={addCargoItem} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Додати товар
                  </Button>
                </div>

                {contractData.cargoItems.map((item, index) => (
                  <div key={item.id} className="border p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Товар #{index + 1}</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeCargoItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <Label>Назва товару</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => updateCargoItem(item.id, { name: e.target.value })}
                          placeholder="Назва товару"
                          required
                        />
                      </Field>
                      <Field>
                        <Label>Категорія</Label>
                        <select
                          value={item.category}
                          onChange={(e) => updateCargoItem(item.id, { category: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="general">Загальні товари</option>
                          <option value="electronics">Електроніка</option>
                          <option value="food">Продукти харчування</option>
                          <option value="clothing">Одяг</option>
                          <option value="furniture">Меблі</option>
                          <option value="documents">Документи</option>
                          <option value="other">Інше</option>
                        </select>
                      </Field>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Field>
                        <Label>Кількість</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateCargoItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                        />
                      </Field>
                      <Field>
                        <Label>Вага (кг)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.weight}
                          onChange={(e) => updateCargoItem(item.id, { weight: parseFloat(e.target.value) || 0 })}
                        />
                      </Field>
                      <Field>
                        <Label>Об'єм (м³)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.volume || 0}
                          onChange={(e) => updateCargoItem(item.id, { volume: parseFloat(e.target.value) || 0 })}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <Label>Вартість (грн)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.value || 0}
                          onChange={(e) => updateCargoItem(item.id, { value: parseFloat(e.target.value) || 0 })}
                        />
                      </Field>
                      <Field className="flex items-center space-x-2 pt-6">
                        <input
                          type="checkbox"
                          id={`fragile-${item.id}`}
                          checked={item.fragile}
                          onChange={(e) => updateCargoItem(item.id, { fragile: e.target.checked })}
                        />
                        <Label htmlFor={`fragile-${item.id}`}>Крихкий товар</Label>
                      </Field>
                    </div>

                    <Field>
                      <Label>Опис (необов'язково)</Label>
                      <textarea
                        value={item.description || ''}
                        onChange={(e) => updateCargoItem(item.id, { description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={2}
                        placeholder="Додаткові деталі про товар..."
                      />
                    </Field>
                  </div>
                ))}

                {contractData.cargoItems.length > 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h4 className="font-medium mb-2">Загальні показники:</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <p>Загальна вага: <span className="font-medium">{contractData.totalWeight.toFixed(1)} кг</span></p>
                      <p>Загальний об'єм: <span className="font-medium">{contractData.totalVolume.toFixed(2)} м³</span></p>
                      <p>Загальна вартість: <span className="font-medium">{contractData.totalValue.toFixed(2)} грн</span></p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Додаткові послуги */}
              <div className="space-y-4">
                <h3 className="font-semibold">Додаткові послуги</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={contractData.packingRequired}
                      onChange={(e) => setContractData(prev => ({ ...prev, packingRequired: e.target.checked }))}
                    />
                    <span>Пакування товару</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={contractData.insuranceRequired}
                      onChange={(e) => setContractData(prev => ({ ...prev, insuranceRequired: e.target.checked }))}
                    />
                    <span>Страхування вантажу</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={contractData.expressDelivery}
                      onChange={(e) => setContractData(prev => ({ ...prev, expressDelivery: e.target.checked }))}
                    />
                    <span>Експрес доставка</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Спеціальні вимоги */}
              <div className="space-y-4">
                <h3 className="font-semibold">Спеціальні вимоги</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={contractData.temperatureControlled}
                      onChange={(e) => setContractData(prev => ({ ...prev, temperatureControlled: e.target.checked }))}
                    />
                    <span>Температурний режим</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={contractData.hazardousMaterials}
                      onChange={(e) => setContractData(prev => ({ ...prev, hazardousMaterials: e.target.checked }))}
                    />
                    <span>Небезпечні матеріали</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={contractData.oversizedCargo}
                      onChange={(e) => setContractData(prev => ({ ...prev, oversizedCargo: e.target.checked }))}
                    />
                    <span>Негабаритний вантаж</span>
                  </label>
                </div>
              </div>

              <Separator />

              {/* Додаткова інформація */}
              <Field>
                <Label htmlFor="additionalInfo">Додаткова інформація</Label>
                <textarea
                  id="additionalInfo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={contractData.additionalInfo}
                  onChange={(e) => setContractData(prev => ({ ...prev, additionalInfo: e.target.value }))}
                  placeholder="Особливі вимоги, коментарі до доставки..."
                />
              </Field>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Обробка...' : 'Оформити договір логістики'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Карта */}
        <Card>
          <CardHeader>
            <CardTitle>Карта маршруту доставки</CardTitle>
            <CardDescription>
              Клікніть на карті для вибору точок забору та доставки
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  Забір
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  Доставка
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