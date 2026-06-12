-- Selectable content-idea cards for the Jarvis browse-ideas flow (browse story
-- leads / theme ideas / validation results). Mirrors proposalState: JSONB,
-- nullable. The field was added to the schema and applied in dev via
-- `prisma db push`; this migration tracks it so `prisma migrate deploy` adds
-- the column in production (otherwise Jarvis thread reads/writes that reference
-- ideasState fail with "column does not exist").
-- IF NOT EXISTS makes this idempotent: in environments where the column was
-- already added out-of-band via `prisma db push` (e.g. dev), `migrate deploy`
-- is a safe no-op instead of failing with "column already exists".
ALTER TABLE "content_manager_messages" ADD COLUMN IF NOT EXISTS "ideasState" JSONB;
