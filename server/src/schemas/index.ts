import { z } from 'zod';

/* ─── shared ───────────────────────────────────────────── */

const vehicleTypeEnum = z.enum(['TRUCK', 'VAN', 'CAR', 'REFRIGERATOR']);
const driverPayTypeEnum = z.enum(['PER_KM', 'PER_HOUR', 'PER_DAY', 'FIXED']);
const fuelTypeEnum = z.enum(['DIESEL', 'PETROL_95', 'PETROL_92', 'GAS']);
const orderStatusEnum = z.enum(['NEW', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);
const executionTypeEnum = z.enum(['INTERNAL', 'EXTERNAL']);
const operationModeEnum = z.enum(['OWN_FLEET', 'BROKER', 'HYBRID']);

/** E.g. +380 67 123-45-67, (067) 123-45-67, +1-800-555-0100 */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s\-()\[\]]{4,18}[\d)]?$/, 'Невірний формат телефону (напр. +380671234567)');

/* ─── auth ─────────────────────────────────────────────── */

export const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const signUpSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  companyName: z.string().min(1, 'Company name is required').optional(),
  company_name: z.string().min(1).optional(),
});

/* ─── clients ──────────────────────────────────────────── */

export const createClientSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, 'Мінімум 2 символи')
    .max(200, 'Максимум 200 символів'),
  contactPerson: z
    .string()
    .trim()
    .min(2, 'Мінімум 2 символи')
    .max(200, 'Максимум 200 символів'),
  phone: phoneSchema,
  email: z.string().trim().email('Невірний email').nullable().optional(),
  address: z
    .string()
    .trim()
    .max(500, 'Максимум 500 символів')
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, 'Максимум 1000 символів')
    .nullable()
    .optional(),
});

export const updateClientSchema = createClientSchema.partial();

/* ─── companies ────────────────────────────────────────── */

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2, 'Мінімум 2 символи').max(200, 'Максимум 200 символів').optional(),
  email: z.string().trim().email('Невірний email').nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  address: z.string().trim().max(500, 'Максимум 500 символів').nullable().optional(),
  hasOwnFleet: z.boolean().optional(),
  operationMode: operationModeEnum.optional(),
  usesBrokerServices: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'Потрібно вказати хоча б одне поле' }
);

/* ─── drivers ──────────────────────────────────────────── */

export const createDriverSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    first_name: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
    phone: z.string().min(1, 'Phone is required'),
    licenseNumber: z.string().min(1).optional(),
    license_number: z.string().min(1).optional(),
    payType: driverPayTypeEnum.optional(),
    pay_type: driverPayTypeEnum.optional(),
    payRate: z.number().positive('Pay rate must be positive').optional(),
    pay_rate: z.number().positive().optional(),
    isAvailable: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((d) => (d.firstName || d.first_name) && (d.lastName || d.last_name) && (d.licenseNumber || d.license_number), {
    message: 'firstName, lastName, licenseNumber are required',
  })
  .refine((d) => d.payType || d.pay_type, { message: 'payType is required' })
  .refine((d) => d.payRate !== undefined || d.pay_rate !== undefined, { message: 'payRate is required' });

