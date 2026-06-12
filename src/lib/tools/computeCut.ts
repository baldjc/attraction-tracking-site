/**
 * `compute_cut` — deterministic, on-demand market cuts from a member's RAW CSV.
 *
 * The validated facts ledger (MarketFact) is segmented by the validator's fixed
 * dimensions (neighbourhood × normalized propertyType × priceTier). Members
 * routinely ask for a slice the ledger never pre-computed — e.g. "single-family
 * homes by the decade they were built". This tool re-parses the member's stored
 * RAW upload and computes those cuts by exact arithmetic — NO Claude call, NO
 * estimation, NO fabrication. It either returns real aggregates with provenance,
 * or it refuses honestly.
 *
 * Two property dimensions exist and MUST NEVER be conflated:
 *   - `propertyClass` = the RAW "Property Type" column (e.g. Single Family /
 *     Condo). Read verbatim from the CSV header, independent of the member's
 *     column mapping, with NO normalization.
 *   - `style` = the column the member MAPPED to `propertyType` (Chris maps it to
 *     "Style": architectural/storey form). Run through `normalizePropertyType`,
 *     exactly mirroring the ledger.
 * A class the data doesn't contain (e.g. "townhouse" when the raw column only
 * holds Single Family / Condo) is refused with the available values listed — it
 * is NEVER proxied through the style column.
 *
 * Headline discipline mirrors the validator's three honesty bands by closed-sale
 * count: a group at/above the headline sold floor (HEADLINE_SOLD_FLOOR = 15) may
 * be cited as a headline number; a group between the per-member hard sample floor
 * and that floor stays USABLE but only WITH an explicit "based on N sales"
 * disclosure baked into the claim; a group below the hard floor is too thin to
 * headline (`supporting_texture_only` — texture/colour only, never fabricated);
 * zero-sold groups carry null metrics and can never be headlined.
 *
 * The math (which rows count, how each metric is derived) mirrors
 * `tallyRow` / `metricsFromAccumulator` in csv-aggregate.ts EXACTLY, so a
 * computed cut lines up with the rest of the platform's numbers.
 */
import { randomUUID } from "node:crypto";
import prismaDefault from "@/lib/prisma";
import {
  getExcludedNeighbourhoodKeys,
  isExcluded,
} from "@/lib/excluded-neighbourhoods";
import { readUploadFile as realReadUploadFile } from "@/lib/market-csv";
import { parseCsvRecords } from "@/lib/csv-parse-options";
import { normalizePropertyType, shiftMonthYear } from "@/lib/csv-aggregate";
import {
  resolveStatusMapping,
  bucketStatus,
  MIN_SOLD_SAMPLE,
  type StatusBucket,
} from "@/lib/market-status-buckets";
import {
  sampleFloorFor,
  sampleBandFor,
  HEADLINE_SOLD_FLOOR,
  type SampleBand,
} from "@/lib/member-metric-settings";
import { loadMemberMetricSettings as realLoadSettings } from "@/lib/member-metric-settings-server";
import { getMarketConfigForUser as realGetMarketConfig } from "@/lib/market-config-server";
import type { ColumnMapping, MarketConfigShape } from "@/lib/market-config";
import { MetricFamily } from "@/generated/prisma/enums";
import type { LedgerFact } from "@/lib/jarvis/types";
import { isSingleFamilyClass } from "@/lib/property-class";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type CutDimension =
  | "neighbourhood"
  | "city"
  | "style"
  | "propertyClass"
  | "yearBuiltDecade"
  | "priceBracket"
  | "bedrooms"
  | "bathrooms";

export type CutFilterField =
  | "neighbourhood"
  | "city"
  | "style"
  | "propertyClass"
  | "priceBracket";

export interface CutFilter {
  field: CutFilterField;
  value: string;
}

/** Mapped numeric columns that can be range-filtered (>=, <=, between). */
export type CutNumericField =
  | "sqft"
  | "bedrooms"
  | "bathrooms"
  | "salePrice"
  | "yearBuilt";

/**
 * A numeric range filter on one mapped numeric column. `min`/`max` are inclusive;
 * supplying only one expresses an open-ended `>=`/`<=`, both expresses a between.
 * Rows whose value is null (column blank for that row) never match a numeric
 * filter — they are excluded, never coerced to 0.
 */
export interface CutNumericFilter {
  field: CutNumericField;
  min?: number;
  max?: number;
}

export interface ComputeCutParams {
  dimension: CutDimension;
  filters?: CutFilter[];
  /** Numeric range filters; compose with `filters` and the groupBy dimension. */
  numericFilters?: CutNumericFilter[];
  /**
   * Optional YYYY-MM. When set, the cut runs against THAT validated upload
   * instead of the member's latest one — the mechanism behind prior-period and
   * year-over-year cuts. Omitted → latest validated upload (legacy behaviour).
   */
  monthYear?: string;
}

/**
 * One CSV row reduced to the fields any cut needs. Built by the DB wrapper; the
 * pure core only ever sees these (so it is trivially unit-testable).
 */
export interface CutRow {
  status: StatusBucket;
  neighbourhood: string | null;
  /** Mapped City/municipality cell (aliases city|municipality), or null. */
  city: string | null;
  /** Normalized mapped propertyType ("Style") — mirrors the ledger. */
  style: string | null;
  /** RAW "Property Type" cell, verbatim (no normalization). */
  propertyClass: string | null;
  /** RAW "Price Bracket" cell, verbatim. */
  priceBracket: string | null;
  yearBuilt: number | null;
  salePrice: number | null;
  listPrice: number | null;
  daysOnMarket: number | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  spLpRatio: number | null;
}

export type CutMetricKey =
  | "median_sale_price"
  | "median_dom"
  | "months_of_inventory"
  | "sale_to_list_ratio"
  | "psf";

export interface CutGroupMetric {
  key: CutMetricKey;
  family: MetricFamily;
  /** Human label, e.g. "Median sale price". */
  label: string;
  /** Natural numeric value (price in $, ratio as percent, MOI in months …). */
  value: number;
  /** Pre-formatted display string — the grounding round-trip token. */
  valueString: string;
}

export interface CutGroup {
  /** Dimension value for this group, e.g. "1990s" / "Single Family". */
  bucket: string;
  soldCount: number;
  activeCount: number;
  pendingCount: number;
  offMarketCount: number;
  totalCount: number;
  /** soldCount >= headlineSoldFloor (i.e. band === "headline"). */
  headlineSafe: boolean;
  /**
   * Honesty band by closed-sale count: "headline" (>= headlineSoldFloor),
   * "disclose" (hard sample floor .. headlineSoldFloor-1 — usable WITH a
   * "based on N sales" disclosure), or "thin" (< hard floor — texture only).
   */
  band: SampleBand;
  metrics: CutGroupMetric[];
}

export type CutClassification = "computed" | "no_match" | "empty";

