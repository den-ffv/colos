-- CreateEnum
CREATE TYPE "DriverPayType" AS ENUM ('PER_KM', 'PER_HOUR', 'PER_DAY', 'FIXED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "pay_rate" DOUBLE PRECISION,
ADD COLUMN     "pay_type" "DriverPayType" NOT NULL DEFAULT 'PER_KM';
