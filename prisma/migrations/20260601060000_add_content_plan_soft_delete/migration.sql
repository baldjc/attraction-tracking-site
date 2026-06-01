-- Add soft-delete column to content_plans. Null = live plan; non-null = deleted
-- (hidden from every member-facing read, retained for admin restore).
ALTER TABLE "content_plans" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index for member-facing reads that filter on (userId, deletedAt).
CREATE INDEX "content_plans_userId_deletedAt_idx" ON "content_plans"("userId", "deletedAt");

-- Data migration: convert the legacy "Archived" status into soft-deletes. Those
-- plans were previously hidden only from a handful of views and still leaked
-- into dashboards, the calendar feed, and binge selectors. Move them onto the
-- new deletedAt model and reset their status to 'Idea' so an admin restore
-- returns a clean, editable plan instead of an orphaned "Archived" string.
UPDATE "content_plans"
SET "deletedAt" = NOW(), "status" = 'Idea'
WHERE "status" = 'Archived' AND "deletedAt" IS NULL;
