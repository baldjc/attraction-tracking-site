-- Wave 4 beta (Finding 12) — drop the singleton constraint on
-- ContentEngineDraft so a member can have multiple concurrent drafts
-- (two tabs, parallel idea explorations). Also add a compound index on
-- (userId, updatedAt) for the "newest-first" My Work drafts query.
DROP INDEX IF EXISTS "content_engine_drafts_userId_key";
DROP INDEX IF EXISTS "content_engine_drafts_userId_idx";
CREATE INDEX "content_engine_drafts_userId_updatedAt_idx"
  ON "content_engine_drafts"("userId", "updatedAt");
