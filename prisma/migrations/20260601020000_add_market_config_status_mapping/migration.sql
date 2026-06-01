-- MarketConfig: optional explicit status-bucketing override (source of truth stays statusCodes)
ALTER TABLE "market_configs" ADD COLUMN "statusMapping" JSONB;

-- MarketFact: methodology version for derived metrics (primarily FAILURE_RATE)
ALTER TABLE "market_facts" ADD COLUMN "methodologyVersion" TEXT DEFAULT 'v2';

-- Backfill: every pre-existing failure_rate fact was produced with the WRONG
-- denominator offMarket/(sold+offMarket). Mark them legacy_v1 so citation queries
-- exclude them until their upload is re-validated under the v2 (offMarket/sold) formula.
UPDATE "market_facts" SET "methodologyVersion" = 'legacy_v1' WHERE "metricFamily" = 'FAILURE_RATE';
