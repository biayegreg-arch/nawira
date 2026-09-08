/*
  Warnings:

  - A unique constraint covering the columns `[userId,date,type]` on the table `FertilitySignal` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "FertilitySignal_userId_date_idx";

-- CreateIndex
CREATE UNIQUE INDEX "FertilitySignal_userId_date_type_key" ON "FertilitySignal"("userId", "date", "type");
