-- Per-member metric methodology settings ("How we calculate your stats").
-- One row per member; an absent row means the Default preset.
CREATE TABLE "member_metric_settings" (
    "userId" TEXT NOT NULL,
    "moiVariant" TEXT NOT NULL DEFAULT 'active_plus_pending_single',
    "domVariant" TEXT NOT NULL DEFAULT 'average',
    "failureRateVariant" TEXT NOT NULL DEFAULT 'all_off_market',
    "salePriceVariant" TEXT NOT NULL DEFAULT 'median',
    "sampleSizeVariant" TEXT NOT NULL DEFAULT 'conservative',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_metric_settings_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "member_metric_settings"
    ADD CONSTRAINT "member_metric_settings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Methodology snapshot stamped on each prose MarketFact at validation time.
ALTER TABLE "market_facts" ADD COLUMN "methodologyVariant" JSONB;
