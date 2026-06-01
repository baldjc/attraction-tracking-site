// Market-agnostic status bucketing + derived-metric math.
//
// SINGLE SOURCE OF TRUTH for "which raw MLS status string counts as
// sold / off-market / active / pending". Everything that used to hardcode
// `status === "Sold"` (Pillar 9 / Calgary semantics) now resolves through here.
//
// Resolution precedence (resolveStatusMapping):
//   1. explicit `MarketConfig.statusMapping` override (admin escape hatch), else
//   2. derived from `MarketConfig.statusCodes` (canonical labels), else
//   3. derived from MARKET_SOURCE_DEFAULTS resolved off `mlsSource`.
//
// The four-bucket model collapses the canonical seven-way StatusCode taxonomy:
//   sold      <- canonical "sold"
//   offMarket <- canonical "expired" | "terminated" | "withdrawn"
//   active    <- canonical "active"
//   pending   <- canonical "pending"
//   (canonical "other" is intentionally dropped -> rows fall through to "unknown")

import {
  resolveMarketDefaults,
  type StatusCode,
} from "@/lib/market-config";
import type { Prisma } from "@/generated/prisma/client";

export type StatusBucket = "sold" | "offMarket" | "active" | "pending" | "unknown";

/**
 * Prisma `where` fragment that drops retired failure_rate facts from citation
 * queries. Legacy rows used the old offMarket/(offMarket+sold) denominator and
 * were backfilled to methodologyVersion "legacy_v1"; v2 rows use offMarket/sold.
 * Spread this into any MarketFact.findMany that surfaces facts to members so the
 * old numbers never get cited. Only FAILURE_RATE + legacy_v1 is excluded; every
 * other family (and all v2 rows) passes through untouched.
 */
export const EXCLUDE_LEGACY_FAILURE_RATE: Prisma.MarketFactWhereInput = {
  NOT: { metricFamily: "FAILURE_RATE", methodologyVersion: "legacy_v1" },
};

/** The four label sets that drive bucketing. Raw MLS strings, matched case-insensitively. */
export interface StatusMapping {
  sold: string[];
  offMarket: string[];
  active: string[];
  pending: string[];
}

/** Minimal config shape resolveStatusMapping needs (a MarketConfigShape satisfies it). */
export interface StatusMappingConfigInput {
  statusMapping?: unknown;
  statusCodes?: StatusCode[] | null;
  mlsSource?: string | null;
}

// The four mutable buckets (everything except the terminal "unknown").
const MAPPED_BUCKETS = ["sold", "offMarket", "active", "pending"] as const;
type MappedBucket = (typeof MAPPED_BUCKETS)[number];

/** Canonical StatusCode.canonical -> four-bucket projection. "other" -> null (dropped). */
function canonicalToBucket(canonical: StatusCode["canonical"]): MappedBucket | null {
  switch (canonical) {
    case "sold":
      return "sold";
    case "active":
      return "active";
    case "pending":
      return "pending";
    case "expired":
    case "terminated":
    case "withdrawn":
      return "offMarket";
    case "other":
    default:
      return null;
  }
}

function emptyMapping(): StatusMapping {
  return { sold: [], offMarket: [], active: [], pending: [] };
}

function isNonEmptyMapping(m: StatusMapping): boolean {
  return MAPPED_BUCKETS.some((b) => m[b].length > 0);
}

/**
 * Defensively parse a persisted `statusMapping` Json override. Returns a clean
 * StatusMapping (only known buckets, only non-empty string labels) or null if
 * the value is absent / malformed / contributes no usable labels. Mirrors the
 * "validate at every entry point" discipline used for columnMapping.
 */
export function validateStatusMapping(input: unknown): StatusMapping | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const out = emptyMapping();
  for (const bucket of MAPPED_BUCKETS) {
    const raw = src[bucket];
    if (!Array.isArray(raw)) continue;
    const labels: string[] = [];
    for (const v of raw) {
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (trimmed) labels.push(trimmed);
    }
    out[bucket] = labels;
  }
  return isNonEmptyMapping(out) ? out : null;
}

/** Build a StatusMapping from a canonical StatusCode[] list. */
function mappingFromStatusCodes(
  codes: StatusCode[] | null | undefined,
): StatusMapping | null {
  if (!Array.isArray(codes) || codes.length === 0) return null;
  const out = emptyMapping();
  for (const code of codes) {
    if (!code || typeof code.label !== "string") continue;
    const label = code.label.trim();
    if (!label) continue;
    const bucket = canonicalToBucket(code.canonical);
    if (bucket) out[bucket].push(label);
  }
  return isNonEmptyMapping(out) ? out : null;
}

/**
 * Resolve the active four-bucket status mapping for a market.
 *
 *   branch 1: explicit statusMapping override   (validateStatusMapping)
 *   branch 2: derived from statusCodes          (mappingFromStatusCodes)
 *   branch 3: derived from MARKET_SOURCE_DEFAULTS resolved off mlsSource
 *
 * Always returns a usable mapping (branch 3's GENERIC_MARKET_DEFAULTS guarantees
 * non-empty), so callers never have to handle null.
 */
