-- Active voice selection for the Content Manager / Script Builder.
-- "custom" (or NULL) -> apply uploaded voiceGuide; "default" -> built-in register.
ALTER TABLE "market_configs" ADD COLUMN "voiceMode" TEXT DEFAULT 'custom';
