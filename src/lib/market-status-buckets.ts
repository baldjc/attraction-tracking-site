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
 * queries. The earliest failure_rate facts were backfilled to methodologyVersion
 * "legacy_v1" and are excluded here so their old numbers never get cited. Current
 * facts are stamped "v2": broker-honest off-market counts (Expired + Terminated +
 * Withdrawn) over the bounded offMarket/(sold+offMarket) share — the failureRate()
 * helper below. (An interim v2 build briefly used an unbounded offMarket/sold
 * ratio; that has been reverted to the bounded share, and any pre-revert >100%
 * values still stored under "v2" are caught both here (the metricValue > 100
 * clause below) AND at the script/content framing layer by the
 * failure_rate_framing safety net.) Spread this into any MarketFact.findMany that
 * surfaces facts to members. Only FAILURE_RATE rows are ever excluded — either the
 * legacy_v1 methodology or an impossible >100 value; every other family, and every
 * bounded (≤100) v2 row, passes through untouched.
 */
export const EXCLUDE_LEGACY_FAILURE_RATE: Prisma.MarketFactWhereInput = {
  // Array form = exclude a row matching EITHER clause (AND of negations):
  //  1. the explicitly-retired legacy_v1 methodology, and
  //  2. any FAILURE_RATE fact whose stored value exceeds 100 — impossible for a
  //     bounded 0–100% share, so it can only be a pre-revert unbounded
  //     offMarket/sold value that slipped in under the "v2" tag. Dropping it
  //     here keeps those impossible numbers out of every member-facing citation
  //     query without a data migration. (Legacy unbounded values that happen to
  //     land ≤100 are indistinguishable from honest ones by value alone — those
  //     need a methodology re-tag + re-validation; see fact-validator.ts note.)
  NOT: [
    { metricFamily: "FAILURE_RATE", methodologyVersion: "legacy_v1" },
    { metricFamily: "FAILURE_RATE", metricValue: { gt: 100 } },
  ],
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
// Member-facing status mapping setup (Task #66).
//
// When a member uploads a CSV whose status column contains values that don't
// resolve under their current mapping (countByBucket().unknownLabels), we ask
// them to confirm each one. proposeStatusBucket() seeds that UI with a best
// guess so the common case is one click; mergeConfirmationsIntoMapping() folds
// the member's confirmations into an explicit statusMapping override that
// resolveStatusMapping's branch-1 then honours on every future upload.

/** A bucket a member can assign a raw status to (everything except "unknown"). */
export type MappableBucket = MappedBucket;

// Phrase/word patterns matched as substrings of the normalized (lowercased,
// trimmed) raw label. Ordered checks: sold → offMarket → pending → active,
// mirroring BUCKET_TOKEN_PRECEDENCE so "active under contract" reads pending
// and a stray off-market word never gets swallowed by a generic "active".
const PROPOSE_SOLD_PATTERNS = [
  "sold",
  "closed",
  "close of escrow",
  "settled",
  "completed",
  "firm sale",
  "clsd",
  "sld",
];
const PROPOSE_OFFMARKET_PATTERNS = [
  "expired",
  "cancel", // cancel / canceled / cancelled
  "terminated",
  "terminate",
  "withdrawn",
  "withdraw",
  "off market",
  "off-market",
  "offmarket",
  "dead",
  "fell through",
];
const PROPOSE_PENDING_PATTERNS = [
  "pending",
  "conditional",
  "under contract",
  "contingent",
  "backup",
  "accepting backups",
  "offer accepted",
  "sale pending",
  "ucb",
  "cnd",
  "cond",
];
const PROPOSE_ACTIVE_PATTERNS = [
  "active",
  "for sale",
  "available",
  "on market",
  "on-market",
];

// Exact single-letter / short MLS status codes. Kept separate from the
// substring patterns because a single letter ("a") must match exactly, never
// as a substring of a longer word.
const PROPOSE_EXACT_CODES: Record<string, MappableBucket> = {
  s: "sold",
  sld: "sold",
  c: "sold", // Closed (NTREIS/RESO) — same convention as the preflight tokenizer
  cl: "sold",
  clsd: "sold",
  a: "active",
  act: "active",
  p: "pending",
  pend: "pending",
  cnd: "pending",
  ctg: "pending",
  x: "offMarket",
  e: "offMarket",
  exp: "offMarket",
  t: "offMarket",
  term: "offMarket",
  w: "offMarket",
  wd: "offMarket",
  wth: "offMarket",
};

/**
 * Deterministic best-guess bucket for an unrecognized raw MLS status label,
 * using common cross-board naming conventions. Returns null when nothing
 * matches confidently — the member then picks from the dropdown themselves
 * (we never silently mis-file an ambiguous value like "Coming Soon" or
 * "Leased"). Pure + side-effect-free; safe to import client-side.
 */
export function proposeStatusBucket(
  rawLabel: string | null | undefined,
): MappableBucket | null {
  if (rawLabel == null) return null;
  const key = normalizeLabel(String(rawLabel));
  if (!key) return null;

  // Exact short-code match first (so "a" → active, not a substring false hit).
  const exact = PROPOSE_EXACT_CODES[key];
  if (exact) return exact;

  const has = (patterns: string[]) => patterns.some((p) => key.includes(p));
  if (has(PROPOSE_SOLD_PATTERNS)) return "sold";
  if (has(PROPOSE_OFFMARKET_PATTERNS)) return "offMarket";
  if (has(PROPOSE_PENDING_PATTERNS)) return "pending";
  if (has(PROPOSE_ACTIVE_PATTERNS)) return "active";

  // Token fallback for glued composites the substring pass missed
  // (e.g. "X/EXPIRED" → tokens "x","expired"). Reuse the exact-code table per
  // token; precedence sold > offMarket > pending > active (a terminal state like
  // sold/off-market wins over a transient pending, which wins over active).
  const PROPOSE_TOKEN_PRECEDENCE: MappableBucket[] = [
    "sold",
    "offMarket",
    "pending",
    "active",
  ];
  const tokens = key.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length >= 2) {
    let best: MappableBucket | null = null;
    let bestRank = Infinity;
    for (const tok of tokens) {
      const hit = PROPOSE_EXACT_CODES[tok];
      if (!hit) continue;
      const rank = PROPOSE_TOKEN_PRECEDENCE.indexOf(hit);
      if (rank < bestRank) {
        best = hit;
        bestRank = rank;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Fold member confirmations ({ rawLabel: bucket }) into a base StatusMapping,
 * producing a new explicit override mapping. The base is normally
 * resolveStatusMapping(config) so that previously-recognized labels are
 * preserved and only the newly-confirmed labels are added. De-dupes
 * case-insensitively within each bucket; ignores invalid bucket names and
 * blank labels. Returns a fresh object (never mutates the input).
 */
export function mergeConfirmationsIntoMapping(
  base: StatusMapping,
  confirmations: Record<string, string>,
): StatusMapping {
  const out: StatusMapping = {
    sold: [...base.sold],
    offMarket: [...base.offMarket],
    active: [...base.active],
    pending: [...base.pending],
  };
  const seen: Record<MappableBucket, Set<string>> = {
    sold: new Set(out.sold.map(normalizeLabel)),
    offMarket: new Set(out.offMarket.map(normalizeLabel)),
    active: new Set(out.active.map(normalizeLabel)),
    pending: new Set(out.pending.map(normalizeLabel)),
  };
  for (const [rawLabel, bucket] of Object.entries(confirmations)) {
    if (!(MAPPED_BUCKETS as readonly string[]).includes(bucket)) continue;
    const b = bucket as MappableBucket;
    const label = rawLabel.trim();
    if (!label) continue;
    const norm = normalizeLabel(label);
    if (seen[b].has(norm)) continue;
    out[b].push(label);
    seen[b].add(norm);
  }
  return out;
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
 * Failure rate = offMarket / (sold + offMarket). The share of RESOLVED listings
 * (closed + came off the market unsold) that failed to sell. Bounded 0..1 — it
 * can never exceed 100% because the failed count is part of its own denominator.
 * `offMarket` is whichever failed subset the caller passes (all off-market, or a
 * narrower expired/withdrawn subset for the variants). Returns null when the
 * sample is insufficient or nothing resolved. Defensive clamp+log guards against
 * a bad/negative input ever pushing the share above 1 (a bug signal, never shown).
 */
export function failureRate(sold: number, offMarket: number): number | null {
  const resolved = sold + offMarket;
  if (resolved <= 0) return null;
  if (!hasSufficientFailureSample(sold, offMarket)) return null;
  const share = offMarket / resolved;
  if (share > 1) {
    console.error(
      `[failureRate] bounded share ${share} > 1 (sold=${sold}, offMarket=${offMarket}); clamping to 1`,
    );
    return 1;
  }
  return share;
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
