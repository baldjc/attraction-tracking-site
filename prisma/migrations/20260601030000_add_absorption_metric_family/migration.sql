-- AlterEnum
-- Phase 1 fix (Known Issue #1): absorption rate (Sold ÷ Active) becomes its own
-- MetricFamily so it gets a dedicated sample floor + formatter. Additive only.
ALTER TYPE "MetricFamily" ADD VALUE 'ABSORPTION';
