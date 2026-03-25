import { z } from 'zod';

/* ─── shared ───────────────────────────────────────────── */

const vehicleTypeEnum = z.enum(['TRUCK', 'VAN', 'CAR', 'REFRIGERATOR']);
const orderStatusEnum = z.enum(['NEW', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);
const executionTypeEnum = z.enum(['INTERNAL', 'EXTERNAL']);

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
  companyName: z.string().min(1, 'Company name is required'),
  contactPerson: z.string().min(1, 'Contact person is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateClientSchema = createClientSchema.partial();

/* ─── drivers ──────────────────────────────────────────── */

export const createDriverSchema = z.object({
  firstName: z.string().min(1).optional(),
  first_name: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().min(1, 'Phone is required'),
  licenseNumber: z.string().min(1).optional(),
  license_number: z.string().min(1).optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
}).refine(
  (d) => (d.firstName || d.first_name) && (d.lastName || d.last_name) && (d.licenseNumber || d.license_number),
  { message: 'firstName, lastName, licenseNumber are required' },
);

export const updateDriverSchema = z.object({
  firstName: z.string().min(1).optional(),
  first_name: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  licenseNumber: z.string().min(1).optional(),
  license_number: z.string().min(1).optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const availabilitySchema = z.object({
  isAvailable: z.boolean().optional(),
});

/* ─── vehicles ─────────────────────────────────────────── */

export const createVehicleSchema = z.object({
  plateNumber: z.string().min(1, 'Plate number is required').optional(),
  plate_number: z.string().min(1).optional(),
  type: vehicleTypeEnum,
  capacity: z.number().positive('Capacity must be positive'),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
}).refine((d) => d.plateNumber || d.plate_number, { message: 'plateNumber is required' });

export const updateVehicleSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  plate_number: z.string().min(1).optional(),
  type: vehicleTypeEnum.optional(),
  capacity: z.number().positive().optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

/* ─── carriers ─────────────────────────────────────────── */

export const createCarrierSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').optional(),
  company_name: z.string().min(1).optional(),
  contactPerson: z.string().min(1, 'Contact person is required').optional(),
  contact_person: z.string().min(1).optional(),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().nullable().optional(),
  vehicleTypes: z.array(vehicleTypeEnum).optional(),
  maxCapacity: z.number().positive('Max capacity must be positive').optional(),
  max_capacity: z.number().positive().optional(),
  coverageAreas: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
}).refine(
  (d) => (d.companyName || d.company_name) && (d.contactPerson || d.contact_person) && (d.maxCapacity !== undefined || d.max_capacity !== undefined),
  { message: 'companyName, contactPerson, maxCapacity are required' },
);

export const updateCarrierSchema = z.object({
  companyName: z.string().min(1).optional(),
  company_name: z.string().min(1).optional(),
  contactPerson: z.string().min(1).optional(),
  contact_person: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  vehicleTypes: z.array(vehicleTypeEnum).optional(),
  maxCapacity: z.number().positive().optional(),
  max_capacity: z.number().positive().optional(),
  coverageAreas: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
  isAvailable: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

/* ─── orders ───────────────────────────────────────────── */

export const createOrderSchema = z.object({
  clientId: z.string().uuid('clientId must be a valid UUID'),
  productType: z.string().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().nullable().optional(),
  weight: z.number().positive().nullable().optional(),
  volume: z.number().positive().nullable().optional(),
  pickupAddress: z.string().min(1, 'pickupAddress is required'),
  deliveryAddress: z.string().min(1, 'deliveryAddress is required'),
  pickupDate: z.string().min(1, 'pickupDate is required'),
  deliveryDate: z.string().nullable().optional(),
  executionType: executionTypeEnum,
  driverId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  estimatedFuelCost: z.number().nonnegative().nullable().optional(),
  estimatedSalaryCost: z.number().nonnegative().nullable().optional(),
  carrierId: z.string().uuid().nullable().optional(),
  carrierAgreedPrice: z.number().nonnegative().nullable().optional(),
  carrierVehicleInfo: z.string().nullable().optional(),
  clientPrice: z.number().nonnegative('clientPrice must be non-negative'),
  notes: z.string().nullable().optional(),
});

export const updateOrderSchema = createOrderSchema.partial();

export const updateOrderStatusSchema = z.object({
  status: orderStatusEnum,
});
