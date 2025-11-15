/*
  Warnings:

  - You are about to drop the column `lenguage` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "lenguage",
ADD COLUMN     "language" "public"."Language" NOT NULL DEFAULT 'UA';
