-- AlterEnum: Add LOGIST and DRIVER values to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'LOGIST';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DRIVER';

-- AlterTable: Add user_id to drivers (optional link to User account)
ALTER TABLE "drivers" ADD COLUMN "user_id" TEXT;

-- CreateIndex: Unique constraint on drivers.user_id
CREATE UNIQUE INDEX IF NOT EXISTS "drivers_user_id_key" ON "drivers"("user_id");

-- AddForeignKey: drivers.user_id → users.id
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
