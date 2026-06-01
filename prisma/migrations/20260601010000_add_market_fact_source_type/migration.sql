-- AlterTable
ALTER TABLE "market_facts" ADD COLUMN     "extractedAtCost" DECIMAL(10,4),
ADD COLUMN     "extractedAtRequest" TEXT,
ADD COLUMN     "sourceType" TEXT DEFAULT 'validator';

-- CreateTable
CREATE TABLE "on_demand_extraction_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "needSpec" JSONB NOT NULL,
    "estimatedCostUsd" DECIMAL(10,4) NOT NULL,
    "actualCostUsd" DECIMAL(10,4),
    "resultClassification" TEXT NOT NULL,
    "factId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "on_demand_extraction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "on_demand_extraction_logs_userId_createdAt_idx" ON "on_demand_extraction_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "on_demand_extraction_logs_uploadId_idx" ON "on_demand_extraction_logs"("uploadId");

-- CreateIndex
CREATE INDEX "market_facts_userId_sourceType_idx" ON "market_facts"("userId", "sourceType");

-- AddForeignKey
ALTER TABLE "on_demand_extraction_logs" ADD CONSTRAINT "on_demand_extraction_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