export interface ComputeCutCoreResult {
  classification: CutClassification;
  dimension: CutDimension;
  appliedFilters: CutFilter[];
  appliedNumericFilters: CutNumericFilter[];
  groups: CutGroup[];
  headlineSoldFloor: number;
  /** Distinct dimension values observed AFTER filters (for messaging). */
  dimensionValues: string[];
  /** Distinct values per filterable field across the FULL dataset (pre-filter). */
  availableValues: Record<CutFilterField, string[]>;
  scopedRowCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local numeric helpers (kept self-contained — parse helpers in csv-aggregate.ts
// are not exported, and we want this module DB-free at the core).
// ─────────────────────────────────────────────────────────────────────────────

function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.toString().trim();
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseRatio(raw: string | null | undefined): number | null {
  const n = parseNumber(raw);
  if (n == null || n <= 0) return null;
  return n > 3 ? n / 100 : n;
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

// ─────────────────────────────────────────────────────────────────────────────
// Formatters — the persisted metricValueString MUST equal the LedgerFact value
// so the grounding pass round-trips. Conventions mirror the ledger's display.
// ─────────────────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function formatDays(n: number): string {
  return `${Math.round(n)} days`;
}
function formatMonths(n: number): string {
  return `${n.toFixed(1)} months`;
}
function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}
function formatPsf(n: number): string {
  return `$${Math.round(n)}/sq ft`;
}

/** pre-1960 / 1960s … 2020s / Unknown. */
export function yearBuiltDecadeLabel(year: number | null): string {
  if (year == null || !Number.isFinite(year) || year <= 0) return "Unknown";
  if (year < 1960) return "Pre-1960";
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure core
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_FIELDS: CutFilterField[] = [
  "neighbourhood",
  "city",
  "style",
  "propertyClass",
  "priceBracket",
];

function dimensionValueOf(row: CutRow, dim: CutDimension): string | null {
  switch (dim) {
    case "neighbourhood":
      return emptyToNull(row.neighbourhood);
    case "city":
      return emptyToNull(row.city);
    case "style":
      return emptyToNull(row.style);
    case "propertyClass":
      return emptyToNull(row.propertyClass);
    case "priceBracket":
      return emptyToNull(row.priceBracket);
    case "yearBuiltDecade":
      return yearBuiltDecadeLabel(row.yearBuilt);
    case "bedrooms":
      return row.bedrooms != null ? String(row.bedrooms) : null;
    case "bathrooms":
      return row.bathrooms != null ? String(row.bathrooms) : null;
  }
}

const NUMERIC_FIELDS: CutNumericField[] = [
  "sqft",
  "bedrooms",
  "bathrooms",
  "salePrice",
  "yearBuilt",
];

function numericValueOf(row: CutRow, field: CutNumericField): number | null {
  switch (field) {
    case "sqft":
      return row.sqft;
    case "bedrooms":
      return row.bedrooms;
    case "bathrooms":
      return row.bathrooms;
    case "salePrice":
      return row.salePrice;
    case "yearBuilt":
      return row.yearBuilt;
  }
}

/** Normalize a numeric filter so min <= max (defensive against swapped bounds). */
function normalizeNumericFilter(nf: CutNumericFilter): CutNumericFilter {
  if (nf.min != null && nf.max != null && nf.min > nf.max) {
    return { field: nf.field, min: nf.max, max: nf.min };
  }
  return nf;
}

/**
 * A row matches a numeric filter only when it HAS a value (null is never coerced
 * to 0) AND that value falls inside the inclusive [min, max] bounds supplied.
 */
function numericMatch(row: CutRow, nf: CutNumericFilter): boolean {
  const v = numericValueOf(row, nf.field);
  if (v == null) return false;
  if (nf.min != null && v < nf.min) return false;
  if (nf.max != null && v > nf.max) return false;
  return true;
}

function filterValueOf(row: CutRow, field: CutFilterField): string | null {
  switch (field) {
    case "neighbourhood":
      return emptyToNull(row.neighbourhood);
    case "city":
      return emptyToNull(row.city);
    case "style":
      return emptyToNull(row.style);
    case "propertyClass":
      return emptyToNull(row.propertyClass);
    case "priceBracket":
      return emptyToNull(row.priceBracket);
  }
}

function emptyToNull(s: string | null): string | null {
  if (s == null) return null;
  const t = s.toString().trim();
  return t.length > 0 ? t : null;
}

/**
 * Identity key for "is this the same city?" decisions (multi-city detection):
 * case-insensitive with collapsed internal whitespace. Used ONLY for counting
 * distinct cities — display labels keep the original string.
 */
function normalizeCityKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function distinctSorted(values: Array<string | null>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = emptyToNull(v);
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

interface GroupAcc {
  bucket: string;
  active: number;
  pending: number;
  sold: number;
  offMarket: number;
  soldPrices: number[];
  soldPsfs: number[];
  soldDoms: number[];
  soldSpLpRatios: number[];
}

function emptyGroupAcc(bucket: string): GroupAcc {
  return {
    bucket,
    active: 0,
    pending: 0,
    sold: 0,
    offMarket: 0,
    soldPrices: [],
    soldPsfs: [],
    soldDoms: [],
    soldSpLpRatios: [],
  };
}

/** Mirrors tallyRow: only Sold rows feed the metric arrays. */
function tally(acc: GroupAcc, row: CutRow): void {
  switch (row.status) {
    case "active":
      acc.active += 1;
      return;
    case "pending":
      acc.pending += 1;
      return;
    case "offMarket":
      acc.offMarket += 1;
      return;
    case "unknown":
      return;
    case "sold":
      acc.sold += 1;
      if (row.salePrice != null) acc.soldPrices.push(row.salePrice);
      if (row.salePrice != null && row.sqft != null && row.sqft > 0) {
        acc.soldPsfs.push(row.salePrice / row.sqft);
      }
      if (row.daysOnMarket != null && row.daysOnMarket >= 0) {
        acc.soldDoms.push(row.daysOnMarket);
      }
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

/** Mirrors metricsFromAccumulator for the metrics this tool surfaces. */
function metricsFor(acc: GroupAcc): CutGroupMetric[] {
  const out: CutGroupMetric[] = [];

  const medPrice = median(acc.soldPrices);
  if (medPrice != null) {
    out.push({
      key: "median_sale_price",
      family: MetricFamily.MEDIAN,
      label: "Median sale price",
      value: medPrice,
      valueString: formatCurrency(medPrice),
    });
  }

  const psf = median(acc.soldPsfs);
  if (psf != null) {
    out.push({
      key: "psf",
      family: MetricFamily.PSF,
      label: "Price per sq ft",
      value: psf,
      valueString: formatPsf(psf),
    });
  }

  const domMed = median(acc.soldDoms);
  if (domMed != null) {
    out.push({
      key: "median_dom",
      family: MetricFamily.DOM,
      label: "Median days on market",
      value: domMed,
      valueString: formatDays(domMed),
    });
  }

  const splp = average(acc.soldSpLpRatios);
  if (splp != null) {
    const pct = splp * 100;
    out.push({
      key: "sale_to_list_ratio",
      family: MetricFamily.SP_LP,
      label: "Sale-to-list ratio",
      value: pct,
      valueString: formatPercent(pct),
    });
  }

  // MOI (strict): Active ÷ Sold. Requires sold > 0.
  if (acc.sold > 0) {
    const moi = acc.active / acc.sold;
    out.push({
      key: "months_of_inventory",
      family: MetricFamily.MOI,
      label: "Months of inventory",
      value: moi,
      valueString: formatMonths(moi),
    });
  }

  return out;
}

/**
 * Pure cut computation. DB-free, deterministic. `rows` must already carry only
 * available columns (the wrapper resolves column availability before calling).
 */
export function computeCut(
  rows: CutRow[],
  params: ComputeCutParams,
  opts: {
    headlineSoldFloor: number;
    discloseFloor?: number;
    classColumnDistinct?: boolean;
  },
): ComputeCutCoreResult {
  const headlineSoldFloor = opts.headlineSoldFloor;
  // Hard minimum below which a figure is too thin to headline at all. Defaults
  // to the platform sold floor; runComputeCut passes the per-member floor.
  const discloseFloor = opts.discloseFloor ?? MIN_SOLD_SAMPLE;
  const appliedFilters = params.filters ?? [];
  const appliedNumericFilters = (params.numericFilters ?? []).map(
    normalizeNumericFilter,
  );

  const availableValues = FILTER_FIELDS.reduce(
    (m, f) => {
      m[f] = distinctSorted(rows.map((r) => filterValueOf(r, f)));
      return m;
    },
    {} as Record<CutFilterField, string[]>,
  );

  if (rows.length === 0) {
    return {
      classification: "empty",
      dimension: params.dimension,
      appliedFilters,
      appliedNumericFilters,
      groups: [],
      headlineSoldFloor,
      dimensionValues: [],
      availableValues,
      scopedRowCount: 0,
    };
  }

  // Apply CATEGORICAL filters first (case-insensitive exact match per field).
  const catScoped = rows.filter((row) =>
    appliedFilters.every((f) => {
      const v = filterValueOf(row, f.field);
      return v != null && v.toLowerCase() === f.value.trim().toLowerCase();
    }),
  );

  if (catScoped.length === 0) {
    // A categorical column is present but the requested VALUE isn't in the data.
    // Honest refusal path — caller surfaces availableValues; NEVER a proxy.
    return {
      classification: "no_match",
      dimension: params.dimension,
      appliedFilters,
      appliedNumericFilters,
      groups: [],
      headlineSoldFloor,
      dimensionValues: [],
      availableValues,
      scopedRowCount: 0,
    };
  }

  // Then apply NUMERIC range filters. A numeric range zeroing the set is NOT a
  // column/value error — the columns and values are valid, just nothing falls in
  // the requested range. Return a real "computed" result with zero groups so the
  // caller reports an honest count ("no listings match …"), never a no_match.
  let scoped = catScoped.filter((row) =>
    appliedNumericFilters.every((nf) => numericMatch(row, nf)),
  );

  // Style cuts are single-family-only. A style value ("2 Storey", "Bungalow")
  // can belong to either a single-family home OR a condo, so a style-segmented
  // cut must never fold cross-class rows (e.g. a "2 Storey" condo) into a
  // Single-Family headline. Restrict to single-family when the cut involves the
  // style dimension/filter, the member did NOT explicitly ask for a property-
  // class cut, and the upload actually carries recognizable single-family rows.
  // Condos remain reachable via an explicit propertyClass cut. Only a class
  // column DISTINCT from the mapped style header can drive this restriction
  // (opts.classColumnDistinct) — if the member mapped their style column to a
  // header literally named "Property Type", the class candidate collides with
  // the style column itself, so there is no separate class signal and the
  // restriction stays inactive. Mirrors the deterministic aggregator
  // (csv-aggregate.ts) exactly so both engines agree.
  const styleInvolved =
    params.dimension === "style" ||
    appliedFilters.some((f) => f.field === "style");
  const classExplicit =
    params.dimension === "propertyClass" ||
    appliedFilters.some((f) => f.field === "propertyClass");
  if (
    styleInvolved &&
    !classExplicit &&
    opts.classColumnDistinct === true &&
    rows.some((r) => isSingleFamilyClass(r.propertyClass))
  ) {
    scoped = scoped.filter((r) => isSingleFamilyClass(r.propertyClass));
  }

  if (scoped.length === 0) {
    return {
      classification: "computed",
      dimension: params.dimension,
      appliedFilters,
      appliedNumericFilters,
      groups: [],
      headlineSoldFloor,
      dimensionValues: [],
      availableValues,
      scopedRowCount: 0,
    };
  }

  // City scoping: when grouping BY neighbourhood across a dataset that spans
  // 2+ cities, disambiguate the bucket by its city so same-named neighbourhoods
  // in different municipalities never merge (e.g. "Downtown" in two cities north
  // of Dallas). Single-city scopes (0 or 1 distinct city — including no city
  // column, and any cut already filtered to one city) take the legacy path
  // untouched, so their output is byte-for-byte identical. Other dimensions are
  // never affected (city is its own dimension via dimensionValueOf).
  // Count distinct cities by a normalized key (case-insensitive, whitespace-
  // collapsed) so that mere format variants of ONE city ("Plano", "PLANO",
  // " plano ") never trip multi-city mode and accidentally push a single-city
  // member onto the composite-label path. Display still uses the original
  // string.
  const distinctCities = new Set<string>();
  for (const row of scoped) {
    const c = emptyToNull(row.city);
    if (c) distinctCities.add(normalizeCityKey(c));
  }
  const scopeNeighbourhoodByCity =
    params.dimension === "neighbourhood" && distinctCities.size >= 2;

  const accs = new Map<string, GroupAcc>();
  for (const row of scoped) {
    let bucket = dimensionValueOf(row, params.dimension) ?? "Unknown";
    if (scopeNeighbourhoodByCity) {
      const c = emptyToNull(row.city);
      if (c) bucket = `${bucket} (${c})`;
    }
    let acc = accs.get(bucket);
    if (!acc) {
      acc = emptyGroupAcc(bucket);
      accs.set(bucket, acc);
    }
    tally(acc, row);
  }

  const groups: CutGroup[] = [...accs.values()]
    .map((acc) => {
      const total = acc.active + acc.pending + acc.sold + acc.offMarket;
      const band = sampleBandFor(acc.sold, headlineSoldFloor, discloseFloor);
      return {
        bucket: acc.bucket,
        soldCount: acc.sold,
        activeCount: acc.active,
        pendingCount: acc.pending,
        offMarketCount: acc.offMarket,
        totalCount: total,
        headlineSafe: band === "headline",
        band,
        metrics: metricsFor(acc),
      };
    })
    .sort((a, b) => b.soldCount - a.soldCount || a.bucket.localeCompare(b.bucket));

  return {
    classification: "computed",
    dimension: params.dimension,
    appliedFilters,
    appliedNumericFilters,
    groups,
    headlineSoldFloor,
    dimensionValues: groups.map((g) => g.bucket),
    availableValues,
    scopedRowCount: scoped.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB wrapper
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTE_CUT_TOOL_TYPE = "compute_cut";

/** "2026-05" → "May 2026", for human-readable sample disclosures. */
function monthYearLabel(monthYear: string): string {
  const d = new Date(`${monthYear.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return monthYear;
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Raw-column header candidates (normalized) for the unmapped dimensions. */
const PROPERTY_CLASS_HEADER_CANDIDATES = ["propertytype", "propertyclass"];
const PRICE_BRACKET_HEADER_CANDIDATES = [
  "pricebracket",
  "pricerange",
  "priceband",
];
/**
 * City is optional in the column mapper and many members never mapped it even
 * though their export carries a literal City/Municipality column. So — exactly
 * like propertyClass/priceBracket above — we self-resolve it from well-known
 * raw header names when it isn't explicitly mapped. (Normalized to match
 * `headerLookup` keys.)
 */
const CITY_HEADER_CANDIDATES = ["city", "municipality"];

export type RunCutClassification =
  | "computed"
  | "sample_too_small"
  | "no_match"
  | "unavailable"
  | "no_upload";

export interface RunComputeCutResult {
  ok: boolean;
  classification: RunCutClassification;
  monthYear: string | null;
  dimension: CutDimension;
  note: string;
  facts: LedgerFact[];
  /** Values available for messaging (honest refusals). */
  availableValues?: string[];
  availableDimensions?: CutDimension[];
  /**
   * Numeric per-group results for the computed cut (present only when
   * classification === "computed"). Exposed so the YoY engine can match groups
   * across periods and compute deterministic deltas without re-parsing the
   * formatted ledger value strings.
   */
  coreGroups?: CutGroup[];
}

export interface ComputeCutDeps {
  prisma: {
    marketDataUpload: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        monthYear: string;
        csvStorageUrl: string | null;
      } | null>;
      findMany?: (args: unknown) => Promise<{ monthYear: string }[]>;
    };
    marketFact: {
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
    onDemandExtractionLog: { create: (args: unknown) => Promise<unknown> };
  };
  readCsv: (storageKey: string) => Promise<Buffer>;
  getMarketConfig: (userId: string) => Promise<MarketConfigShape | null>;
  loadSettings: (
    userId: string,
  ) => Promise<{ sampleSizeVariant: "conservative" | "permissive" | "strict" }>;
}

function defaultDeps(): ComputeCutDeps {
  return {
    prisma: prismaDefault as unknown as ComputeCutDeps["prisma"],
    readCsv: realReadUploadFile,
    getMarketConfig: realGetMarketConfig,
    loadSettings: realLoadSettings,
  };
}

function buildHeaderLookup(headers: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of headers) m.set(normalizeHeader(h), h);
  return m;
}
function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[\s_]+/g, "");
}
function readMappedCell(
  row: Record<string, string>,
  headerLookup: Map<string, string>,
  mappedHeader: string | undefined,
): string | null {
  if (!mappedHeader) return null;
  if (mappedHeader in row) return row[mappedHeader] ?? null;
  const actual = headerLookup.get(normalizeHeader(mappedHeader));
  return actual ? (row[actual] ?? null) : null;
}
function resolveRawHeader(
  headerLookup: Map<string, string>,
  candidates: string[],
): string | null {
  for (const c of candidates) {
    const actual = headerLookup.get(c);
    if (actual) return actual;
  }
  return null;
}
/**
 * A mapped column is only truly available when its mapped header actually
 * resolves against the CSV's real headers (same resolution `readMappedCell`
 * uses). A mapping that points at a header absent from this upload must be
 * treated as missing so the honesty gate returns `unavailable` rather than
 * silently degrading into empty "Unknown" buckets.
 */
function mappedHeaderResolves(
  mappedHeader: string | undefined,
  headerLookup: Map<string, string>,
): boolean {
  if (!mappedHeader) return false;
  return (
    headerLookup.has(normalizeHeader(mappedHeader)) ||
    [...headerLookup.values()].includes(mappedHeader)
  );
}

/**
 * Resolve the ACTUAL CSV header (original case) that supplies the city: prefer
 * the member's explicit `city` mapping, and fall back to well-known city header
 * names when it was never mapped. Returns null only when the upload genuinely
 * has no city/municipality column — that's the honest "unavailable" case.
 */
function resolveCityHeader(
  mappedHeader: string | undefined,
  headerLookup: Map<string, string>,
): string | null {
  if (mappedHeader) {
    const actual =
      headerLookup.get(normalizeHeader(mappedHeader)) ??
      ([...headerLookup.values()].includes(mappedHeader) ? mappedHeader : null);
    if (actual) return actual;
  }
  return resolveRawHeader(headerLookup, CITY_HEADER_CANDIDATES);
}

function dimensionLabel(dim: CutDimension): string {
  switch (dim) {
    case "neighbourhood":
      return "neighbourhood";
    case "city":
      return "city";
    case "style":
      return "style";
    case "propertyClass":
      return "property class";
    case "yearBuiltDecade":
      return "year-built decade";
    case "priceBracket":
      return "price bracket";
    case "bedrooms":
      return "bedrooms";
    case "bathrooms":
      return "bathrooms";
  }
}

function filterFieldLabel(field: CutFilterField): string {
  switch (field) {
    case "neighbourhood":
      return "neighbourhood";
    case "city":
      return "city";
    case "style":
      return "style";
    case "propertyClass":
      return "property class";
    case "priceBracket":
      return "price bracket";
  }
}

function numericFieldLabel(field: CutNumericField): string {
  switch (field) {
    case "sqft":
      return "sq ft";
    case "bedrooms":
      return "bedrooms";
    case "bathrooms":
      return "bathrooms";
    case "salePrice":
      return "sale price";
    case "yearBuilt":
      return "year built";
  }
}

/** Human label for a numeric range, e.g. "sq ft ≥ 3000", "sale price ≤ $400,000". */
function numericFilterLabel(nf: CutNumericFilter): string {
  const label = numericFieldLabel(nf.field);
  const fmt = (n: number) =>
    nf.field === "salePrice"
      ? `$${Math.round(n).toLocaleString("en-US")}`
      : String(n);
  if (nf.min != null && nf.max != null)
    return `${label} ${fmt(nf.min)}–${fmt(nf.max)}`;
  if (nf.min != null) return `${label} ≥ ${fmt(nf.min)}`;
  if (nf.max != null) return `${label} ≤ ${fmt(nf.max)}`;
  return label;
}

/** Stable signature fragment for a numeric filter (idempotent deletes). */
function numericFilterSig(nf: CutNumericFilter): string {
  const parts: string[] = [];
  if (nf.min != null) parts.push(`>=${nf.min}`);
  if (nf.max != null) parts.push(`<=${nf.max}`);
  return `${nf.field}${parts.join("&")}`;
}

/** Human scope suffix for labels, e.g. " — Single Family · sq ft ≥ 3000 · built 1990s". */
function scopeSuffix(
  filters: CutFilter[],
  numericFilters: CutNumericFilter[],
  dimension: CutDimension,
  bucket: string,
): string {
  const parts: string[] = [];
  for (const f of filters) parts.push(f.value);
  for (const nf of numericFilters) parts.push(numericFilterLabel(nf));
  if (dimension === "yearBuiltDecade") {
    parts.push(bucket === "Unknown" ? "year built unknown" : `built ${bucket}`);
  } else if (dimension === "bedrooms") {
    parts.push(bucket === "Unknown" ? "bedrooms unknown" : `${bucket}-bed`);
  } else if (dimension === "bathrooms") {
    parts.push(bucket === "Unknown" ? "bathrooms unknown" : `${bucket}-bath`);
  } else {
    parts.push(bucket);
  }
  return parts.join(" · ");
}

/** Deterministic scope signature used in metricName + for idempotent deletes. */
function scopeSignature(
  filters: CutFilter[],
  numericFilters: CutNumericFilter[],
  dimension: CutDimension,
  bucket: string,
): string {
  const fsig = filters
    .map((f) => `${f.field}=${f.value.trim().toLowerCase()}`)
    .sort()
    .join("&");
  const nsig = numericFilters.map(numericFilterSig).sort().join("&");
  const extra = [fsig, nsig].filter(Boolean).join("&");
  return `${dimension}=${bucket}${extra ? `;${extra}` : ""}`;
}

/** dimension/filter column availability against the resolved CSV headers. */
interface ResolvedColumns {
  neighbourhood: boolean;
  cityHeader: string | null;
  style: boolean;
  yearBuilt: boolean;
  sqft: boolean;
  bedrooms: boolean;
  bathrooms: boolean;
  salePrice: boolean;
  propertyClassHeader: string | null;
  priceBracketHeader: string | null;
}

function dimensionAvailable(dim: CutDimension, cols: ResolvedColumns): boolean {
  switch (dim) {
    case "neighbourhood":
      return cols.neighbourhood;
    case "city":
      return cols.cityHeader != null;
    case "style":
      return cols.style;
    case "yearBuiltDecade":
      return cols.yearBuilt;
    case "propertyClass":
      return cols.propertyClassHeader != null;
    case "priceBracket":
      return cols.priceBracketHeader != null;
    case "bedrooms":
      return cols.bedrooms;
    case "bathrooms":
      return cols.bathrooms;
  }
}

function filterAvailable(field: CutFilterField, cols: ResolvedColumns): boolean {
  switch (field) {
    case "neighbourhood":
      return cols.neighbourhood;
    case "city":
      return cols.cityHeader != null;
    case "style":
      return cols.style;
    case "propertyClass":
      return cols.propertyClassHeader != null;
    case "priceBracket":
      return cols.priceBracketHeader != null;
  }
}

function numericFilterAvailable(
  field: CutNumericField,
  cols: ResolvedColumns,
): boolean {
  switch (field) {
    case "sqft":
      return cols.sqft;
    case "bedrooms":
      return cols.bedrooms;
    case "bathrooms":
      return cols.bathrooms;
    case "salePrice":
      return cols.salePrice;
    case "yearBuilt":
      return cols.yearBuilt;
  }
}

function availableDimensionsFrom(cols: ResolvedColumns): CutDimension[] {
  const all: CutDimension[] = [
    "neighbourhood",
    "city",
    "style",
    "propertyClass",
    "yearBuiltDecade",
    "priceBracket",
    "bedrooms",
    "bathrooms",
  ];
  return all.filter((d) => dimensionAvailable(d, cols));
}

function availableNumericFiltersFrom(cols: ResolvedColumns): CutNumericField[] {
  return NUMERIC_FIELDS.filter((f) => numericFilterAvailable(f, cols));
}

/**
 * The ONE source of truth that turns a member's column mapping + the actual CSV
 * headers into resolved cut columns. Both `runComputeCut` (the compute gate +
 * row reader) and `resolveAvailableCutDimensions` (the signal Jarvis is told)
 * call this, so availability, the gate, and the reader can never disagree on
 * which header supplies city/property-class/price-bracket.
 */
function resolveColumns(
  mapping: ColumnMapping,
  headerLookup: Map<string, string>,
): ResolvedColumns {
  return {
    neighbourhood: mappedHeaderResolves(mapping.neighbourhood, headerLookup),
    cityHeader: resolveCityHeader(mapping.city, headerLookup),
    style: mappedHeaderResolves(mapping.propertyType, headerLookup),
    yearBuilt: mappedHeaderResolves(mapping.yearBuilt, headerLookup),
    sqft: mappedHeaderResolves(mapping.sqft, headerLookup),
    bedrooms: mappedHeaderResolves(mapping.bedrooms, headerLookup),
    bathrooms: mappedHeaderResolves(mapping.bathrooms, headerLookup),
    salePrice: mappedHeaderResolves(mapping.salePrice, headerLookup),
    propertyClassHeader: resolveRawHeader(
      headerLookup,
      PROPERTY_CLASS_HEADER_CANDIDATES,
    ),
    priceBracketHeader: resolveRawHeader(
      headerLookup,
      PRICE_BRACKET_HEADER_CANDIDATES,
    ),
  };
}

/** The actual distinct values present in one categorical cut dimension. */
export interface DimensionValueSet {
  dimension: CutDimension;
  label: string;
  /** Distinct values present, most frequent first (capped). */
  values: string[];
  /** True when more distinct values exist than the cap surfaced. */
  truncated: boolean;
}

export interface AvailableCutDimensions {
  /** Machine dimensions the member's latest upload can actually be cut by. */
  dimensions: CutDimension[];
  /** Human labels (e.g. "year-built decade") for surfacing in prose/prompts. */
  labels: string[];
  /** Mapped numeric columns this upload can be range-filtered by. */
  numericFilters: CutNumericField[];
  /** Human labels for the numeric filters (e.g. "sq ft", "sale price"). */
  numericFilterLabels: string[];
  /**
   * The actual distinct VALUES present in each categorical group dimension
   * (style, propertyClass, city) for THIS member's upload. Lets Jarvis route a
   * request to the right dimension — e.g. a member who mapped their property
   * classes (Single Family / Condo) to the Style column surfaces them under
   * "style", not "propertyClass", so "single family" must filter on style.
   */
  dimensionValues: DimensionValueSet[];
  /** The upload month these were resolved against, or null if none exists. */
  monthYear: string | null;
}

/** Categorical group dimensions whose distinct values are worth surfacing so
 *  Jarvis can route the member's wording to the dimension that holds it.
 *  Neighbourhood is deliberately omitted (already listed in market config and
 *  often hundreds of values); numeric/derived dimensions speak for themselves. */
const VALUE_SURFACED_DIMENSIONS: CutDimension[] = ["style", "propertyClass", "city"];
const MAX_SURFACED_VALUES = 12;

/**
 * Compute the distinct values present in each surfaced categorical dimension,
 * using the SAME cell-reading + normalization the row reader uses so the
 * surfaced values match the buckets a real cut would produce. Most-frequent
 * first; capped at MAX_SURFACED_VALUES with a `truncated` flag.
 */
function surfaceDimensionValues(
  records: Record<string, string>[],
  cols: ResolvedColumns,
  mapping: ColumnMapping,
  headerLookup: Map<string, string>,
  available: CutDimension[],
): DimensionValueSet[] {
  const dims = VALUE_SURFACED_DIMENSIONS.filter((d) => available.includes(d));
  if (dims.length === 0) return [];
  const counts = new Map<CutDimension, Map<string, number>>();
  for (const d of dims) counts.set(d, new Map());
  for (const raw of records) {
    for (const d of dims) {
      let val: string | null = null;
      if (d === "style") {
        val = normalizePropertyType(
          readMappedCell(raw, headerLookup, mapping.propertyType),
        ).type;
      } else if (d === "propertyClass") {
        val = cols.propertyClassHeader
          ? emptyToNull(raw[cols.propertyClassHeader] ?? null)
          : null;
      } else if (d === "city") {
        val = cols.cityHeader ? emptyToNull(raw[cols.cityHeader] ?? null) : null;
      }
      val = emptyToNull(val);
      if (!val || val.toLowerCase() === "unknown") continue;
      const m = counts.get(d)!;
      m.set(val, (m.get(val) ?? 0) + 1);
    }
  }
  const out: DimensionValueSet[] = [];
  for (const d of dims) {
    const sorted = [...counts.get(d)!.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([v]) => v);
    if (sorted.length === 0) continue;
    out.push({
      dimension: d,
      label: dimensionLabel(d),
      values: sorted.slice(0, MAX_SURFACED_VALUES),
      truncated: sorted.length > MAX_SURFACED_VALUES,
    });
  }
  return out;
}

/**
 * Resolve which on-demand cut dimensions are genuinely available for a member's
 * latest validated upload, using the SAME column resolver as the compute path.
 * This is the proactive signal Jarvis is told about so it offers/calls cuts the
 * member's data can actually answer (notably city, which self-resolves from a
 * `city`/`municipality` header even when it was never explicitly mapped).
 *
 * Never throws: any load/parse failure degrades to an empty list, leaving the
 * compute tool's own honest-refusal note as the backstop.
 */
export async function resolveAvailableCutDimensions(
  input: { userId: string; monthYear?: string },
  depsOverride?: Partial<ComputeCutDeps>,
): Promise<AvailableCutDimensions> {
  const empty: AvailableCutDimensions = {
    dimensions: [],
    labels: [],
    numericFilters: [],
    numericFilterLabels: [],
    dimensionValues: [],
    monthYear: null,
  };
  try {
    const deps = { ...defaultDeps(), ...depsOverride };
    const wantMonth =
      typeof input.monthYear === "string" && /^\d{4}-\d{2}$/.test(input.monthYear)
        ? input.monthYear
        : null;
    const upload = await deps.prisma.marketDataUpload.findFirst({
      where: {
        userId: input.userId,
        status: "validated",
        ...(wantMonth ? { monthYear: wantMonth } : {}),
      },
      orderBy: [{ monthYear: "desc" }, { validatedAt: "desc" }],
      select: { id: true, monthYear: true, csvStorageUrl: true },
    });
    if (!upload || !upload.csvStorageUrl) return empty;

    const config = await deps.getMarketConfig(input.userId);
    if (!config) return { ...empty, monthYear: upload.monthYear };

    const mapping: ColumnMapping = config.columnMapping ?? {};
    const buffer = await deps.readCsv(upload.csvStorageUrl);
    const records = parseCsvRecords<Record<string, string>>(
      buffer.toString("utf8"),
      { columns: true },
    );
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    const headerLookup = buildHeaderLookup(headers);
    const cols = resolveColumns(mapping, headerLookup);
    const dimensions = availableDimensionsFrom(cols);
    const numericFilters = availableNumericFiltersFrom(cols);
    // Persistent exclusion list — hide removed neighbourhood values from the
    // availability signal so the member never sees junk they deleted.
    const excludedKeys = await getExcludedNeighbourhoodKeys(input.userId);
    const dimensionValues = surfaceDimensionValues(
      records,
      cols,
      mapping,
      headerLookup,
      dimensions,
    ).map((dv) =>
      dv.dimension === "neighbourhood" && excludedKeys.size > 0
        ? { ...dv, values: dv.values.filter((v) => !isExcluded(excludedKeys, v)) }
        : dv,
    );
    return {
      dimensions,
      labels: dimensions.map(dimensionLabel),
      numericFilters,
      numericFilterLabels: numericFilters.map(numericFieldLabel),
      dimensionValues,
      monthYear: upload.monthYear,
    };
  } catch {
    return empty;
  }
}

/**
 * Run a cut end-to-end: load the member's latest validated upload, re-parse the
 * RAW CSV, compute the cut, persist real facts (idempotent per scope), log the
 * call, and return LedgerFacts the orchestrator can cite. Never throws for the
 * "honest refusal" paths — it returns a structured note instead.
 */
export async function runComputeCut(
  input: { userId: string; params: ComputeCutParams },
  depsOverride?: Partial<ComputeCutDeps>,
): Promise<RunComputeCutResult> {
  const deps = { ...defaultDeps(), ...depsOverride };
  const { userId, params } = input;
  const { dimension } = params;
  const filters = params.filters ?? [];
  const numericFilters = (params.numericFilters ?? []).map(normalizeNumericFilter);

  // Period-aware: when params.monthYear is set, target that exact validated
  // upload (the mechanism behind prior-period + YoY cuts); otherwise the latest.
  const wantMonth =
    typeof params.monthYear === "string" && /^\d{4}-\d{2}$/.test(params.monthYear)
      ? params.monthYear
      : null;
  const upload = await deps.prisma.marketDataUpload.findFirst({
    where: {
      userId,
      status: "validated",
      ...(wantMonth ? { monthYear: wantMonth } : {}),
    },
    orderBy: [{ monthYear: "desc" }, { validatedAt: "desc" }],
    select: { id: true, monthYear: true, csvStorageUrl: true },
  });
  if (!upload || !upload.csvStorageUrl) {
    return {
      ok: false,
      classification: "no_upload",
      monthYear: wantMonth,
      dimension,
      note: wantMonth
        ? `No validated market-data upload exists for ${monthYearLabel(wantMonth)} (${wantMonth}), so no cut can be computed for that period.`
        : "No validated market-data upload is available for this member, so no cut can be computed.",
      facts: [],
    };
  }

  const config = await deps.getMarketConfig(userId);
  if (!config) {
    return {
      ok: false,
      classification: "unavailable",
      monthYear: upload.monthYear,
      dimension,
      note: "This member has no market configuration, so the upload columns can't be interpreted.",
      facts: [],
    };
  }

  const mapping: ColumnMapping = config.columnMapping ?? {};
  const buffer = await deps.readCsv(upload.csvStorageUrl);
  const records = parseCsvRecords<Record<string, string>>(buffer.toString("utf8"), {
    columns: true,
  });
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const headerLookup = buildHeaderLookup(headers);

  const cols = resolveColumns(mapping, headerLookup);
  const { cityHeader, propertyClassHeader, priceBracketHeader } = cols;

  // Honesty gate 1 — the requested COLUMN is genuinely not in this upload.
  const missing: string[] = [];
  if (!dimensionAvailable(dimension, cols)) missing.push(dimensionLabel(dimension));
  for (const f of filters) {
    if (!filterAvailable(f.field, cols)) missing.push(filterFieldLabel(f.field));
  }
  for (const nf of numericFilters) {
    if (!numericFilterAvailable(nf.field, cols))
      missing.push(numericFieldLabel(nf.field));
  }
  if (missing.length > 0) {
    const avail = availableDimensionsFrom(cols);
    const availNumeric = availableNumericFiltersFrom(cols);
    const numericNote =
      availNumeric.length > 0
        ? ` Numeric filters available: ${availNumeric.map(numericFieldLabel).join(", ")}.`
        : "";
    await logCall(deps, userId, upload.id, params, "unavailable", null);
    return {
      ok: false,
      classification: "unavailable",
      monthYear: upload.monthYear,
      dimension,
      note: `That column isn't in this member's upload (${[...new Set(missing)].join(", ")}). Cuts available from this upload: ${avail.map(dimensionLabel).join(", ")}.${numericNote}`,
      facts: [],
      availableDimensions: avail,
    };
  }

  const statusMapping = resolveStatusMapping(config);
  const cutRows: CutRow[] = records.map((raw) => {
    const statusStr = readMappedCell(raw, headerLookup, mapping.status);
    const status: StatusBucket = mapping.status
      ? bucketStatus(statusStr, statusMapping)
      : "sold";
    const neighbourhood =
      emptyToNull(readMappedCell(raw, headerLookup, mapping.neighbourhood)) ??
      "Unknown";
    const city = cityHeader ? emptyToNull(raw[cityHeader] ?? null) : null;
    const style = normalizePropertyType(
      readMappedCell(raw, headerLookup, mapping.propertyType),
    ).type;
    const propertyClass = propertyClassHeader
      ? emptyToNull(raw[propertyClassHeader] ?? null)
      : null;
    const priceBracket = priceBracketHeader
      ? emptyToNull(raw[priceBracketHeader] ?? null)
      : null;
    return {
      status,
      neighbourhood,
      city,
      style,
      propertyClass,
      priceBracket,
      yearBuilt: parseNumber(readMappedCell(raw, headerLookup, mapping.yearBuilt)),
      salePrice: parseNumber(readMappedCell(raw, headerLookup, mapping.salePrice)),
      listPrice: parseNumber(readMappedCell(raw, headerLookup, mapping.listPrice)),
      daysOnMarket: parseNumber(
        readMappedCell(raw, headerLookup, mapping.daysOnMarket),
      ),
      sqft: parseNumber(readMappedCell(raw, headerLookup, mapping.sqft)),
      bedrooms: parseNumber(readMappedCell(raw, headerLookup, mapping.bedrooms)),
      bathrooms: parseNumber(
        readMappedCell(raw, headerLookup, mapping.bathrooms),
      ),
      spLpRatio: parseRatio(
        readMappedCell(raw, headerLookup, mapping.saleToListRatio),
      ),
    };
  });

  // Per-member hard sample floor (default 5): below it a figure is too thin to
  // headline at all. Between it and HEADLINE_SOLD_FLOOR a figure is usable WITH
  // an explicit "based on N sales" disclosure. At/above HEADLINE_SOLD_FLOOR it
  // headlines normally.
  const discloseFloor = sampleFloorFor(
    (await deps.loadSettings(userId)).sampleSizeVariant,
  ).sold;
  const headlineSoldFloor = Math.max(HEADLINE_SOLD_FLOOR, discloseFloor);

  // Persistent exclusion list — drop rows whose neighbourhood the member
  // removed so excluded junk pollutes neither neighbourhood cuts NOR the
  // "All Neighbourhoods" aggregate. Applied to the mapped neighbourhood (incl.
  // the "Unknown" fallback), so excluding "Unknown" cleans unmapped rows too.
  const excludedKeys = await getExcludedNeighbourhoodKeys(userId);
  const filteredCutRows =
    excludedKeys.size === 0
      ? cutRows
      : cutRows.filter((r) => !isExcluded(excludedKeys, r.neighbourhood));

  // Only a class column DISTINCT from the mapped style header can drive the
  // single-family restriction. If the member mapped their style column to a
  // header named like a class candidate (e.g. "Property Type"), the candidate
  // collides with the style column itself — no separate class signal — so the
  // restriction stays inactive. Mirrors csv-aggregate.ts exactly.
  const styleHeaderActual = mapping.propertyType
    ? headerLookup.get(normalizeHeader(mapping.propertyType)) ?? null
    : null;
  const classColumnDistinct =
    propertyClassHeader != null &&
    (styleHeaderActual == null ||
      normalizeHeader(propertyClassHeader) !==
        normalizeHeader(styleHeaderActual));

  const core = computeCut(filteredCutRows, params, {
    headlineSoldFloor,
    discloseFloor,
    classColumnDistinct,
  });

  // Honesty gate 2 — column present, but the requested filter value isn't.
  if (core.classification === "no_match" || core.classification === "empty") {
    const offending = filters.filter((f) => {
      const have = core.availableValues[f.field] ?? [];
      return !have.some((v) => v.toLowerCase() === f.value.trim().toLowerCase());
    });
    const offField = offending[0]?.field ?? filters[0]?.field ?? null;
    const avail = offField ? core.availableValues[offField] : [];
    const askedFor = offending.map((f) => `"${f.value}"`).join(", ");
    const note = offField
      ? `No rows match ${askedFor || "the requested filter"} in this member's ${filterFieldLabel(offField)} column. The values actually present are: ${avail.length ? avail.join(", ") : "(none)"}. Do not substitute a different column — tell the member which values exist.`
      : `No rows match the requested cut in this member's upload.`;
    await logCall(deps, userId, upload.id, params, "no_match", null);
    return {
      ok: false,
      classification: "no_match",
      monthYear: upload.monthYear,
      dimension,
      note,
      facts: [],
      availableValues: avail,
    };
  }

  // Build persistable facts (only groups with at least one non-null metric).
  const monthYear = upload.monthYear;
  const dateContext = new Date(`${monthYear.slice(0, 7)}-01T00:00:00Z`);
  const requestId = randomUUID();
  const filtersNeighbourhood = filters.find((f) => f.field === "neighbourhood");
  const filtersStyle = filters.find((f) => f.field === "style");

  interface PendingFact {
    id: string;
    metricName: string;
    data: Record<string, unknown>;
    ledger: LedgerFact;
  }
  const pending: PendingFact[] = [];

  for (const group of core.groups) {
    if (group.metrics.length === 0) continue;
    const sig = scopeSignature(filters, numericFilters, dimension, group.bucket);
    const suffix = scopeSuffix(filters, numericFilters, dimension, group.bucket);
    // neighbourhood column: actual neighbourhood when that's the scope, else "All".
    const factNeighbourhood =
      dimension === "neighbourhood"
        ? group.bucket
        : (filtersNeighbourhood?.value ?? "All Neighbourhoods");
    // propertyType column holds STYLE only — NEVER a class (avoid conflation).
    const factStyle =
      dimension === "style"
        ? group.bucket
        : (filtersStyle?.value ?? null);
    // Three honesty bands. The disclose band (hard floor .. headlineSoldFloor-1)
    // stays headline-eligible but its caveat MUST be surfaced as a "based on N
    // sales" disclosure. The thin band (< hard floor) is texture-only. Caveat
    // text deliberately contains no property-type words (scriptBuilder parses
    // property type out of caveats).
    const monthLabel = monthYearLabel(monthYear);
    const usableAsHeadline =
      group.band === "headline" || group.band === "disclose";
    const usageClass = usableAsHeadline
      ? "headline_safe"
      : "supporting_texture_only";
    const caveat =
      group.band === "headline"
        ? `Based on ${group.soldCount} sales in ${monthLabel}.`
        : group.band === "disclose"
          ? `Small sample — based on ${group.soldCount} sales in ${monthLabel}. State the sample size out loud whenever you cite this figure.`
          : `Only ${group.soldCount} sales in ${monthLabel} — too thin to headline. Use as background colour and say the sample is small; never present it as a headline number.`;

    for (const metric of group.metrics) {
      const id = randomUUID();
      const metricName = `${metric.key} · ${sig}`;
      const label = `${metric.label} — ${suffix}`;
      pending.push({
        id,
        metricName,
        data: {
          id,
          userId,
          uploadId: upload.id,
          neighbourhood: factNeighbourhood,
          propertyType: factStyle,
          metricName,
          metricFamily: metric.family,
          metricValue: metric.value,
          metricValueString: metric.valueString,
          sampleSize: group.soldCount,
          timeWindow: monthYear,
          dateContext,
          usageClass,
          sourceType: "on_demand_extraction",
          extractedAtCost: "0.0000",
          extractedAtRequest: requestId,
          viewerCaveat: caveat ?? null,
          notes: `compute_cut ${sig}`,
        },
        ledger: {
          id,
          label,
          neighbourhood: factNeighbourhood,
          value: metric.valueString,
          monthYear,
          source: `Market data — ${monthYear} (computed cut)`,
          ...(caveat ? { caveat } : {}),
        },
      });
    }
  }

  // All groups had zero usable metrics (e.g. zero sold across the scope), OR a
  // numeric filter excluded every row (0 groups). Both are honest "nothing to
  // cite" outcomes — surface the active scope (incl. numeric filters) so the
  // member learns the filter was too narrow, not that the column is missing.
  if (pending.length === 0) {
    const scopeBits = [
      ...filters.map((f) => f.value),
      ...numericFilters.map(numericFilterLabel),
    ];
    const scopeText = scopeBits.length ? ` (${scopeBits.join(" · ")})` : "";
    const note =
      core.groups.length === 0
        ? `No listings in ${monthYear} match this filter${scopeText}, so there is nothing to cite. The filter is genuinely too narrow for this upload — say so honestly rather than widening it silently.`
        : `The ${dimensionLabel(dimension)} cut${scopeText} produced groups but none had any closed sales to summarize, so there is nothing citable.`;
    await logCall(deps, userId, upload.id, params, "sample_too_small", null);
    return {
      ok: true,
      classification: "sample_too_small",
      monthYear,
      dimension,
      note,
      facts: [],
    };
  }

  // Idempotent per scope: replace any prior compute_cut facts with these exact
  // metricNames before re-inserting (repeat identical calls overwrite cleanly;
  // different scopes coexist).
  const metricNames = pending.map((p) => p.metricName);
  await deps.prisma.marketFact.deleteMany({
    where: {
      userId,
      uploadId: upload.id,
      sourceType: "on_demand_extraction",
      metricName: { in: metricNames },
    },
  });
  await deps.prisma.marketFact.createMany({
    data: pending.map((p) => p.data),
  });

  const headlineBuckets = core.groups
    .filter((g) => g.band === "headline" && g.metrics.length > 0)
    .map((g) => g.bucket);
  const discloseBuckets = core.groups
    .filter((g) => g.band === "disclose" && g.metrics.length > 0)
    .map((g) => `${g.bucket} (n=${g.soldCount})`);
  const thinBuckets = core.groups
    .filter((g) => g.band === "thin" && g.metrics.length > 0)
    .map((g) => `${g.bucket} (n=${g.soldCount})`);
  // Both headline and disclose groups are usable (disclose only WITH disclosure).
  const anyUsable = headlineBuckets.length + discloseBuckets.length > 0;

  const scopeBits = [
    ...filters.map((f) => f.value),
    ...numericFilters.map(numericFilterLabel),
  ];
  const noteParts: string[] = [];
  noteParts.push(
    `Computed ${dimensionLabel(dimension)} cut${scopeBits.length ? ` for ${scopeBits.join(" · ")}` : ""} from ${monthYear} data.`,
  );
  if (headlineBuckets.length) {
    noteParts.push(`Headline-safe (≥${headlineSoldFloor} sold): ${headlineBuckets.join(", ")}.`);
  }
  if (discloseBuckets.length) {
    noteParts.push(
      `Usable WITH disclosure (${discloseFloor}–${headlineSoldFloor - 1} sold) — cite these only with an explicit "based on N sales" qualifier: ${discloseBuckets.join(", ")}.`,
    );
  }
  if (thinBuckets.length) {
    noteParts.push(
      `Below the ${discloseFloor}-sale floor — texture only, do not headline: ${thinBuckets.join(", ")}.`,
    );
  }
  noteParts.push("Cite these numbers only by their fact ids.");

  const classification: RunCutClassification = anyUsable
    ? "computed"
    : "sample_too_small";
  await logCall(
    deps,
    userId,
    upload.id,
    params,
    anyUsable ? "computed" : "sample_too_small",
    pending[0]?.id ?? null,
  );

  return {
    ok: true,
    classification,
    monthYear,
    dimension,
    note: noteParts.join(" "),
    facts: pending.map((p) => p.ledger),
    coreGroups: core.groups,
  };
}

async function logCall(
  deps: ComputeCutDeps,
  userId: string,
  uploadId: string,
  params: ComputeCutParams,
  resultClassification: string,
  factId: string | null,
): Promise<void> {
  await deps.prisma.onDemandExtractionLog.create({
    data: {
      userId,
      uploadId,
      needSpec: params as unknown as object,
      estimatedCostUsd: "0.0000",
      actualCostUsd: "0.0000",
      resultClassification,
      factId,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Year-over-year cut engine
// ─────────────────────────────────────────────────────────────────────────────
//
// Runs the SAME deterministic cut against two periods — a base month (latest
// validated, or an explicit one) and a comparison month (the 12-months-prior
// upload, or the nearest available prior period when that exact month wasn't
// uploaded) — then matches groups by bucket and computes a real % delta per
// shared metric. Both endpoints are persisted, citable facts (via runComputeCut),
// so the assistant can write "$X a year ago → $Y now" with BOTH numbers grounded.
//
// Grounding guarantees (never fabricate a prior-year number):
//   - If no prior period exists at all → classification "no_comparison", note
//     lists the months that DO exist; no delta, no invented baseline.
//   - If the comparison upload can't support this cut (e.g. the column isn't in
//     that period's export format) → "no_comparison" with base facts still
//     returned; the YoY delta is withheld, not faked.
//   - A delta is only emitted when BOTH periods' group is headline/disclose-
//     usable; disclose-band endpoints carry the sample-size disclosure flag.

export type YoYCutClassification =
  | "computed"
  | "no_comparison"
  | "no_upload"
  | "unavailable"
  | "no_match"
  | "sample_too_small";

export interface YoYGroupDelta {
  bucket: string;
  metricKey: CutMetricKey;
  metricLabel: string;
  baseValue: number;
  baseValueString: string;
  priorValue: number;
  priorValueString: string;
  /** ((base - prior) / |prior|) * 100. */
  deltaPct: number;
  /** Signed, 1dp, e.g. "+12.3%". */
  deltaPctString: string;
  baseSold: number;
  priorSold: number;
  /** EITHER endpoint is in the disclose band → cite WITH "based on N sales". */
  needsDisclosure: boolean;
  /**
   * EITHER endpoint is in the thin band (below the per-member hard sample floor).
   * The delta is still real (both endpoints are persisted facts) but must be
   * labelled "small sample — directional only" when shown. This governs how the
   * number is CAVEATED, never whether it is shown: a member asking a direct
   * year-over-year question gets the figure with a label, never a refusal.
   */
  isThinSample: boolean;
}

export interface RunYoYCutResult {
  ok: boolean;
  classification: YoYCutClassification;
  dimension: CutDimension;
  baseMonth: string | null;
  comparisonMonth: string | null;
  /** comparisonMonth is NOT the exact 12-months-prior month (nearest fallback). */
  comparisonIsFallback: boolean;
  note: string;
  /** BOTH periods' persisted facts, each citable by id. */
  facts: LedgerFact[];
  deltas: YoYGroupDelta[];
  /** All validated months (desc) — for honest "what's available" messaging. */
  availableMonths: string[];
}

function monthIndex(monthYear: string): number {
  const [y, m] = monthYear.split("-").map(Number);
  return y * 12 + (m - 1);
}

function formatSignedPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * Choose the comparison period: the exact 12-months-prior month if uploaded,
 * else the available prior period CLOSEST to it (ties → the further-back month).
 * Candidates are always strictly before the base month — a YoY comparison is a
 * prior period, never a later one. Returns null when no prior period exists.
 */
function pickComparisonMonth(
  available: string[],
  base: string,
  yearAgo: string | null,
): { month: string; fallback: boolean } | null {
  const baseIdx = monthIndex(base);
  const priors = available.filter(
    (m) => m !== base && monthIndex(m) < baseIdx,
  );
  if (priors.length === 0) return null;
  if (yearAgo && priors.includes(yearAgo)) return { month: yearAgo, fallback: false };
  const target = yearAgo ? monthIndex(yearAgo) : baseIdx - 12;
  let best = priors[0];
  let bestDist = Math.abs(monthIndex(best) - target);
  for (const m of priors) {
    const d = Math.abs(monthIndex(m) - target);
    if (d < bestDist || (d === bestDist && monthIndex(m) < monthIndex(best))) {
      best = m;
      bestDist = d;
    }
  }
  return { month: best, fallback: true };
}

export async function runYoYCut(
  input: { userId: string; params: ComputeCutParams },
  depsOverride?: Partial<ComputeCutDeps>,
): Promise<RunYoYCutResult> {
  const deps = { ...defaultDeps(), ...depsOverride };
  const { userId, params } = input;
  const { dimension } = params;

  const base = {
    ok: false as const,
    dimension,
    comparisonIsFallback: false,
    facts: [] as LedgerFact[],
    deltas: [] as YoYGroupDelta[],
  };

  // 1. Validated months (desc), de-duped.
  const monthRows = deps.prisma.marketDataUpload.findMany
    ? await deps.prisma.marketDataUpload.findMany({
        where: { userId, status: "validated" },
        select: { monthYear: true },
        orderBy: [{ monthYear: "desc" }],
      })
    : [];
  const availableMonths = Array.from(
    new Set(monthRows.map((r) => r.monthYear).filter((m) => /^\d{4}-\d{2}$/.test(m))),
  ).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  // 2. Resolve the base month.
  const requestedBase =
    typeof params.monthYear === "string" && /^\d{4}-\d{2}$/.test(params.monthYear)
      ? params.monthYear
      : null;
  const baseMonth = requestedBase ?? availableMonths[0] ?? null;
  if (!baseMonth) {
    return {
      ...base,
      classification: "no_upload",
      baseMonth: null,
      comparisonMonth: null,
      note: "No validated market-data upload is available for this member, so no year-over-year cut can be computed.",
      availableMonths,
    };
  }
  if (requestedBase && !availableMonths.includes(requestedBase)) {
    return {
      ...base,
      classification: "no_upload",
      baseMonth: requestedBase,
      comparisonMonth: null,
      note: `No validated upload exists for ${monthYearLabel(requestedBase)} (${requestedBase}). Months actually uploaded: ${availableMonths.join(", ") || "(none)"}. Pick one of those; do not assume a period that isn't there.`,
      availableMonths,
    };
  }

  // 3. Resolve the comparison (year-ago, or nearest prior period).
  const yearAgo = shiftMonthYear(baseMonth, -12);
  const pick = pickComparisonMonth(availableMonths, baseMonth, yearAgo);
  if (!pick) {
    return {
      ...base,
      classification: "no_comparison",
      baseMonth,
      comparisonMonth: null,
      note: `Only ${availableMonths.map(monthYearLabel).join(", ")} ${availableMonths.length === 1 ? "is" : "are"} uploaded, so there is no prior period to compare ${monthYearLabel(baseMonth)} against. Tell the member a year-over-year figure isn't available yet; do NOT invent a prior-year number.`,
      availableMonths,
    };
  }
  const comparisonMonth = pick.month;
  const comparisonIsFallback = pick.fallback;

  // 4. Run the same cut for both periods (each persists its own citable facts).
  const baseRes = await runComputeCut(
    {
      userId,
      params: {
        dimension,
        filters: params.filters,
        numericFilters: params.numericFilters,
        monthYear: baseMonth,
      },
    },
    depsOverride,
  );
  if (!baseRes.ok) {
    // Column missing / no upload / filter value absent in the base period — the
    // honest refusal propagates verbatim (no comparison even attempted).
    const cls = (["no_upload", "unavailable", "no_match"] as const).includes(
      baseRes.classification as "no_upload" | "unavailable" | "no_match",
    )
      ? (baseRes.classification as YoYCutClassification)
      : "no_comparison";
    return {
      ...base,
      classification: cls,
      baseMonth,
      comparisonMonth,
      comparisonIsFallback,
      note: baseRes.note,
      availableMonths,
    };
  }
  // The base period genuinely has NOTHING to summarize — zero closed sales
  // across the whole scope, or a numeric filter that excluded every row. There
  // is no real data to show for the base period at all (no coreGroups), so an
  // honest refusal is correct. NOTE: a thin-but-real base (groups exist but all
  // sit below the headline floor) is NOT this case — coreGroups is populated, so
  // we proceed and show directional deltas with a small-sample label. The
  // headline-safe floor governs what may HEADLINE a video, never whether we'll
  // show a member their own market when they ask a direct question.
  if (
    baseRes.classification === "sample_too_small" &&
    (baseRes.coreGroups?.length ?? 0) === 0
  ) {
    return {
      ...base,
      classification: "sample_too_small",
      baseMonth,
      comparisonMonth,
      comparisonIsFallback,
      note: `${baseRes.note} A year-over-year delta needs a usable base figure, so none can be stated.`,
      availableMonths,
    };
  }

  const priorRes = await runComputeCut(
    {
      userId,
      params: {
        dimension,
        filters: params.filters,
        numericFilters: params.numericFilters,
        monthYear: comparisonMonth,
      },
    },
    depsOverride,
  );

  // 5. Match groups by bucket; compute deltas only where BOTH periods are usable.
  const baseGroups = new Map(
    (baseRes.coreGroups ?? []).map((g) => [g.bucket, g] as const),
  );
  const priorGroups = new Map(
    (priorRes.coreGroups ?? []).map((g) => [g.bucket, g] as const),
  );
  const deltas: YoYGroupDelta[] = [];
  for (const [bucket, bg] of baseGroups) {
    const pg = priorGroups.get(bucket);
    if (!pg) continue;
    // A member who asks a direct year-over-year question gets the real number
    // for EVERY group present in BOTH periods. The headline-safe floor governs
    // what may HEADLINE a video — NOT what we will show a member about their own
    // market. Thin endpoints (below the hard floor) come back flagged
    // `isThinSample` so the delta is labelled "small sample — directional only",
    // never withheld. No-fabrication guard intact: both endpoints are real
    // persisted facts (runComputeCut persists facts for ALL bands incl. thin),
    // and the pm.value===0 guard still skips an undivideable prior.
    const needsDisclosure = bg.band === "disclose" || pg.band === "disclose";
    const isThinSample = bg.band === "thin" || pg.band === "thin";
    const priorByKey = new Map(pg.metrics.map((m) => [m.key, m] as const));
    for (const bm of bg.metrics) {
      const pm = priorByKey.get(bm.key);
      if (!pm || pm.value === 0) continue;
      const deltaPct = ((bm.value - pm.value) / Math.abs(pm.value)) * 100;
      deltas.push({
        bucket,
        metricKey: bm.key,
        metricLabel: bm.label,
        baseValue: bm.value,
        baseValueString: bm.valueString,
        priorValue: pm.value,
        priorValueString: pm.valueString,
        deltaPct,
        deltaPctString: formatSignedPercent(deltaPct),
        baseSold: bg.soldCount,
        priorSold: pg.soldCount,
        needsDisclosure,
        isThinSample,
      });
    }
  }
  deltas.sort(
    (a, b) =>
      a.metricKey.localeCompare(b.metricKey) || b.deltaPct - a.deltaPct,
  );

  const facts = [...priorRes.facts, ...baseRes.facts];

  // The base period computed, but no grounded YoY delta is possible — the
  // comparison upload can't support this cut (export-format mismatch) or no
  // single group appears in BOTH periods (so there is no pair to difference).
  // Thin samples no longer land here: a group present in both periods is shown
  // as a directional delta with a small-sample label. Return the base facts so
  // the assistant can still cite the current period, but WITHHOLD any
  // year-over-year claim.
  if (deltas.length === 0) {
    const reason =
      !priorRes.ok || (priorRes.coreGroups?.length ?? 0) === 0
        ? `The ${monthYearLabel(comparisonMonth)} upload can't support this cut (${priorRes.note})`
        : `No single group appears in BOTH ${monthYearLabel(baseMonth)} and ${monthYearLabel(comparisonMonth)}`;
    return {
      ok: true,
      classification: "no_comparison",
      dimension,
      baseMonth,
      comparisonMonth,
      comparisonIsFallback,
      note: `${reason}, so a grounded year-over-year delta can't be stated. Cite the ${monthYearLabel(baseMonth)} figures by their fact ids; do NOT invent a prior-year number or a change.`,
      facts,
      deltas: [],
      availableMonths,
    };
  }

  const noteParts: string[] = [];
  noteParts.push(
    `Year-over-year ${dimensionLabel(dimension)} cut: ${comparisonMonth} → ${baseMonth}${
      comparisonIsFallback
        ? ` (nearest available prior period — exact ${yearAgo} wasn't uploaded; say the comparison window out loud)`
        : ""
    }.`,
  );
  for (const d of deltas) {
    const sampleLabel = d.isThinSample
      ? ` [small sample — ${d.priorSold} then ${d.baseSold} sales, directional only: show the member this number but say the sample is small out loud, and don't build a headline video on it]`
      : d.needsDisclosure
        ? ` [small sample — state the sale counts: ${d.priorSold} then ${d.baseSold}]`
        : "";
    noteParts.push(
      `${d.bucket} · ${d.metricLabel}: ${d.priorValueString} (${comparisonMonth}) → ${d.baseValueString} (${baseMonth}) = ${d.deltaPctString}${sampleLabel}.`,
    );
  }
  noteParts.push(
    "Both endpoints are real facts — cite each by its fact id. Never state a year-over-year number whose endpoints you didn't both cite. Thin-sample deltas are real data the member asked for: SHOW them with their small-sample label; never refuse a member their own market figures.",
  );

  return {
    ok: true,
    classification: "computed",
    dimension,
    baseMonth,
    comparisonMonth,
    comparisonIsFallback,
    note: noteParts.join(" "),
    facts,
    deltas,
    availableMonths,
  };
}
