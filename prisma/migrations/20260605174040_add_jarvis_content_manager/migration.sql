-- CreateTable
CREATE TABLE "content_manager_threads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_manager_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_manager_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "toolCalls" JSONB,
    "proposalState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_manager_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_manager_threads_userId_idx" ON "content_manager_threads"("userId");

-- CreateIndex
CREATE INDEX "content_manager_messages_threadId_idx" ON "content_manager_messages"("threadId");

-- AddForeignKey
ALTER TABLE "content_manager_threads" ADD CONSTRAINT "content_manager_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_manager_messages" ADD CONSTRAINT "content_manager_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "content_manager_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

