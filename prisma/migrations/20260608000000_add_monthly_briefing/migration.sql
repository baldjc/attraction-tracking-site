-- CreateTable
CREATE TABLE "monthly_briefings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "ideas" JSONB NOT NULL,
    "factsValidated" INTEGER NOT NULL,
    "sources" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_briefings_userId_idx" ON "monthly_briefings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_briefings_userId_monthYear_key" ON "monthly_briefings"("userId", "monthYear");

-- AddForeignKey
ALTER TABLE "monthly_briefings" ADD CONSTRAINT "monthly_briefings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
