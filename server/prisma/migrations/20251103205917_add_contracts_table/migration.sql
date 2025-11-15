-- CreateTable
CREATE TABLE "public"."companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contract_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "is_in_progress" BOOLEAN NOT NULL DEFAULT false,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "contract_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transport_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_truck" BOOLEAN NOT NULL DEFAULT false,
    "is_minibus" BOOLEAN NOT NULL DEFAULT false,
    "is_lightweight" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transport_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transport_units" (
    "id" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "transport_type_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "model" TEXT,
    "year" INTEGER,
    "capacity" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transport_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."road_freight_contractors" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "account_type" "public"."AccountType" NOT NULL DEFAULT 'user',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "road_freight_contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contracts" (
    "id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "departure_point" JSONB NOT NULL,
    "destination_point" JSONB NOT NULL,
    "departure_date" TIMESTAMP(3) NOT NULL,
    "departure_time" TEXT NOT NULL,
    "passenger_count" INTEGER NOT NULL,
    "additional_info" TEXT,
    "route_data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "total_price" DOUBLE PRECISION,
    "contractor_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_statuses_name_key" ON "public"."contract_statuses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_types_name_key" ON "public"."transport_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "transport_units_registration_number_key" ON "public"."transport_units"("registration_number");

-- AddForeignKey
ALTER TABLE "public"."transport_units" ADD CONSTRAINT "transport_units_transport_type_id_fkey" FOREIGN KEY ("transport_type_id") REFERENCES "public"."transport_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transport_units" ADD CONSTRAINT "transport_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "public"."road_freight_contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
