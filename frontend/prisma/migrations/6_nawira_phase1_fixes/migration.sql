/*
  Warnings:

  - A unique constraint covering the columns `[userId,startDate]` on the table `Cycle` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[dailyLogId,symptom]` on the table `SymptomLog` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Cycle_userId_startDate_idx";

-- DropIndex
DROP INDEX "SymptomLog_dailyLogId_idx";

-- AlterTable
ALTER TABLE "Cycle" ALTER COLUMN "startDate" SET DATA TYPE DATE,
ALTER COLUMN "endDate" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "DailyLog" ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "FertilitySignal" ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "PeriodEvent" ALTER COLUMN "date" SET DATA TYPE DATE;

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_userId_startDate_key" ON "Cycle"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomLog_dailyLogId_symptom_key" ON "SymptomLog"("dailyLogId", "symptom");
