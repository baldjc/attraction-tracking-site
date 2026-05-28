-- Wave 4 — reshape ContentEngineDraft. Old (theme, messages) shape was
-- never referenced by application code, so we drop and recreate cleanly
-- rather than try to backfill currentStep/expiresAt.
DROP TABLE IF EXISTS "content_engine_drafts";

CREATE TABLE "content_engine_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "propertyTypeFocus" TEXT,
    "storyLeadId" TEXT,
    "rotationSlot" TEXT,
    "validatedIdea" TEXT,
    "storyLeadFactIds" JSONB,
    "generatedIdeaCards" JSONB,
    "validationContext" JSONB,
    "pickedKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_engine_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_engine_drafts_userId_key" ON "content_engine_drafts"("userId");
CREATE INDEX "content_engine_drafts_userId_idx" ON "content_engine_drafts"("userId");
CREATE INDEX "content_engine_drafts_expiresAt_idx" ON "content_engine_drafts"("expiresAt");

ALTER TABLE "content_engine_drafts" ADD CONSTRAINT "content_engine_drafts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
