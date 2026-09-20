-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropForeignKey
ALTER TABLE "Withdrawal" DROP CONSTRAINT "Withdrawal_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "withdrawalPinHash";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "WebhookLog";

-- DropTable
DROP TABLE "Withdrawal";

