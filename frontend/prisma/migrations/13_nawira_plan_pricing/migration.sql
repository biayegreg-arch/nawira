-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "planExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "priceFcfa" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingPlan_key_key" ON "PricingPlan"("key");

-- Seed the two priced plans so /app/billing keeps showing the same numbers
-- until an admin changes them (no visible behavior change on ship day).
INSERT INTO "PricingPlan" ("id", "key", "priceFcfa", "updatedAt", "updatedBy")
VALUES
  ('pricingplan_plus_seed', 'PLUS', 1000, CURRENT_TIMESTAMP, NULL),
  ('pricingplan_baby_seed', 'BABY', 2500, CURRENT_TIMESTAMP, NULL);
