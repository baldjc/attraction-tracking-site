-- Canonicalize service tiers: consolidate the 6-value granular enum down to the
-- canonical 4 (foundations, production, growth, done_with_you) while preserving
-- the legacy edited-videos-per-month count in a new dedicated column.
--
-- editing_2 / mastery_2 -> count 2 ; editing_4 / mastery_4 -> count 4.
-- editing_* -> production ; mastery_* -> growth ; foundations/done_with_you keep.
-- Tier-gating reads ONLY the 4-value enum; the count is internal/admin-only.

-- 1. New column for the contracted editing volume.
ALTER TABLE "users" ADD COLUMN "editedVideosPerMonth" INTEGER;

-- 2. Backfill the count from the legacy granular tier value BEFORE remapping.
UPDATE "users" SET "editedVideosPerMonth" = 2
  WHERE "serviceTier" IN ('editing_2', 'mastery_2');
UPDATE "users" SET "editedVideosPerMonth" = 4
  WHERE "serviceTier" IN ('editing_4', 'mastery_4');

-- 3. Recreate the enum type with the canonical 4 values and remap the column.
CREATE TYPE "ServiceTier_new" AS ENUM ('foundations', 'production', 'growth', 'done_with_you');

ALTER TABLE "users" ALTER COLUMN "serviceTier" DROP DEFAULT;

ALTER TABLE "users" ALTER COLUMN "serviceTier" TYPE "ServiceTier_new"
  USING (
    CASE "serviceTier"::text
      WHEN 'editing_2' THEN 'production'
      WHEN 'editing_4' THEN 'production'
      WHEN 'mastery_2' THEN 'growth'
      WHEN 'mastery_4' THEN 'growth'
      WHEN 'done_with_you' THEN 'done_with_you'
      ELSE 'foundations'
    END
  )::"ServiceTier_new";

ALTER TABLE "users" ALTER COLUMN "serviceTier" SET DEFAULT 'foundations';

DROP TYPE "ServiceTier";
ALTER TYPE "ServiceTier_new" RENAME TO "ServiceTier";
