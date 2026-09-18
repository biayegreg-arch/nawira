-- CreateTable
CREATE TABLE "AccountActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountActivity_userId_createdAt_idx" ON "AccountActivity"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountActivity" ADD CONSTRAINT "AccountActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
