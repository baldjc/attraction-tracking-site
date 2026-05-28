-- Restore v1 Content Engine chat draft persistence on its own table.
-- See model `ContentEngineChatDraft` in schema.prisma for rationale.
CREATE TABLE "content_engine_chat_drafts" (
    "id"        TEXT PRIMARY KEY,
    "userId"    TEXT NOT NULL,
    "theme"     TEXT NOT NULL,
    "messages"  JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_engine_chat_drafts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "content_engine_chat_drafts_userId_theme_key"
  ON "content_engine_chat_drafts"("userId", "theme");