export function resolveStatusMapping(
  config: StatusMappingConfigInput,
): StatusMapping {
  // Branch 1 — explicit admin override.
  const override = validateStatusMapping(config.statusMapping);
  if (override) return override;

  // Branch 2 — derive from the market's own statusCodes.
  const fromCodes = mappingFromStatusCodes(config.statusCodes);
  if (fromCodes) return fromCodes;

  // Branch 3 — fall back to per-source seed defaults (never empty).
  const seed = resolveMarketDefaults(config.mlsSource);
  const fromDefaults = mappingFromStatusCodes(seed.statusCodes);
  return fromDefaults ?? emptyMapping();
}

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase();
}

// Precompute a normalized lookup so bucketStatus is O(1) per row, not O(labels).
const MAPPING_INDEX_CACHE = new WeakMap<StatusMapping, Map<string, StatusBucket>>();

function indexFor(mapping: StatusMapping): Map<string, StatusBucket> {
  const cached = MAPPING_INDEX_CACHE.get(mapping);
  if (cached) return cached;
  const idx = new Map<string, StatusBucket>();
  // Insertion order = bucket precedence (sold first). First write wins on collision.
  for (const bucket of MAPPED_BUCKETS) {
    for (const label of mapping[bucket]) {
      const key = normalizeLabel(label);
      if (key && !idx.has(key)) idx.set(key, bucket);
    }
  }
  MAPPING_INDEX_CACHE.set(mapping, idx);
  return idx;
}

/**
 * Bucket a single raw MLS status string. Case- and whitespace-insensitive.
 * Returns "unknown" for empty/unmapped strings — callers MUST surface unknowns
 * (see countByBucket) rather than silently dropping them.
 */
export function bucketStatus(
  rawStatus: string | null | undefined,
  mapping: StatusMapping,
): StatusBucket {
  if (rawStatus == null) return "unknown";
  const key = normalizeLabel(String(rawStatus));
  if (!key) return "unknown";
  return indexFor(mapping).get(key) ?? "unknown";
}

export interface BucketCounts {
  sold: number;
  offMarket: number;
  active: number;
  pending: number;
  unknown: number;
}

export interface CountByBucketResult {
  counts: BucketCounts;
  /** Distinct raw labels that bucketed to "unknown", with occurrence counts. */
  unknownLabels: Map<string, number>;
}

/** Tally a list of raw status strings into the four buckets + unknown. */
export function countByBucket(
  rawStatuses: Array<string | null | undefined>,
  mapping: StatusMapping,
): CountByBucketResult {
  const counts: BucketCounts = {
    sold: 0,
    offMarket: 0,
    active: 0,
    pending: 0,
    unknown: 0,
  };
  const unknownLabels = new Map<string, number>();
  for (const raw of rawStatuses) {
    const bucket = bucketStatus(raw, mapping);
    counts[bucket] += 1;
    if (bucket === "unknown") {
      const label = (raw == null ? "" : String(raw).trim()) || "(blank)";
      unknownLabels.set(label, (unknownLabels.get(label) ?? 0) + 1);
    }
  }
  return { counts, unknownLabels };
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived metrics — PURE math, all return RATIOS (0..n), never percentages.
// Sample-size guards return null ("insufficient sample") so callers don't
// publish noisy ratios off tiny denominators.

/** Minimum closed sales before a sold-denominated ratio is trustworthy. */
export const MIN_SOLD_SAMPLE = 5;
/** Minimum off-market listings before a failure/sale-share ratio is trustworthy. */
export const MIN_OFF_MARKET_SAMPLE = 3;

/** True when both failure-rate inputs clear their sample floors. */
export function hasSufficientFailureSample(
  sold: number,
  offMarket: number,
): boolean {
  return sold >= MIN_SOLD_SAMPLE && offMarket >= MIN_OFF_MARKET_SAMPLE;
}

/**
 * Failure rate = offMarket / sold. Broker-honest ratio: "for every closed sale,
 * this many listings came off the market unsold". CAN exceed 1.0 (a cold market
 * where more listings fail than close). Returns null when sample is insufficient
 * or there were no sales.
 */
export function failureRate(sold: number, offMarket: number): number | null {
  if (sold <= 0) return null;
  if (!hasSufficientFailureSample(sold, offMarket)) return null;
  return offMarket / sold;
}

/**
 * Sale share = sold / (sold + offMarket). The bounded 0..1 companion to failure
 * rate ("share of resolved listings that actually closed"). Returns null when
 * sample is insufficient or there were no resolved listings.
 */
export function saleShare(sold: number, offMarket: number): number | null {
  const resolved = sold + offMarket;
  if (resolved <= 0) return null;
  if (!hasSufficientFailureSample(sold, offMarket)) return null;
  return sold / resolved;
}

/**
 * Absorption rate = sold / active. How much of standing inventory cleared in the
 * period. Returns null without standing inventory or with too few sales.
 */
export function absorptionRate(sold: number, active: number): number | null {
  if (active <= 0) return null;
  if (sold < MIN_SOLD_SAMPLE) return null;
  return sold / active;
}

/**
 * Months of inventory (strict) = active / sold. Returns null without sales or
 * with too few sales to be meaningful.
 */
export function monthsOfInventory(active: number, sold: number): number | null {
  if (sold <= 0) return null;
  if (sold < MIN_SOLD_SAMPLE) return null;
  return active / sold;
}
