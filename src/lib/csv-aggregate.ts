// Wave 1 Phase 2A — server-side CSV aggregation.
//
// Pure compute. NO Claude call here. NO persistence. Reads the saved CSV at
// `MarketDataUpload.csvStorageUrl`, applies the member's `MarketConfig.columnMapping`,
// and produces an in-memory `AggregatedTable` (~150-400 group rows) that the
// Fact Validator consumes.
//
// Rules sourced from `4_FACT_VALIDATOR_MODE.md` METRIC CALCULATION RULES:
//   • Pillar 9 status codes:  Active / Pending / Sold / Expired / Terminated / Withdrawn
//   • Property-type rollup:   Full Duplex → Semi-Detached  (note the merge per fact)
//   • Empty-zone handling:    include in city-wide + neighbourhood-level totals,
//                             exclude from zone-level (we don't slice by Zone in
//                             Phase 2A, so we just track the count for the SUMMARY)
//   • MoI:                    moi_strict = Active ÷ Sold-per-month
//                             moi_inclusive = (Active + Pending) ÷ Sold-per-month
//   • DOM:                    dom_average (CREB-aligned default) + dom_median
//                             from CSV column 3 (current-listing DOM), NOT CDOM
//   • Failure rate:           (Expired + Terminated + Withdrawn) /
//                             (Sold + Expired + Terminated + Withdrawn)
//   • Composition shift:      |Δmedian sqft| > 5% in SAME direction as Δmedian
//                             price → flag (group-level flag, consumed by validator)

import prisma from "@/lib/prisma";
import { parseCsvRecords } from "@/lib/csv-parse-options";
import {
  type ColumnMapping,
  type MarketConfigShape,
  type PriceTier,
} from "@/lib/market-config";
import {
  resolveStatusMapping,
  resolveOffMarketSubMapping,
  classifyOffMarketSub,
  bucketStatus,
  failureRate as failureRateRatio,
  saleShare as saleShareRatio,
  absorptionRate as absorptionRateRatio,
  type StatusBucket,
  type StatusMapping,
  type OffMarketSubBucket,
  type OffMarketSubMapping,
} from "@/lib/market-status-buckets";

export interface AggregatedGroup {
  /** "All Neighbourhoods" for city-wide rollups. */
  neighbourhood: string;
  /** Normalized property type (Full Duplex collapsed into Semi-Detached). */
  propertyType: string | null;
  /** Price tier name from MarketConfig.priceTiers, or null for city-wide. */
  priceTier: string | null;

  // Headline metrics for this group
  sampleSize: number; // count of Sold rows
  activeCount: number;
  pendingCount: number;
  soldCount: number;
  /** expired + terminated + withdrawn (canonical), collapsed to one bucket. */
  offMarketCount: number;

  moiStrict: number | null; // Active ÷ Sold-per-month
  moiInclusive: number | null; // (Active + Pending) ÷ Sold-per-month
  /**
   * (Active + Pending) ÷ trailing-3-month average Sold-per-month. Cross-upload:
   * needs the two prior months' sold counts, so it is filled in the cross-period
   * pass (null from metricsFromAccumulator, populated below). Falls back to the
   * single-month inclusive value when no prior months are available.
   */
  moiInclusiveRolling3: number | null;
  medianPrice: number | null;
  medianSqft: number | null;
  psf: number | null;
  domMedian: number | null;
  domAverage: number | null;
  spLpRatio: number | null;
  failureRate: number | null;
  /** offMarket(expired only) ÷ Sold, stored ×100. null below floor. */
  failureRateExpiredOnly: number | null;
  /** offMarket(expired + withdrawn) ÷ Sold, stored ×100. null below floor. */
  failureRateExpiredPlusWithdrawn: number | null;
  /** Sold ÷ (Sold + offMarket), stored ×100 (percentage). null below floor. */
  saleShare: number | null;
  /** Sold ÷ Active, stored ×100 (percentage). null below floor / no inventory. */
  absorptionRate: number | null;
  /** Mean closing price (companion to medianPrice for the average sale-price variant). */
  avgSalePrice: number | null;
  /**
   * Published HPI/benchmark price when a benchmark column is available. No
   * canonical benchmark column exists in ColumnMapping yet, so this is null
   * today; the benchmark sale-price variant falls back to median at citation
   * time. Kept on the type so a future benchmark column lights this up without
   * a schema change.
   */
  benchmarkPrice: number | null;
  /** expired / terminated / withdrawn split of offMarketCount (for failure variants). */
  expiredCount: number;
  terminatedCount: number;
  withdrawnCount: number;

