-- CreateTable
CREATE TABLE "excluded_neighbourhoods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excluded_neighbourhoods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "excluded_neighbourhoods_userId_idx" ON "excluded_neighbourhoods"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "excluded_neighbourhoods_userId_normName_key" ON "excluded_neighbourhoods"("userId", "normName");

-- AddForeignKey
ALTER TABLE "excluded_neighbourhoods" ADD CONSTRAINT "excluded_neighbourhoods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
