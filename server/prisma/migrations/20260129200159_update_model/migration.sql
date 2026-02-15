/*
  Warnings:

  - You are about to drop the column `companyId` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `companyName` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `contactPerson` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `coverageAreas` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `isAvailable` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `maxCapacity` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleTypes` on the `carriers` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `companyName` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `contactPerson` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `hasOwnFleet` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `operationMode` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `usesBrokerServices` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `isAvailable` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `licenseNumber` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `assignedManagerId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `carrierAgreedPrice` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `carrierId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `carrierPaid` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `carrierVehicleInfo` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `clientPaid` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `clientPrice` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryAddress` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `driverId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedFuelCost` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedSalaryCost` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `executionType` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `externalCost` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `internalCost` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `marginPercent` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `orderNumber` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `pickupAddress` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `pickupDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `productType` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `totalCost` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `isAvailable` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `plateNumber` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `vehicles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[order_number]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `company_id` to the `carriers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_name` to the `carriers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contact_person` to the `carriers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_capacity` to the `carriers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `carriers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_id` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_name` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contact_person` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `companies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_id` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `first_name` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last_name` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `license_number` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assigned_manager_id` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `client_id` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `client_price` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_id` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `delivery_address` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `execution_type` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `margin_percent` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order_number` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickup_address` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickup_date` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_cost` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_id` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `first_name` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last_name` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_id` to the `vehicles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plate_number` to the `vehicles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `vehicles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UiLanguage" AS ENUM ('ENG', 'UA');

-- DropForeignKey
ALTER TABLE "carriers" DROP CONSTRAINT "carriers_companyId_fkey";

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_companyId_fkey";

-- DropForeignKey
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_companyId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_assignedManagerId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_carrierId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_clientId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_companyId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_driverId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_companyId_fkey";

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_companyId_fkey";

-- DropIndex
DROP INDEX "orders_orderNumber_key";

-- AlterTable
ALTER TABLE "carriers" DROP COLUMN "companyId",
DROP COLUMN "companyName",
DROP COLUMN "contactPerson",
DROP COLUMN "coverageAreas",
DROP COLUMN "createdAt",
DROP COLUMN "isAvailable",
DROP COLUMN "maxCapacity",
DROP COLUMN "updatedAt",
DROP COLUMN "vehicleTypes",
ADD COLUMN     "company_id" TEXT NOT NULL,
ADD COLUMN     "company_name" TEXT NOT NULL,
ADD COLUMN     "contact_person" TEXT NOT NULL,
ADD COLUMN     "coverage_areas" TEXT[],
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_capacity" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vehicle_types" "VehicleType"[];

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "companyId",
DROP COLUMN "companyName",
DROP COLUMN "contactPerson",
DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "company_id" TEXT NOT NULL,
ADD COLUMN     "company_name" TEXT NOT NULL,
ADD COLUMN     "contact_person" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "createdAt",
DROP COLUMN "hasOwnFleet",
DROP COLUMN "operationMode",
DROP COLUMN "updatedAt",
DROP COLUMN "usesBrokerServices",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "has_own_fleet" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "operation_mode" "OperationMode" NOT NULL DEFAULT 'HYBRID',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "uses_broker_services" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "companyId",
DROP COLUMN "createdAt",
DROP COLUMN "firstName",
DROP COLUMN "isAvailable",
DROP COLUMN "lastName",
DROP COLUMN "licenseNumber",
DROP COLUMN "updatedAt",
ADD COLUMN     "company_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_name" TEXT NOT NULL,
ADD COLUMN     "license_number" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "assignedManagerId",
DROP COLUMN "carrierAgreedPrice",
DROP COLUMN "carrierId",
DROP COLUMN "carrierPaid",
DROP COLUMN "carrierVehicleInfo",
DROP COLUMN "clientId",
DROP COLUMN "clientPaid",
DROP COLUMN "clientPrice",
DROP COLUMN "companyId",
DROP COLUMN "createdAt",
DROP COLUMN "deliveryAddress",
DROP COLUMN "deliveryDate",
DROP COLUMN "driverId",
DROP COLUMN "estimatedFuelCost",
DROP COLUMN "estimatedSalaryCost",
DROP COLUMN "executionType",
DROP COLUMN "externalCost",
DROP COLUMN "internalCost",
DROP COLUMN "marginPercent",
DROP COLUMN "orderNumber",
DROP COLUMN "pickupAddress",
DROP COLUMN "pickupDate",
DROP COLUMN "productType",
DROP COLUMN "totalCost",
DROP COLUMN "updatedAt",
DROP COLUMN "vehicleId",
ADD COLUMN     "assigned_manager_id" TEXT NOT NULL,
ADD COLUMN     "carrier_agreed_price" DOUBLE PRECISION,
ADD COLUMN     "carrier_id" TEXT,
ADD COLUMN     "carrier_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "carrier_vehicle_info" TEXT,
ADD COLUMN     "client_id" TEXT NOT NULL,
ADD COLUMN     "client_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "client_price" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "company_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "delivery_address" TEXT NOT NULL,
ADD COLUMN     "delivery_date" TIMESTAMP(3),
ADD COLUMN     "driver_id" TEXT,
ADD COLUMN     "estimated_fuel_cost" DOUBLE PRECISION,
ADD COLUMN     "estimated_salary_cost" DOUBLE PRECISION,
ADD COLUMN     "execution_type" "ExecutionType" NOT NULL,
ADD COLUMN     "external_cost" DOUBLE PRECISION,
ADD COLUMN     "internal_cost" DOUBLE PRECISION,
ADD COLUMN     "margin_percent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "order_number" TEXT NOT NULL,
ADD COLUMN     "pickup_address" TEXT NOT NULL,
ADD COLUMN     "pickup_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "product_type" TEXT,
ADD COLUMN     "total_cost" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vehicle_id" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "companyId",
DROP COLUMN "createdAt",
DROP COLUMN "firstName",
DROP COLUMN "isActive",
DROP COLUMN "lastName",
DROP COLUMN "role",
DROP COLUMN "updatedAt",
ADD COLUMN     "company_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_name" TEXT NOT NULL,
ADD COLUMN     "ui_language" "UiLanguage" NOT NULL DEFAULT 'UA',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "companyId",
DROP COLUMN "createdAt",
DROP COLUMN "isAvailable",
DROP COLUMN "plateNumber",
DROP COLUMN "updatedAt",
ADD COLUMN     "company_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "plate_number" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_manager" BOOLEAN NOT NULL DEFAULT false,
    "is_dispatcher" BOOLEAN NOT NULL DEFAULT false,
    "is_accountant" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_title_key" ON "roles"("title");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carriers" ADD CONSTRAINT "carriers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_manager_id_fkey" FOREIGN KEY ("assigned_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
