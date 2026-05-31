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

import { parse } from "csv-parse/sync";
import prisma from "@/lib/prisma";
import {
  type ColumnMapping,
  type MarketConfigShape,
  type PriceTier,
} from "@/lib/market-config";

export type CsvStatus =
  | "Active"
  | "Pending"
  | "Sold"
  | "Expired"
  | "Terminated"
  | "Withdrawn";

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
  expiredCount: number;
  terminatedCount: number;
  withdrawnCount: number;

  moiStrict: number | null; // Active ÷ Sold-per-month
  moiInclusive: number | null; // (Active + Pending) ÷ Sold-per-month
  medianPrice: number | null;
  medianSqft: number | null;
  psf: number | null;
  domMedian: number | null;
  domAverage: number | null;
  spLpRatio: number | null;
  failureRate: number | null;

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
  status: CsvStatus | null;
  salePrice: number | null;
  listPrice: number | null;
  daysOnMarket: number | null;
  sqft: number | null;
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

function normalizeStatus(raw: string | null | undefined): CsvStatus | null {
  if (!raw) return null;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return null;
  if (s === "active" || s.startsWith("a")) return "Active";
  if (s === "pending" || s === "pending firm" || s.startsWith("pend"))
    return "Pending";
  if (s === "sold" || s === "closed" || s.startsWith("sold")) return "Sold";
  if (s === "expired" || s.startsWith("exp")) return "Expired";
  if (s === "terminated" || s.startsWith("term")) return "Terminated";
  if (s === "withdrawn" || s.startsWith("with")) return "Withdrawn";
  return null;
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
  const records = parse(text, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
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
  // Counts by status:
  active: number;
  pending: number;
  sold: number;
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
    case "Active":
      acc.active += 1;
      return;
    case "Pending":
      acc.pending += 1;
      return;
    case "Expired":
      acc.expired += 1;
      return;
    case "Terminated":
      acc.terminated += 1;
      return;
    case "Withdrawn":
      acc.withdrawn += 1;
      return;
    case "Sold":
      acc.sold += 1;
      if (row.salePrice != null) acc.soldPrices.push(row.salePrice);
      if (row.sqft != null && row.sqft > 0) acc.soldSqfts.push(row.sqft);
      if (row.salePrice != null && row.sqft != null && row.sqft > 0) {
        acc.soldPsfs.push(row.salePrice / row.sqft);
      }
      if (row.daysOnMarket != null && row.daysOnMarket >= 0) {
        acc.soldDoms.push(row.daysOnMarket);
      }
      if (row.salePrice != null && row.listPrice != null && row.listPrice > 0) {
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
> {
  const medianPrice = median(acc.soldPrices);
  const medianSqft = median(acc.soldSqfts);
  const psf = median(acc.soldPsfs);
  const domMedian = median(acc.soldDoms);
  const domAverage = average(acc.soldDoms);
  const spLpRatio = average(acc.soldSpLpRatios); // mean SP/LP ratio
  const failureDen =
    acc.sold + acc.expired + acc.terminated + acc.withdrawn;
  const failureRate =
    failureDen > 0
      ? ((acc.expired + acc.terminated + acc.withdrawn) / failureDen) * 100
      : null;

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
    expiredCount: acc.expired,
    terminatedCount: acc.terminated,
    withdrawnCount: acc.withdrawn,
    moiStrict,
    moiInclusive,
    medianPrice,
    medianSqft,
    psf,
    domMedian,
    domAverage,
    spLpRatio,
    failureRate,
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

  let unknownStatusCount = 0;
  let emptyZoneCount = 0;
  let totalSold = 0;
  let dateMin: Date | null = null;
  let dateMax: Date | null = null;

  // Build normalized rows once.
  const normalized: { row: NormalizedRow; isDuplexMerge: boolean }[] = [];
  for (const raw of rows) {
    const statusStr = readMappedCell(raw, headerLookup, mapping.status);
    const status = normalizeStatus(statusStr);
    // If no status column is mapped, treat every row as Sold (matches the
    // legacy CREB-style "sold-only" exports). This keeps the aggregator
    // useful for members who haven't mapped a Status column yet.
    const effectiveStatus =
      status ?? (mapping.status ? null : ("Sold" as CsvStatus));
    if (effectiveStatus == null) unknownStatusCount += 1;

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
    const date = parseDate(readMappedCell(raw, headerLookup, mapping.date));
    if (date) {
      if (!dateMin || date < dateMin) dateMin = date;
      if (!dateMax || date > dateMax) dateMax = date;
    }
    if (effectiveStatus === "Sold") totalSold += 1;

    const priceTier = classifyPriceTier(salePrice ?? listPrice, tiers);

    normalized.push({
      row: {
        date,
        neighbourhood,
        propertyType,
        zone,
        status: effectiveStatus,
        salePrice,
        listPrice,
        daysOnMarket: dom,
        sqft,
        priceTier,
      },
      isDuplexMerge,
    });
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

    groups.push({
      neighbourhood,
      propertyType,
      priceTier,
      ...metrics,
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
