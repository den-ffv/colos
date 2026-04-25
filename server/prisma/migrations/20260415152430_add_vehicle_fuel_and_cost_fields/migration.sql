-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "cargo_volume" DOUBLE PRECISION,
ADD COLUMN     "cost_per_km" DOUBLE PRECISION,
ADD COLUMN     "fuel_consumption" DOUBLE PRECISION,
ADD COLUMN     "fuel_type" "FuelType",
ADD COLUMN     "max_range" DOUBLE PRECISION,
ADD COLUMN     "tank_capacity" DOUBLE PRECISION;
