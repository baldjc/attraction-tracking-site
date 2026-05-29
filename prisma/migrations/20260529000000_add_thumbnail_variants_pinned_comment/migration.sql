-- AlterTable
ALTER TABLE "content_plans" ADD COLUMN "thumbnailVariants" JSONB;
ALTER TABLE "content_plans" ADD COLUMN "thumbnailWinnerId" TEXT;
ALTER TABLE "content_plans" ADD COLUMN "pinnedComment" TEXT;
