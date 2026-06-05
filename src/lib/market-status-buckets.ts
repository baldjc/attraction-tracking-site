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
    if (bucket) {
      out[bucket].push(label);
      // Also register the canonical word itself (sold/active/pending/expired/
      // terminated/withdrawn) so a market whose configured labels are
      // abbreviations (e.g. "S"/"X") still recognizes full-word MLS exports
      // ("SOLD"/"EXPIRED"). Additive only — exact-match precedence (and the
      // first-write-wins index) is unchanged; the configured label still wins.
      if (code.canonical !== "other") out[bucket].push(code.canonical);
    }
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

/**
 * Exact-then-token lookup against a precomputed index.
 *
 * 1. Exact normalized match (the only path for single-word labels — preserves
 *    the original "unmapped word -> caller's fallback" behavior, e.g. a bare
 *    "Foreclosure" stays unknown and an admin override that omits a label does
 *    not leak canonical words).
 * 2. On an exact MISS for a COMPOSITE label (>1 token), match each
 *    whitespace/punctuation-delimited token against the SAME index and return
 *    the highest-precedence hit. This rescues MLS exports that glue a code to a
 *    word, e.g. "X - EXPIRED" (tokens "x" / "expired"). Because it only fires
 *    after an exact miss, it can never override an explicit single-label match.
 */
function lookupWithTokenFallback<T>(
  key: string,
  index: Map<string, T>,
  precedence: readonly T[],
): T | null {
  const exact = index.get(key);
  if (exact !== undefined) return exact;
  const tokens = key.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length < 2) return null;
  let best: T | null = null;
  let bestRank = Infinity;
  for (const tok of tokens) {
    const hit = index.get(tok);
    if (hit === undefined) continue;
    const rank = precedence.indexOf(hit);
    if (rank >= 0 && rank < bestRank) {
      best = hit;
      bestRank = rank;
    }
  }
  return best;
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
// Token-fallback precedence for composite labels: a row mentioning "sold" is
// sold; off-market signals dominate; "pending" beats a bare "active" (so
// "active pending"/"active under contract" reads as pending); plain "active" is
// the weakest default.
const BUCKET_TOKEN_PRECEDENCE: readonly StatusBucket[] = [
  "sold",
  "offMarket",
  "pending",
  "active",
];

export function bucketStatus(
  rawStatus: string | null | undefined,
  mapping: StatusMapping,
): StatusBucket {
  if (rawStatus == null) return "unknown";
  const key = normalizeLabel(String(rawStatus));
  if (!key) return "unknown";
  return (
    lookupWithTokenFallback(key, indexFor(mapping), BUCKET_TOKEN_PRECEDENCE) ??
    "unknown"
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Off-market SUB-bucketing.
//
// Splits the collapsed `offMarket` bucket back into its canonical expired /
// terminated / withdrawn parts so the failure-rate methodology VARIANTS
// (expired-only, expired+withdrawn) can be computed. Driven by the SAME
// statusCodes taxonomy as the four-bucket model — never hardcoded status
// strings. When the granularity isn't resolvable (e.g. a four-bucket
// statusMapping override that doesn't distinguish sub-types), classification
// returns null and only the "all off-market" variant stays exact.

export type OffMarketSubBucket = "expired" | "terminated" | "withdrawn";

const OFF_MARKET_SUBS = ["expired", "terminated", "withdrawn"] as const;

export interface OffMarketSubMapping {
  expired: string[];
  terminated: string[];
  withdrawn: string[];
}

function canonicalToSub(
  canonical: StatusCode["canonical"],
): OffMarketSubBucket | null {
  switch (canonical) {
    case "expired":
      return "expired";
    case "terminated":
      return "terminated";
    case "withdrawn":
      return "withdrawn";
    default:
      return null;
  }
}

function subMappingFromStatusCodes(
  codes: StatusCode[] | null | undefined,
): OffMarketSubMapping | null {
  if (!Array.isArray(codes) || codes.length === 0) return null;
  const out: OffMarketSubMapping = { expired: [], terminated: [], withdrawn: [] };
  let any = false;
  for (const code of codes) {
    if (!code || typeof code.label !== "string") continue;
    const label = code.label.trim();
    if (!label) continue;
    const sub = canonicalToSub(code.canonical);
    if (sub) {
      out[sub].push(label);
      // Register the canonical sub-word too (expired/terminated/withdrawn) so
      // abbreviation-configured markets still classify full-word exports. See
      // mappingFromStatusCodes for the rationale.
      out[sub].push(sub);
      any = true;
    }
  }
  return any ? out : null;
}

/**
 * Resolve the off-market sub-mapping for a market. Mirrors resolveStatusMapping
 * but only branches 2 (statusCodes) and 3 (seed defaults) — a four-bucket
 * statusMapping override carries no sub-type granularity, so when one is in
 * force the sub-mapping still derives from statusCodes/seed for classification.
 * Always returns a usable (possibly empty) mapping.
 */
export function resolveOffMarketSubMapping(
  config: StatusMappingConfigInput,
): OffMarketSubMapping {
  const fromCodes = subMappingFromStatusCodes(config.statusCodes);
  if (fromCodes) return fromCodes;
  const seed = resolveMarketDefaults(config.mlsSource);
  const fromDefaults = subMappingFromStatusCodes(seed.statusCodes);
  return fromDefaults ?? { expired: [], terminated: [], withdrawn: [] };
}

const SUB_INDEX_CACHE = new WeakMap<
  OffMarketSubMapping,
  Map<string, OffMarketSubBucket>
>();

function subIndexFor(
  mapping: OffMarketSubMapping,
): Map<string, OffMarketSubBucket> {
  const cached = SUB_INDEX_CACHE.get(mapping);
  if (cached) return cached;
  const idx = new Map<string, OffMarketSubBucket>();
  for (const sub of OFF_MARKET_SUBS) {
    for (const label of mapping[sub]) {
      const key = normalizeLabel(label);
      if (key && !idx.has(key)) idx.set(key, sub);
    }
  }
  SUB_INDEX_CACHE.set(mapping, idx);
  return idx;
}

// Sub-bucket precedence mirrors the order off-market sub-types are tallied.
const SUB_TOKEN_PRECEDENCE: readonly OffMarketSubBucket[] = [
  "expired",
  "terminated",
  "withdrawn",
];

/** Classify a raw off-market status into its sub-bucket, or null if unmapped. */
export function classifyOffMarketSub(
  rawStatus: string | null | undefined,
  mapping: OffMarketSubMapping,
): OffMarketSubBucket | null {
  if (rawStatus == null) return null;
  const key = normalizeLabel(String(rawStatus));
  if (!key) return null;
  return lookupWithTokenFallback(key, subIndexFor(mapping), SUB_TOKEN_PRECEDENCE);
}

export interface OffMarketSubCounts {
  expired: number;
  terminated: number;
  withdrawn: number;
}

export type FailureDenominatorVariant =
  | "all"
  | "expired_only"
  | "expired_plus_withdrawn";

/**
 * Off-market denominator for a failure-rate variant. `total` is the FULL
 * offMarket count (== expired+terminated+withdrawn when fully classified) and
 * is used for the "all" variant so it EXACTLY reproduces the shipping failure
 * rate even when sub-classification is incomplete (e.g. override path).
 */
export function failureDenominator(
  total: number,
  sub: OffMarketSubCounts,
  variant: FailureDenominatorVariant,
): number {
  switch (variant) {
    case "expired_only":
      return sub.expired;
    case "expired_plus_withdrawn":
      return sub.expired + sub.withdrawn;
    case "all":
    default:
      return total;
  }
}