export const updateDriverSchema = z.object({
  firstName: z.string().min(1).optional(),
  first_name: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  licenseNumber: z.string().min(1).optional(),
  license_number: z.string().min(1).optional(),
  payType: driverPayTypeEnum.optional(),
  pay_type: driverPayTypeEnum.optional(),
  payRate: z.number().positive().optional(),
  pay_rate: z.number().positive().optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const availabilitySchema = z.object({
  isAvailable: z.boolean().optional(),
});

/* ─── vehicles ─────────────────────────────────────────── */

export const createVehicleSchema = z
  .object({
    plateNumber: z.string().min(1, 'Plate number is required').optional(),
    plate_number: z.string().min(1).optional(),
    type: vehicleTypeEnum,
    capacity: z.number().positive('Capacity must be positive'),
    fuelType: fuelTypeEnum.optional(),
    fuel_type: fuelTypeEnum.optional(),
    tankCapacity: z.number().positive('Tank capacity must be positive').optional(),
    tank_capacity: z.number().positive().optional(),
    fuelConsumption: z.number().positive('Fuel consumption must be positive').optional(),
    fuel_consumption: z.number().positive().optional(),
    cargoVolume: z.number().positive('Cargo volume must be positive').optional(),
    cargo_volume: z.number().positive().optional(),
    costPerKm: z.number().min(0, 'Cost per km must be >= 0').optional(),
    cost_per_km: z.number().min(0).optional(),
    maxRange: z.number().positive('Max range must be positive').optional(),
    max_range: z.number().positive().optional(),
    isAvailable: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((d) => d.plateNumber || d.plate_number, { message: 'plateNumber is required' })
  .refine((d) => d.fuelType || d.fuel_type, { message: 'fuelType is required' })
  .refine((d) => d.tankCapacity !== undefined || d.tank_capacity !== undefined, { message: 'tankCapacity is required' })
  .refine((d) => d.fuelConsumption !== undefined || d.fuel_consumption !== undefined, { message: 'fuelConsumption is required' })
  .refine((d) => d.cargoVolume !== undefined || d.cargo_volume !== undefined, { message: 'cargoVolume is required' })
  .refine((d) => d.costPerKm !== undefined || d.cost_per_km !== undefined, { message: 'costPerKm is required' })
  .refine((d) => d.maxRange !== undefined || d.max_range !== undefined, { message: 'maxRange is required' });

export const updateVehicleSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  plate_number: z.string().min(1).optional(),
  type: vehicleTypeEnum.optional(),
  capacity: z.number().positive().optional(),
  fuelType: fuelTypeEnum.optional(),
  fuel_type: fuelTypeEnum.optional(),
  tankCapacity: z.number().positive().optional(),
  tank_capacity: z.number().positive().optional(),
  fuelConsumption: z.number().positive().optional(),
  fuel_consumption: z.number().positive().optional(),
  cargoVolume: z.number().positive().optional(),
  cargo_volume: z.number().positive().optional(),
  costPerKm: z.number().min(0).optional(),
  cost_per_km: z.number().min(0).optional(),
  maxRange: z.number().positive().optional(),
  max_range: z.number().positive().optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

/* ─── carriers ─────────────────────────────────────────── */

export const createCarrierSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, 'Мінімум 2 символи')
    .max(200, 'Максимум 200 символів'),
  contactPerson: z
    .string()
    .trim()
    .min(2, 'Мінімум 2 символи')
    .max(200, 'Максимум 200 символів'),
  phone: phoneSchema,
  email: z.string().trim().email('Невірний email').nullable().optional(),
  vehicleTypes: z.array(vehicleTypeEnum).optional(),
  maxCapacity: z
    .number()
    .positive('Повинна бути > 0')
    .max(999, 'Максимум 999 т'),
  coverageAreas: z
    .array(z.string().trim().max(100, 'Макс. 100 символів'))
    .optional(),
  rating: z.number().min(0).max(5).optional(),
  isAvailable: z.boolean().optional(),
  notes: z
    .string()
    .trim()
    .max(1000, 'Максимум 1000 символів')
    .nullable()
    .optional(),
});

export const updateCarrierSchema = z.object({
  companyName: z.string().trim().min(2).max(200).optional(),
  company_name: z.string().trim().min(2).optional(),
  contactPerson: z.string().trim().min(2).max(200).optional(),
  contact_person: z.string().trim().min(2).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().nullable().optional(),
  vehicleTypes: z.array(vehicleTypeEnum).optional(),
  maxCapacity: z.number().positive().max(999).optional(),
  max_capacity: z.number().positive().optional(),
  coverageAreas: z.array(z.string().trim().max(100)).optional(),
  rating: z.number().min(0).max(5).optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/* ─── orders ───────────────────────────────────────────── */

const orderBaseSchema = z.object({
  clientId: z.string().uuid('Оберіть клієнта'),
  productType: z.string().trim().max(200).nullable().optional(),
  quantity: z.number().positive('Повинна бути > 0').nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  weight: z.number().positive('Повинна бути > 0').nullable().optional(),
  volume: z.number().positive('Повинна бути > 0').nullable().optional(),
  pickupAddress: z
    .string()
    .trim()
    .min(5, 'Мінімум 5 символів')
    .max(500, 'Максимум 500 символів'),
  deliveryAddress: z
    .string()
    .trim()
    .min(5, 'Мінімум 5 символів')
    .max(500, 'Максимум 500 символів'),
  pickupDate: z
    .string()
    .min(1, 'Вкажіть дату забору')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Невірний формат дати'),
  deliveryDate: z
    .string()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Невірний формат дати')
    .nullable()
    .optional(),
  executionType: executionTypeEnum,
  driverId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  estimatedFuelCost: z.number().nonnegative().nullable().optional(),
  estimatedSalaryCost: z.number().nonnegative().nullable().optional(),
  carrierId: z.string().uuid().nullable().optional(),
  carrierAgreedPrice: z.number().nonnegative().nullable().optional(),
  carrierVehicleInfo: z.string().trim().max(200).nullable().optional(),
  clientPrice: z.number().nonnegative('Не може бути від\'ємним'),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const createOrderSchema = orderBaseSchema.superRefine((data, ctx) => {
  if (data.deliveryDate && data.pickupDate) {
    const pickup = Date.parse(data.pickupDate);
    const delivery = Date.parse(data.deliveryDate);
    if (!Number.isNaN(pickup) && !Number.isNaN(delivery) && delivery < pickup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryDate'],
        message: 'Дата доставки не може бути раніше дати забору',
      });
    }
  }
});

export const updateOrderSchema = orderBaseSchema.partial();

export const updateOrderStatusSchema = z.object({
  status: orderStatusEnum,
});

// ── User Management ──────────────────────────────────────────────────────────

const userRoleEnum = z.enum([
  'ADMIN',
  'MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'LOGIST',
  'DRIVER',
]);

export const createUserSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  roles: z.array(userRoleEnum).min(1, 'At least one role is required'),
  driverId: z.string().uuid('Invalid driver ID').optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email('Invalid email').optional(),
  password: z
    .union([z.string().min(6, 'Password must be at least 6 characters'), z.literal('')])
    .optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  roles: z.array(userRoleEnum).min(1, 'At least one role is required').optional(),
  driverId: z.string().uuid().nullable().optional(),
});
