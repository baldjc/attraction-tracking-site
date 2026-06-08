-- CreateTable
CREATE TABLE "research_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "extractedClaims" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_sources_userId_idx" ON "research_sources"("userId");

-- CreateIndex
CREATE INDEX "research_sources_threadId_idx" ON "research_sources"("threadId");

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