  // Cross-period
  yoy: {
    medianPriceDelta: number | null; // % change
    medianSqftDelta: number | null;
    psfDelta: number | null;
    moiStrictDelta: number | null;
  };
  rolling90d: {
    medianPrice: number | null;
    psf: number | null;
    moiStrict: number | null;
  };

  /** True if median sqft moved >5% in the SAME direction as median price YoY. */
  compositionShiftFlag: boolean;

  /** Roll-up note: "includes Full Duplex records merged into Semi-Detached". */
  rollupNotes: string[];

  /**
   * Set on SYNTHETIC long-tail rollup groups produced by the fact-validator's
   * coverage cap (applyCoverageCap). These aggregate many low-volume
   * neighbourhoods into a (propertyType × priceTier) bucket so the long tail is
   * still represented without one validator call per micro-neighbourhood. When
   * present the validator must classify the resulting facts as
   * "supporting-texture-only" (never headline) — their medians are
   * sample-weighted approximations, not true pooled medians.
   */
  usageHint?: "supporting-texture-only";
}

export interface AggregatedTable {
  groups: AggregatedGroup[];
  meta: {
    monthYear: string;
    marketName: string;
    mlsSource: string | null;
    csvFileName: string;
    totalRowsParsed: number;
    totalSold: number;
    emptyZoneCount: number;
    /** Number of CSV rows we couldn't classify by status — surfaced for transparency. */
    unknownStatusCount: number;
    /** Prior monthYear (YYYY-MM) used for YoY comparison, if found. */
    yoyComparisonMonthYear: string | null;
    /** Prior monthYears (YYYY-MM) used for 90-day rolling, if found. */
    rolling90dMonthYears: string[];
    /** Mins/maxes for analyst sanity. */
    dateRangeMin: string | null;
    dateRangeMax: string | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

interface NormalizedRow {
  date: Date | null;
  neighbourhood: string;
  propertyType: string | null;
  zone: string | null; // empty-zone tracking
  status: StatusBucket;
  /** Sub-classification of an off-market row (null unless status === "offMarket"). */
  offMarketSub: OffMarketSubBucket | null;
  salePrice: number | null;
  listPrice: number | null;
  daysOnMarket: number | null;
  sqft: number | null;
  spLpRatio: number | null;
  priceTier: string | null;
}

function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = raw.toString().trim();
  if (!s) return null;
  // Strip currency symbols, commas, spaces. Keep leading minus + decimal.
  const cleaned = s.replace(/[$,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a precomputed sale-to-list (SP/LP) ratio cell. MLS exports express
 * this either as a fraction (e.g. 0.98, Pillar 9 `RATIO_ClosePrice_By_ListPrice`)
 * or as a percent (e.g. 98 / "98%", BRIGHT `SoldVsList%`). Normalize everything
 * to a fraction so it lines up with the salePrice/listPrice-derived ratio.
 * Anything above 3 is treated as a percent (no real SP/LP fraction exceeds ~2);
 * non-positive values are dropped.
 */
function parseRatio(raw: string | undefined | null): number | null {
  const n = parseNumber(raw);
  if (n == null || n <= 0) return null;
  return n > 3 ? n / 100 : n;
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.toString().trim();
  if (!s) return null;
  // Try ISO first, then common North-American formats.
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mm, dd, yy] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    const d = new Date(Number(year), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Normalize a Pillar 9 property-type string. Rolls "Full Duplex" into
 * "Semi-Detached" per the validator prompt. Returns the canonical bucket
 * name AND whether a Full-Duplex merge happened (so the aggregator can note
 * it in `rollupNotes`).
 */
export function normalizePropertyType(raw: string | null | undefined): {
  type: string | null;
  isDuplexMerge: boolean;
} {
  if (!raw) return { type: null, isDuplexMerge: false };
  const s = raw.toString().trim();
  const lower = s.toLowerCase();
  if (lower.includes("full duplex")) return { type: "Semi-Detached", isDuplexMerge: true };
  if (lower.includes("semi") && lower.includes("detached"))
    return { type: "Semi-Detached", isDuplexMerge: false };
  if (lower.includes("half duplex"))
    return { type: "Semi-Detached", isDuplexMerge: false };
  if (lower.includes("row") || lower.includes("townhouse"))
    return { type: "Row/Townhouse", isDuplexMerge: false };
  if (lower.includes("apartment") || lower.includes("condo"))
    return { type: "Apartment", isDuplexMerge: false };
  if (lower.includes("detached")) return { type: "Detached", isDuplexMerge: false };
  return { type: s, isDuplexMerge: false };
}

function classifyPriceTier(
  price: number | null,
  tiers: PriceTier[],
): string | null {
  if (price == null || tiers.length === 0) return null;
  // tiers are ordered; max=null means "and up"
  for (const t of tiers) {
    if (t.maxPrice == null) return t.name;
    if (price <= t.maxPrice) return t.name;
  }
  // Fallback to the last tier when price > everything explicit
  return tiers[tiers.length - 1].name;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pctDelta(curr: number | null, prior: number | null): number | null {
  if (curr == null || prior == null || prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[\s_]+/g, "");
}

function readMappedCell(
  row: Record<string, string>,
  headerLookup: Map<string, string>,
  mappedHeader: string | undefined,
): string | null {
  if (!mappedHeader) return null;
  // Try exact match first, then case/whitespace-insensitive.
  if (mappedHeader in row) return row[mappedHeader] ?? null;
  const norm = normalizeHeader(mappedHeader);
  const actual = headerLookup.get(norm);
  return actual ? (row[actual] ?? null) : null;
}

function buildHeaderLookup(headers: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of headers) m.set(normalizeHeader(h), h);
  return m;
}

/**
 * Streaming-style CSV parse. We use csv-parse/sync because the existing
 * `parseCsvPreview` already does and the typical Pillar 9 monthly export is
 * comfortably memory-resident (~10K rows ≈ <5 MB). If volumes outgrow this,
 * swap to `csv-parse` async iterator without changing the rest of the file.
 */
function parseAllRows(
  buf: Buffer,
): { headers: string[]; rows: Record<string, string>[] } {
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const records = parseCsvRecords<Record<string, string>>(text, {
    columns: true,
  });
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

// ─────────────────────────────────────────────────────────────────────────────

interface RowAccumulator {
  // For Sold rows only, the metrics we care about:
  soldPrices: number[];
  soldSqfts: number[];
  soldPsfs: number[];
  soldDoms: number[];
  soldSpLpRatios: number[];
  // Counts by four-bucket status (offMarket = expired+terminated+withdrawn):
  active: number;
  pending: number;
  sold: number;
  offMarket: number;
  // Off-market sub-splits (subset of offMarket; may not sum to it when a row's
  // raw status can't be sub-classified — see classifyOffMarketSub).
  expired: number;
  terminated: number;
  withdrawn: number;
  rollupNotes: Set<string>;
}

function emptyAccumulator(): RowAccumulator {
  return {
    soldPrices: [],
    soldSqfts: [],
    soldPsfs: [],
    soldDoms: [],
    soldSpLpRatios: [],
    active: 0,
    pending: 0,
    sold: 0,
    offMarket: 0,
    expired: 0,
    terminated: 0,
    withdrawn: 0,
    rollupNotes: new Set(),
  };
}

function tallyRow(acc: RowAccumulator, row: NormalizedRow, isDuplexMerge: boolean) {
  if (isDuplexMerge) {
    acc.rollupNotes.add(
      "Includes Full Duplex records merged into Semi-Detached per validator prompt.",
    );
  }
  switch (row.status) {
    case "active":
      acc.active += 1;
      return;
    case "pending":
      acc.pending += 1;
      return;
    case "offMarket":
      acc.offMarket += 1;
      switch (row.offMarketSub) {
        case "expired":
          acc.expired += 1;
          break;
        case "terminated":
          acc.terminated += 1;
          break;
        case "withdrawn":
          acc.withdrawn += 1;
          break;
        default:
          break; // unclassifiable off-market row: counted in offMarket total only
      }
      return;
    case "unknown":
      // Unknown rows are counted at the table level (meta.unknownStatusCount)
      // and surfaced via a structured warning; they contribute to no metric.
      return;
    case "sold":
      acc.sold += 1;
      if (row.salePrice != null) acc.soldPrices.push(row.salePrice);
      if (row.sqft != null && row.sqft > 0) acc.soldSqfts.push(row.sqft);
      if (row.salePrice != null && row.sqft != null && row.sqft > 0) {
        acc.soldPsfs.push(row.salePrice / row.sqft);
      }
      if (row.daysOnMarket != null && row.daysOnMarket >= 0) {
        acc.soldDoms.push(row.daysOnMarket);
      }
      // Prefer a precomputed sale-to-list ratio column when the member mapped
      // one (many MLS exports ship it directly); otherwise derive it from the
      // per-row sale/list prices.
      if (row.spLpRatio != null && row.spLpRatio > 0) {
        acc.soldSpLpRatios.push(row.spLpRatio);
      } else if (
        row.salePrice != null &&
        row.listPrice != null &&
        row.listPrice > 0
      ) {
        acc.soldSpLpRatios.push(row.salePrice / row.listPrice);
      }
      return;
  }
}

function metricsFromAccumulator(
  acc: RowAccumulator,
): Omit<
  AggregatedGroup,
  | "neighbourhood"
  | "propertyType"
  | "priceTier"
  | "yoy"
  | "rolling90d"
  | "compositionShiftFlag"
  | "rollupNotes"
  | "moiInclusiveRolling3"
> {
  const medianPrice = median(acc.soldPrices);
  const medianSqft = median(acc.soldSqfts);
  const psf = median(acc.soldPsfs);
  const domMedian = median(acc.soldDoms);
  const domAverage = average(acc.soldDoms);
  const spLpRatio = average(acc.soldSpLpRatios); // mean SP/LP ratio
  // failure_rate (v2) = offMarket / sold — a broker-honest ratio that can exceed
  // 1.0. The helper returns a 0..n ratio (null below the sample floor); we store
  // it ×100 to preserve the existing AggregatedGroup/AggregatedMetric percentage
  // storage convention (downstream formatters expect a percentage-style number).
  const failureRatio = failureRateRatio(acc.sold, acc.offMarket);
  const failureRate = failureRatio == null ? null : failureRatio * 100;
  // failure_rate VARIANTS — same offMarket/sold ratio over narrower off-market
  // denominators (expired-only, expired+withdrawn). Each clears the off-market
  // sample floor against its OWN (smaller) denominator. Stored ×100 like the
  // all-off-market value so the shared FAILURE_RATE formatter renders "%".
  const failExpiredOnlyR = failureRateRatio(acc.sold, acc.expired);
  const failureRateExpiredOnly =
    failExpiredOnlyR == null ? null : failExpiredOnlyR * 100;
  const failExpiredPlusWithdrawnR = failureRateRatio(
    acc.sold,
    acc.expired + acc.withdrawn,
  );
  const failureRateExpiredPlusWithdrawn =
    failExpiredPlusWithdrawnR == null ? null : failExpiredPlusWithdrawnR * 100;
  // sale_share = Sold / (Sold + offMarket) — bounded 0..1 companion to
  // failure_rate. Stored ×100 (percentage) to match the failure_rate storage
  // convention so the shared FAILURE_RATE formatter renders it as "%".
  const saleShareR = saleShareRatio(acc.sold, acc.offMarket);
  const saleShare = saleShareR == null ? null : saleShareR * 100;
  // average sale price — mean of closing prices (companion to medianPrice for
  // the average sale-price methodology variant). benchmarkPrice has no source
  // column yet, so it is null today (citation falls back to median).
  const avgSalePrice = average(acc.soldPrices);
  // absorption_rate = Sold / Active — how much standing inventory cleared.
  // Stored ×100 (percentage) so the ABSORPTION formatter renders it as "%".
  const absorptionR = absorptionRateRatio(acc.sold, acc.active);
  const absorptionRate = absorptionR == null ? null : absorptionR * 100;

  // MoI uses sold-per-month rate. The upload window is a single calendar
  // month, so sold-per-month = sold count. (Validator can re-frame for
  // trailing-N-month windows downstream; per-upload MOI is the right input
  // for a monthly facts library.)
  const soldPerMonth = acc.sold;
  const moiStrict = soldPerMonth > 0 ? acc.active / soldPerMonth : null;
  const moiInclusive =
    soldPerMonth > 0 ? (acc.active + acc.pending) / soldPerMonth : null;

  return {
    sampleSize: acc.sold,
    activeCount: acc.active,
    pendingCount: acc.pending,
    soldCount: acc.sold,
    offMarketCount: acc.offMarket,
    moiStrict,
    moiInclusive,
    medianPrice,
    medianSqft,
    psf,
    domMedian,
    domAverage,
    spLpRatio,
    failureRate,
    failureRateExpiredOnly,
    failureRateExpiredPlusWithdrawn,
    saleShare,
    absorptionRate,
    avgSalePrice,
    benchmarkPrice: null,
    expiredCount: acc.expired,
    terminatedCount: acc.terminated,
    withdrawnCount: acc.withdrawn,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-period: YoY + 90-day rolling
// ─────────────────────────────────────────────────────────────────────────────

function shiftMonthYear(monthYear: string, deltaMonths: number): string | null {
  const m = monthYear.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const total = year * 12 + (month - 1) + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

function groupKey(
  neighbourhood: string,
  propertyType: string | null,
  priceTier: string | null,
): string {
  return `${neighbourhood}||${propertyType ?? ""}||${priceTier ?? ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregateOptions {
  uploadId: string;
  userId: string;
  monthYear: string;
  csvFileName: string;
  csvBuffer: Buffer;
  config: MarketConfigShape;
}

/**
 * Aggregate one upload's CSV into ~150-400 group rows. Looks up the prior
 * 12-month upload + the prior 2 uploads (this user) to compute YoY deltas
 * and 90-day rolling values inline. Pure compute — no Claude call, no DB writes.
 */
export async function aggregateUpload(
  opts: AggregateOptions,
): Promise<AggregatedTable> {
  const { uploadId, userId, monthYear, csvFileName, csvBuffer, config } = opts;
  const mapping: ColumnMapping = config.columnMapping ?? {};
  const tiers = config.priceTiers ?? [];

  const { headers, rows } = parseAllRows(csvBuffer);
  const headerLookup = buildHeaderLookup(headers);

  // Resolve the market's status mapping ONCE (override -> statusCodes ->
  // MARKET_SOURCE_DEFAULTS). This is the single interpretation point for
  // "which raw MLS label is sold / off-market / active / pending".
  const statusMapping: StatusMapping = resolveStatusMapping(config);
  const offMarketSubMapping: OffMarketSubMapping =
    resolveOffMarketSubMapping(config);

  let unknownStatusCount = 0;
  let emptyZoneCount = 0;
  let totalSold = 0;
  let dateMin: Date | null = null;
  let dateMax: Date | null = null;
  // Distinct raw labels that bucketed to "unknown" (for the admin warning).
  const unknownStatusLabels = new Map<string, number>();

  // Build normalized rows once.
  const normalized: { row: NormalizedRow; isDuplexMerge: boolean }[] = [];
  for (const raw of rows) {
    const statusStr = readMappedCell(raw, headerLookup, mapping.status);
    // If no status column is mapped, treat every row as sold (matches the
    // legacy CREB-style "sold-only" exports). This keeps the aggregator
    // useful for members who haven't mapped a Status column yet. When a status
    // column IS mapped, every label flows through the resolved mapping.
    const effectiveStatus: StatusBucket = mapping.status
      ? bucketStatus(statusStr, statusMapping)
      : "sold";
    const offMarketSub =
      effectiveStatus === "offMarket"
        ? classifyOffMarketSub(statusStr, offMarketSubMapping)
        : null;
    if (effectiveStatus === "unknown") {
      unknownStatusCount += 1;
      const label = (statusStr ?? "").toString().trim() || "(blank)";
      unknownStatusLabels.set(label, (unknownStatusLabels.get(label) ?? 0) + 1);
    }

    const neighbourhoodRaw =
      readMappedCell(raw, headerLookup, mapping.neighbourhood) ?? "";
    const neighbourhood = neighbourhoodRaw.toString().trim() || "Unknown";

    const ptRaw = readMappedCell(raw, headerLookup, mapping.propertyType);
    const { type: propertyType, isDuplexMerge } = normalizePropertyType(ptRaw);

    const zoneRaw = readMappedCell(raw, headerLookup, undefined); // Zone not in canonical map (Phase 2A); leave null
    const zone = zoneRaw && zoneRaw.toString().trim().length > 0 ? zoneRaw.toString().trim() : null;
    if (zone == null) emptyZoneCount += 1;

    const salePrice = parseNumber(
      readMappedCell(raw, headerLookup, mapping.salePrice),
    );
    const listPrice = parseNumber(
      readMappedCell(raw, headerLookup, mapping.listPrice),
    );
    const dom = parseNumber(
      readMappedCell(raw, headerLookup, mapping.daysOnMarket),
    );
    const sqft = parseNumber(readMappedCell(raw, headerLookup, mapping.sqft));
    const spLpRatio = parseRatio(
      readMappedCell(raw, headerLookup, mapping.saleToListRatio),
    );
    const date = parseDate(readMappedCell(raw, headerLookup, mapping.date));
    if (date) {
      if (!dateMin || date < dateMin) dateMin = date;
      if (!dateMax || date > dateMax) dateMax = date;
    }
    if (effectiveStatus === "sold") totalSold += 1;

    const priceTier = classifyPriceTier(salePrice ?? listPrice, tiers);

    normalized.push({
      row: {
        date,
        neighbourhood,
        propertyType,
        zone,
        status: effectiveStatus,
        offMarketSub,
        salePrice,
        listPrice,
        daysOnMarket: dom,
        sqft,
        spLpRatio,
        priceTier,
      },
      isDuplexMerge,
    });
  }

  // Surface unmapped statuses LOUDLY. A status column was mapped but some labels
  // bucketed to "unknown" — those rows silently drop out of every metric, so an
  // admin needs to extend statusCodes (or the statusMapping override). Structured
  // (not silent) so it's greppable in workflow/deployment logs.
  if (mapping.status && unknownStatusCount > 0) {
    const topLabels = [...unknownStatusLabels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
    console.warn(
      "[market-status][UNKNOWN_STATUS] CSV rows fell through status bucketing",
      JSON.stringify({
        uploadId,
        userId,
        marketName: config.marketName,
        mlsSource: config.mlsSource || null,
        monthYear,
        unknownStatusCount,
        totalRowsParsed: normalized.length,
        topUnknownLabels: topLabels,
        hint: "Add these labels to MarketConfig.statusCodes (preferred) or the statusMapping override so they bucket into sold/offMarket/active/pending.",
      }),
    );
  }

  // Tally per group. We emit four bucket dimensions in parallel so the
  // validator gets both rolled-up and fully-segmented views:
  //   1. (neighbourhood, propertyType, priceTier)  — fully-segmented
  //   2. (neighbourhood, propertyType, null)       — neighbourhood × type
  //   3. (neighbourhood, null, null)               — neighbourhood overall
  //   4. ("All Neighbourhoods", propertyType, null) — citywide × type
  //   5. ("All Neighbourhoods", null, null)        — citywide overall
  const buckets = new Map<string, RowAccumulator>();
  const ensure = (k: string): RowAccumulator => {
    let acc = buckets.get(k);
    if (!acc) {
      acc = emptyAccumulator();
      buckets.set(k, acc);
    }
    return acc;
  };

  for (const { row, isDuplexMerge } of normalized) {
    const keys: Array<[string, string | null, string | null]> = [
      [row.neighbourhood, row.propertyType, row.priceTier],
      [row.neighbourhood, row.propertyType, null],
      [row.neighbourhood, null, null],
      ["All Neighbourhoods", row.propertyType, null],
      ["All Neighbourhoods", null, null],
    ];
    for (const [n, pt, tier] of keys) {
      tallyRow(ensure(groupKey(n, pt, tier)), row, isDuplexMerge);
    }
  }

  // Pull prior uploads we'll need for YoY + 90-day rolling.
  const yoyMonthYear = shiftMonthYear(monthYear, -12);
  const priorMonthYearList: string[] = [
    shiftMonthYear(monthYear, -1),
    shiftMonthYear(monthYear, -2),
  ].filter((m): m is string => !!m);

  const priorUploads = await prisma.marketDataUpload.findMany({
    where: {
      userId,
      id: { not: uploadId },
      status: "validated",
      monthYear: {
        in: [yoyMonthYear, ...priorMonthYearList].filter(
          (m): m is string => !!m,
        ),
      },
    },
    select: {
      id: true,
      monthYear: true,
      facts: {
        where: {
          metricName: { in: ["median_sale_price", "median_sqft", "psf", "MOI"] },
        },
        select: {
          neighbourhood: true,
          propertyType: true,
          priceTier: true,
          metricName: true,
          metricValue: true,
          sampleSize: true,
        },
      },
    },
  });

  const yoyUpload = yoyMonthYear
    ? priorUploads.find((u) => u.monthYear === yoyMonthYear)
    : undefined;
  const rolling90dUploads = priorUploads.filter((u) =>
    priorMonthYearList.includes(u.monthYear),
  );

  function lookupFact(
    upload: (typeof priorUploads)[number] | undefined,
    neighbourhood: string,
    propertyType: string | null,
    priceTier: string | null,
    metricName: string,
  ): { value: number; sampleSize: number | null } | null {
    if (!upload) return null;
    const match = upload.facts.find(
      (f) =>
        f.neighbourhood === neighbourhood &&
        (f.propertyType ?? null) === propertyType &&
        (f.priceTier ?? null) === priceTier &&
        f.metricName === metricName,
    );
    if (!match || match.metricValue == null) return null;
    return { value: match.metricValue, sampleSize: match.sampleSize };
  }

  const groups: AggregatedGroup[] = [];
  for (const [k, acc] of buckets.entries()) {
    const [neighbourhood, propertyTypeRaw, priceTierRaw] = k.split("||");
    const propertyType = propertyTypeRaw || null;
    const priceTier = priceTierRaw || null;
    const metrics = metricsFromAccumulator(acc);

    const yoyMedianPrice = lookupFact(
      yoyUpload,
      neighbourhood,
      propertyType,
      priceTier,
      "median_sale_price",
    );
    const yoyMedianSqft = lookupFact(
      yoyUpload,
      neighbourhood,
      propertyType,
      priceTier,
      "median_sqft",
    );
    const yoyPsf = lookupFact(
      yoyUpload,
      neighbourhood,
      propertyType,
      priceTier,
      "psf",
    );
    const yoyMoi = lookupFact(
      yoyUpload,
      neighbourhood,
      propertyType,
      priceTier,
      "MOI",
    );

    const medianPriceDelta = pctDelta(
      metrics.medianPrice,
      yoyMedianPrice?.value ?? null,
    );
    const medianSqftDelta = pctDelta(
      metrics.medianSqft,
      yoyMedianSqft?.value ?? null,
    );
    const psfDelta = pctDelta(metrics.psf, yoyPsf?.value ?? null);
    const moiStrictDelta = pctDelta(
      metrics.moiStrict,
      yoyMoi?.value ?? null,
    );

    // Composition shift: same-direction sqft + price movement >5% magnitude.
    let compositionShiftFlag = false;
    if (medianPriceDelta != null && medianSqftDelta != null) {
      const sameDir =
        (medianPriceDelta > 0 && medianSqftDelta > 0) ||
        (medianPriceDelta < 0 && medianSqftDelta < 0);
      if (sameDir && Math.abs(medianSqftDelta) > 5) compositionShiftFlag = true;
    }

    // 90-day rolling: simple weighted mean across this upload + the two priors,
    // weighted by sample size where available, else equal weights.
    function weightedRolling(
      thisVal: number | null,
      thisN: number,
      metricName: string,
    ): number | null {
      const samples: Array<{ v: number; n: number }> = [];
      if (thisVal != null) samples.push({ v: thisVal, n: Math.max(thisN, 1) });
      for (const u of rolling90dUploads) {
        const m = lookupFact(u, neighbourhood, propertyType, priceTier, metricName);
        if (m) samples.push({ v: m.value, n: Math.max(m.sampleSize ?? 1, 1) });
      }
      if (samples.length === 0) return null;
      const totalW = samples.reduce((a, s) => a + s.n, 0);
      return samples.reduce((a, s) => a + s.v * s.n, 0) / totalW;
    }

    const rollingMedianPrice = weightedRolling(
      metrics.medianPrice,
      metrics.sampleSize,
      "median_sale_price",
    );
    const rollingPsf = weightedRolling(metrics.psf, metrics.sampleSize, "psf");
    const rollingMoi = weightedRolling(
      metrics.moiStrict,
      metrics.sampleSize,
      "MOI",
    );

    // moi_active_plus_pending_rolling3 = (Active + Pending) ÷ trailing-3-month
    // average Sold-per-month. The prior months' sold counts are read from each
    // prior upload's MOI fact sampleSize (== that month's sold sample). Months
    // without a MOI fact (sold below floor) are simply absent, so the average is
    // taken over the months we actually have. With no priors this collapses to
    // the single-month inclusive value (identical to moiInclusive).
    const inclusiveNumerator = metrics.activeCount + metrics.pendingCount;
    const monthlySolds: number[] = [metrics.soldCount];
    for (const u of rolling90dUploads) {
      const m = lookupFact(u, neighbourhood, propertyType, priceTier, "MOI");
      const n = m?.sampleSize ?? null;
      if (n != null && n > 0) monthlySolds.push(n);
    }
    const avgMonthlySold =
      monthlySolds.length > 0
        ? monthlySolds.reduce((a, b) => a + b, 0) / monthlySolds.length
        : 0;
    const moiInclusiveRolling3 =
      avgMonthlySold > 0 ? inclusiveNumerator / avgMonthlySold : null;

    groups.push({
      neighbourhood,
      propertyType,
      priceTier,
      ...metrics,
      moiInclusiveRolling3,
      yoy: { medianPriceDelta, medianSqftDelta, psfDelta, moiStrictDelta },
      rolling90d: {
        medianPrice: rollingMedianPrice,
        psf: rollingPsf,
        moiStrict: rollingMoi,
      },
      compositionShiftFlag,
      rollupNotes: [...acc.rollupNotes],
    });
  }

  return {
    groups,
    meta: {
      monthYear,
      marketName: config.marketName,
      mlsSource: config.mlsSource || null,
      csvFileName,
      totalRowsParsed: normalized.length,
      totalSold,
      emptyZoneCount,
      unknownStatusCount,
      yoyComparisonMonthYear: yoyUpload?.monthYear ?? null,
      rolling90dMonthYears: rolling90dUploads.map((u) => u.monthYear),
      dateRangeMin: dateMin ? (dateMin as Date).toISOString().slice(0, 10) : null,
      dateRangeMax: dateMax ? (dateMax as Date).toISOString().slice(0, 10) : null,
    },
  };
}

/**
 * Convenience wrapper that loads the CSV from disk + MarketConfig from DB.
 * Used by `runValidation` in `fact-validator.ts`.
 */
export async function aggregateUploadFromDb(
  uploadId: string,
): Promise<{ table: AggregatedTable; userId: string; configSnapshot: MarketConfigShape }> {
  const upload = await prisma.marketDataUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      userId: true,
      monthYear: true,
      csvFileName: true,
      csvStorageUrl: true,
    },
  });
  if (!upload) throw new Error(`Upload ${uploadId} not found`);
  if (!upload.csvStorageUrl) throw new Error(`Upload ${uploadId} has no CSV storage URL`);

  const { getMarketConfigForUser } = await import("@/lib/market-config-server");
  const config = await getMarketConfigForUser(upload.userId);
  if (!config)
    throw new Error(`MarketConfig missing for user ${upload.userId} (upload ${uploadId})`);

  const { readUploadFile } = await import("@/lib/market-csv");
  const csvBuffer = await readUploadFile(upload.csvStorageUrl);
  const table = await aggregateUpload({
    uploadId: upload.id,
    userId: upload.userId,
    monthYear: upload.monthYear,
    csvFileName: upload.csvFileName,
    csvBuffer,
    config,
  });
  return { table, userId: upload.userId, configSnapshot: config };
}
