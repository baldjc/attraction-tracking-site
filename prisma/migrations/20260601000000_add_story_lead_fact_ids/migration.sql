-- AlterTable
ALTER TABLE "market_story_leads" ADD COLUMN "anchorFactId" TEXT;
ALTER TABLE "market_story_leads" ADD COLUMN "supportingFactIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
