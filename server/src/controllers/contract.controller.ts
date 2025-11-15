import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export const createContract = async (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, departurePoint, destinationPoint, departureDate, departureTime, passengerCount, additionalInfo, routeData } = req.body;

    // Валідація обов'язкових полів
    if (!customerName || !customerPhone || !departurePoint || !destinationPoint || !departureDate || !departureTime) {
      return res.status(400).json({
        error: "Всі обов'язкові поля мають бути заповнені",
      });
    }

    // Перевірка формату телефону
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    if (!phoneRegex.test(customerPhone)) {
      return res.status(400).json({
        error: 'Невірний формат телефону',
      });
    }

    // Перевірка дати
    const selectedDate = new Date(departureDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      return res.status(400).json({
        error: 'Дата відправлення не може бути в минулому',
      });
    }

    // Створення договору
    const contract = await prisma.contract.create({
      data: {
        customer_name: customerName,
        customer_phone: customerPhone,
        departure_point: departurePoint,
        destination_point: destinationPoint,
        departure_date: new Date(departureDate),
        departure_time: departureTime,
        passenger_count: parseInt(passengerCount),
        additional_info: additionalInfo || null,
        route_data: routeData || null,
        status: 'new',
      },
    });

    logger.info(`Contract created with ID: ${contract.id}`);

    return res.status(201).json({
      success: true,
      data: contract,
    });
  } catch (error) {
    logger.error('Error creating contract:', error);
    return res.status(500).json({
      error: 'Внутрішня помилка сервера',
    });
  }
};

export const getContracts = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        skip,
        take,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          contractor: {
            select: {
              id: true,
              company_name: true,
              contact_name: true,
              phone: true,
            },
          },
        },
      }),
      prisma.contract.count({ where }),
    ]);

    return res.json({
      success: true,
      data: contracts,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    logger.error('Error fetching contracts:', error);
    return res.status(500).json({
      error: 'Внутрішня помилка сервера',
    });
  }
};

export const getContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        contractor: {
          select: {
            id: true,
            company_name: true,
            contact_name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    if (!contract) {
      return res.status(404).json({
        error: 'Договір не знайдено',
      });
    }

    return res.json({
      success: true,
      data: contract,
    });
  } catch (error) {
    logger.error('Error fetching contract:', error);
    return res.status(500).json({
      error: 'Внутрішня помилка сервера',
    });
  }
};

export const updateContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const contract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      return res.status(404).json({
        error: 'Договір не знайдено',
      });
    }

    const updatedContract = await prisma.contract.update({
      where: { id },
      data: {
        ...updates,
        updated_at: new Date(),
      },
    });

    logger.info(`Contract updated with ID: ${id}`);

    return res.json({
      success: true,
      data: updatedContract,
    });
  } catch (error) {
    logger.error('Error updating contract:', error);
    return res.status(500).json({
      error: 'Внутрішня помилка сервера',
    });
  }
};
