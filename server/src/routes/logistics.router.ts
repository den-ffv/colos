import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth } from '../middlewares/session';

const router = Router();

// POST /api/logistics-contracts - створити новий договір логістики
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      // Відправник
      senderName,
      senderPhone,
      senderEmail,
      senderCompany,

      // Отримувач
      recipientName,
      recipientPhone,
      recipientEmail,
      recipientCompany,

      // Логістика
      pickupPoint,
      deliveryPoint,
      pickupDate,
      pickupTime,
      deliveryDate,
      deliveryTime,

      // Товари
      cargoItems,
      totalWeight,
      totalVolume,
      totalValue,

      // Додаткові послуги
      packingRequired,
      insuranceRequired,
      expressDelivery,

      // Спеціальні вимоги
      temperatureControlled,
      hazardousMaterials,
      oversizedCargo,

      additionalInfo,
      routeData,
    } = req.body;

    // Валідація обов'язкових полів
    if (!senderName || !senderPhone || !recipientName || !recipientPhone) {
      return res.status(400).json({
        error: "Заповніть обов'язкові поля: імена та телефони відправника та отримувача",
      });
    }

    if (!pickupPoint?.coordinates || !deliveryPoint?.coordinates) {
      return res.status(400).json({
        error: 'Вкажіть точки забору та доставки на карті',
      });
    }

    if (!pickupDate || !pickupTime) {
      return res.status(400).json({
        error: 'Вкажіть дату та час забору',
      });
    }

    if (!cargoItems || cargoItems.length === 0) {
      return res.status(400).json({
        error: 'Додайте хоча б один товар для доставки',
      });
    }

    // Валідація товарів
    for (const item of cargoItems) {
      if (!item.name || item.quantity <= 0 || item.weight <= 0) {
        return res.status(400).json({
          error: 'Усі товари повинні мати назву, кількість та вагу більше 0',
        });
      }
    }

    // Створюємо дату та час відправлення
    const departureDateTime = new Date(`${pickupDate}T${pickupTime}`);

    // Створюємо договір логістики
    const logisticsContract = await prisma.contract.create({
      data: {
        // Основні дані
        customer_name: senderName,
        customer_phone: senderPhone,

        // Маршрут
        departure_point: pickupPoint,
        destination_point: deliveryPoint,
        departure_date: departureDateTime,
        departure_time: pickupTime,

        // Кількість (для логістики використовуємо як загальну кількість товарів)
        passenger_count: cargoItems.reduce((sum: number, item: any) => sum + item.quantity, 0),

        // Додаткові дані логістики в JSON полі additional_info
        additional_info: JSON.stringify({
          type: 'logistics',

          // Відправник
          sender: {
            name: senderName,
            phone: senderPhone,
            email: senderEmail,
            company: senderCompany,
          },

          // Отримувач
          recipient: {
            name: recipientName,
            phone: recipientPhone,
            email: recipientEmail,
            company: recipientCompany,
          },

          // Час доставки
          delivery: {
            date: deliveryDate,
            time: deliveryTime,
          },

          // Товари
          cargo: {
            items: cargoItems,
            totalWeight,
            totalVolume,
            totalValue,
          },

          // Послуги
          services: {
            packingRequired,
            insuranceRequired,
            expressDelivery,
          },

          // Спеціальні вимоги
          requirements: {
            temperatureControlled,
            hazardousMaterials,
            oversizedCargo,
          },

          notes: additionalInfo,
        }),

        // Дані маршруту
        route_data: routeData ? routeData : null,

        status: 'new',

        // Розрахунки
        total_price: calculateLogisticsCost({
          distance: routeData?.distance || 0,
          weight: totalWeight,
          volume: totalVolume,
          value: totalValue,
          expressDelivery,
          packingRequired,
          insuranceRequired,
          temperatureControlled,
          hazardousMaterials,
          oversizedCargo,
        }),

        created_by: req.user?.id,
      },
    });

    res.status(201).json({
      message: 'Договір логістики успішно створено',
      data: logisticsContract,
    });
  } catch (error) {
    console.error('Error creating logistics contract:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// GET /api/logistics-contracts - отримати список договорів логістики
router.get('/', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {
      created_by: req.user?.id,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [{ customer_name: { contains: search, mode: 'insensitive' } }, { customer_phone: { contains: search, mode: 'insensitive' } }];
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: Number(limit),
        skip: offset,
      }),
      prisma.contract.count({ where }),
    ]);

    res.json({
      data: contracts,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching logistics contracts:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// GET /api/logistics-contracts/:id - отримати договір логістики за ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findFirst({
      where: {
        id: id,
        created_by: req.user?.id,
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Договір не знайдено' });
    }

    res.json({ data: contract });
  } catch (error) {
    console.error('Error fetching logistics contract:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// PUT /api/logistics-contracts/:id/status - оновити статус договору
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['new', 'confirmed', 'in_progress', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Недопустимий статус. Дозволені: ' + allowedStatuses.join(', '),
      });
    }

    const contract = await prisma.contract.findFirst({
      where: {
        id: id,
        created_by: req.user?.id,
      },
    });

    if (!contract) {
      return res.status(404).json({ error: 'Договір не знайдено' });
    }

    const updatedContract = await prisma.contract.update({
      where: { id: id },
      data: { status },
    });

    res.json({
      message: 'Статус договору оновлено',
      data: updatedContract,
    });
  } catch (error) {
    console.error('Error updating logistics contract status:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// Функція розрахунку вартості логістики
function calculateLogisticsCost(params: {
  distance: number; // в метрах
  weight: number; // в кг
  volume: number; // в м³
  value: number; // вартість товару в грн
  expressDelivery: boolean;
  packingRequired: boolean;
  insuranceRequired: boolean;
  temperatureControlled: boolean;
  hazardousMaterials: boolean;
  oversizedCargo: boolean;
}): number {
  const { distance, weight, volume, value, expressDelivery, packingRequired, insuranceRequired, temperatureControlled, hazardousMaterials, oversizedCargo } = params;

  // Базова вартість за км
  const baseRatePerKm = 15; // грн за км

  // Вартість за вагу
  const weightRate = 5; // грн за кг

  // Вартість за об'єм
  const volumeRate = 100; // грн за м³

  // Базова вартість
  let totalCost = 0;

  // Вартість за відстань
  totalCost += (distance / 1000) * baseRatePerKm;

  // Вартість за вагу
  totalCost += weight * weightRate;

  // Вартість за об'єм
  totalCost += volume * volumeRate;

  // Додаткові послуги
  if (expressDelivery) {
    totalCost *= 1.5; // +50% за експрес
  }

  if (packingRequired) {
    totalCost += weight * 10; // 10 грн за кг за пакування
  }

  if (insuranceRequired) {
    totalCost += value * 0.02; // 2% від вартості товару
  }

  if (temperatureControlled) {
    totalCost *= 1.3; // +30% за температурний режим
  }

  if (hazardousMaterials) {
    totalCost *= 1.4; // +40% за небезпечні матеріали
  }

  if (oversizedCargo) {
    totalCost *= 1.25; // +25% за негабаритний вантаж
  }

  // Мінімальна вартість
  const minimumCost = 200; // грн

  return Math.max(Math.round(totalCost), minimumCost);
}

export default router;
