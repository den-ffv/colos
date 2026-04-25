-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'DRIVER_ACCEPTED';
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PREPAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE 'PREPAID';
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_FINAL_PAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "final_paid_amount" DOUBLE PRECISION,
ADD COLUMN     "final_paid_at" TIMESTAMP(3),
ADD COLUMN     "prepaid_amount" DOUBLE PRECISION,
ADD COLUMN     "prepaid_at" TIMESTAMP(3),
ADD COLUMN     "total_paid" DOUBLE PRECISION NOT NULL DEFAULT 0;
