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
 * Headline discipline mirrors the validator: a group needs >= the headline sold
 * floor (>= 30) to be cited as a headline number; thinner groups are flagged
 * `supporting_texture_only` (usable as texture, never headlined); zero-sold
 * groups carry null metrics and can never be headlined.
 *
 * The math (which rows count, how each metric is derived) mirrors
 * `tallyRow` / `metricsFromAccumulator` in csv-aggregate.ts EXACTLY, so a
 * computed cut lines up with the rest of the platform's numbers.
 */
import { randomUUID } from "node:crypto";
import prismaDefault from "@/lib/prisma";
import { readUploadFile as realReadUploadFile } from "@/lib/market-csv";
import { parseCsvRecords } from "@/lib/csv-parse-options";
import { normalizePropertyType } from "@/lib/csv-aggregate";
import {
  resolveStatusMapping,
  bucketStatus,
  type StatusBucket,
} from "@/lib/market-status-buckets";
import { sampleFloorFor } from "@/lib/member-metric-settings";
import { loadMemberMetricSettings as realLoadSettings } from "@/lib/member-metric-settings-server";
import { getMarketConfigForUser as realGetMarketConfig } from "@/lib/market-config-server";
import type { ColumnMapping, MarketConfigShape } from "@/lib/market-config";
import { MetricFamily } from "@/generated/prisma/enums";
import type { LedgerFact } from "@/lib/jarvis/types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type CutDimension =
  | "neighbourhood"
  | "style"
  | "propertyClass"
  | "yearBuiltDecade"
  | "priceBracket";

export type CutFilterField =
  | "neighbourhood"
  | "style"
  | "propertyClass"
  | "priceBracket";

export interface CutFilter {
  field: CutFilterField;
  value: string;
}

export interface ComputeCutParams {
  dimension: CutDimension;
  filters?: CutFilter[];
}

/**
 * One CSV row reduced to the fields any cut needs. Built by the DB wrapper; the
 * pure core only ever sees these (so it is trivially unit-testable).
 */
export interface CutRow {
  status: StatusBucket;
  neighbourhood: string | null;
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
  /** soldCount >= headlineSoldFloor. */
  headlineSafe: boolean;
  metrics: CutGroupMetric[];
}

export type CutClassification = "computed" | "no_match" | "empty";

export interface ComputeCutCoreResult {
  classification: CutClassification;
  dimension: CutDimension;
  appliedFilters: CutFilter[];
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
  "style",
  "propertyClass",
  "priceBracket",
];

function dimensionValueOf(row: CutRow, dim: CutDimension): string | null {
  switch (dim) {
    case "neighbourhood":
      return emptyToNull(row.neighbourhood);
    case "style":
      return emptyToNull(row.style);
    case "propertyClass":
      return emptyToNull(row.propertyClass);
    case "priceBracket":
      return emptyToNull(row.priceBracket);
    case "yearBuiltDecade":
      return yearBuiltDecadeLabel(row.yearBuilt);
  }
}

function filterValueOf(row: CutRow, field: CutFilterField): string | null {
  switch (field) {
    case "neighbourhood":
      return emptyToNull(row.neighbourhood);
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
  opts: { headlineSoldFloor: number },
): ComputeCutCoreResult {
  const headlineSoldFloor = opts.headlineSoldFloor;
  const appliedFilters = params.filters ?? [];

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
      groups: [],
      headlineSoldFloor,
      dimensionValues: [],
      availableValues,
      scopedRowCount: 0,
    };
  }

  // Apply filters (case-insensitive exact match per field).
  const scoped = rows.filter((row) =>
    appliedFilters.every((f) => {
      const v = filterValueOf(row, f.field);
      return v != null && v.toLowerCase() === f.value.trim().toLowerCase();
    }),
  );

  if (scoped.length === 0) {
    // Column(s) present, but the requested filter value(s) aren't in the data.
    // Honest refusal path — caller surfaces availableValues; NEVER a proxy.
    return {
      classification: "no_match",
      dimension: params.dimension,
      appliedFilters,
      groups: [],
      headlineSoldFloor,
      dimensionValues: [],
      availableValues,
      scopedRowCount: 0,
    };
  }

  const accs = new Map<string, GroupAcc>();
  for (const row of scoped) {
    const bucket = dimensionValueOf(row, params.dimension) ?? "Unknown";
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
      return {
        bucket: acc.bucket,
        soldCount: acc.sold,
        activeCount: acc.active,
        pendingCount: acc.pending,
        offMarketCount: acc.offMarket,
        totalCount: total,
        headlineSafe: acc.sold >= headlineSoldFloor,
        metrics: metricsFor(acc),
      };
    })
    .sort((a, b) => b.soldCount - a.soldCount || a.bucket.localeCompare(b.bucket));

  return {
    classification: "computed",
    dimension: params.dimension,
    appliedFilters,
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

const HEADLINE_SOLD_FLOOR = 30;
export const COMPUTE_CUT_TOOL_TYPE = "compute_cut";

/** Raw-column header candidates (normalized) for the two unmapped dimensions. */
const PROPERTY_CLASS_HEADER_CANDIDATES = ["propertytype", "propertyclass"];
const PRICE_BRACKET_HEADER_CANDIDATES = [
  "pricebracket",
  "pricerange",
  "priceband",
];

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
}

export interface ComputeCutDeps {
  prisma: {
    marketDataUpload: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        monthYear: string;
        csvStorageUrl: string | null;
      } | null>;
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

function dimensionLabel(dim: CutDimension): string {
  switch (dim) {
    case "neighbourhood":
      return "neighbourhood";
    case "style":
      return "style";
    case "propertyClass":
      return "property class";
    case "yearBuiltDecade":
      return "year-built decade";
    case "priceBracket":
      return "price bracket";
  }
}

function filterFieldLabel(field: CutFilterField): string {
  switch (field) {
    case "neighbourhood":
      return "neighbourhood";
    case "style":
      return "style";
    case "propertyClass":
      return "property class";
    case "priceBracket":
      return "price bracket";
  }
}

/** Human scope suffix for labels, e.g. " — Single Family · built 1990s". */
function scopeSuffix(
  filters: CutFilter[],
  dimension: CutDimension,
  bucket: string,
): string {
  const parts: string[] = [];
  for (const f of filters) parts.push(f.value);
  if (dimension === "yearBuiltDecade") {
    parts.push(bucket === "Unknown" ? "year built unknown" : `built ${bucket}`);
  } else {
    parts.push(bucket);
  }
  return parts.join(" · ");
}

/** Deterministic scope signature used in metricName + for idempotent deletes. */
function scopeSignature(
  filters: CutFilter[],
  dimension: CutDimension,
  bucket: string,
): string {
  const fsig = filters
    .map((f) => `${f.field}=${f.value.trim().toLowerCase()}`)
    .sort()
    .join("&");
  return `${dimension}=${bucket}${fsig ? `;${fsig}` : ""}`;
}

/** dimension/filter column availability against the resolved CSV headers. */
interface ResolvedColumns {
  neighbourhood: boolean;
  style: boolean;
  yearBuilt: boolean;
  propertyClassHeader: string | null;
  priceBracketHeader: string | null;
}

function dimensionAvailable(dim: CutDimension, cols: ResolvedColumns): boolean {
  switch (dim) {
    case "neighbourhood":
      return cols.neighbourhood;
    case "style":
      return cols.style;
    case "yearBuiltDecade":
      return cols.yearBuilt;
    case "propertyClass":
      return cols.propertyClassHeader != null;
    case "priceBracket":
      return cols.priceBracketHeader != null;
  }
}

function filterAvailable(field: CutFilterField, cols: ResolvedColumns): boolean {
  switch (field) {
    case "neighbourhood":
      return cols.neighbourhood;
    case "style":
      return cols.style;
    case "propertyClass":
      return cols.propertyClassHeader != null;
    case "priceBracket":
      return cols.priceBracketHeader != null;
  }
}

function availableDimensionsFrom(cols: ResolvedColumns): CutDimension[] {
  const all: CutDimension[] = [
    "neighbourhood",
    "style",
    "propertyClass",
    "yearBuiltDecade",
    "priceBracket",
  ];
  return all.filter((d) => dimensionAvailable(d, cols));
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

  const upload = await deps.prisma.marketDataUpload.findFirst({
    where: { userId, status: "validated" },
    orderBy: [{ monthYear: "desc" }, { validatedAt: "desc" }],
    select: { id: true, monthYear: true, csvStorageUrl: true },
  });
  if (!upload || !upload.csvStorageUrl) {
    return {
      ok: false,
      classification: "no_upload",
      monthYear: null,
      dimension,
      note: "No validated market-data upload is available for this member, so no cut can be computed.",
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

  const propertyClassHeader = resolveRawHeader(
    headerLookup,
    PROPERTY_CLASS_HEADER_CANDIDATES,
  );
  const priceBracketHeader = resolveRawHeader(
    headerLookup,
    PRICE_BRACKET_HEADER_CANDIDATES,
  );
  const cols: ResolvedColumns = {
    neighbourhood: mappedHeaderResolves(mapping.neighbourhood, headerLookup),
    style: mappedHeaderResolves(mapping.propertyType, headerLookup),
    yearBuilt: mappedHeaderResolves(mapping.yearBuilt, headerLookup),
    propertyClassHeader,
    priceBracketHeader,
  };

  // Honesty gate 1 — the requested COLUMN is genuinely not in this upload.
  const missing: string[] = [];
  if (!dimensionAvailable(dimension, cols)) missing.push(dimensionLabel(dimension));
  for (const f of filters) {
    if (!filterAvailable(f.field, cols)) missing.push(filterFieldLabel(f.field));
  }
  if (missing.length > 0) {
    const avail = availableDimensionsFrom(cols);
    await logCall(deps, userId, upload.id, params, "unavailable", null);
    return {
      ok: false,
      classification: "unavailable",
      monthYear: upload.monthYear,
      dimension,
      note: `That column isn't in this member's upload (${[...new Set(missing)].join(", ")}). Cuts available from this upload: ${avail.map(dimensionLabel).join(", ")}.`,
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
      spLpRatio: parseRatio(
        readMappedCell(raw, headerLookup, mapping.saleToListRatio),
      ),
    };
  });

  const headlineSoldFloor = Math.max(
    HEADLINE_SOLD_FLOOR,
    sampleFloorFor((await deps.loadSettings(userId)).sampleSizeVariant).sold,
  );

  const core = computeCut(cutRows, params, { headlineSoldFloor });

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
    const sig = scopeSignature(filters, dimension, group.bucket);
    const suffix = scopeSuffix(filters, dimension, group.bucket);
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
    const usageClass = group.headlineSafe
      ? "headline_safe"
      : "supporting_texture_only";
    const caveat = group.headlineSafe
      ? undefined
      : `Computed from ${group.soldCount} sold — below the ${headlineSoldFloor}-sale headline floor. Use as supporting texture, not a headline number.`;

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

  // All groups had zero usable metrics (e.g. zero sold across the scope).
  if (pending.length === 0) {
    await logCall(deps, userId, upload.id, params, "sample_too_small", null);
    return {
      ok: true,
      classification: "sample_too_small",
      monthYear,
      dimension,
      note: `The ${dimensionLabel(dimension)} cut produced groups but none had any closed sales to summarize, so there is nothing citable.`,
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
    .filter((g) => g.headlineSafe && g.metrics.length > 0)
    .map((g) => g.bucket);
  const textureBuckets = core.groups
    .filter((g) => !g.headlineSafe && g.metrics.length > 0)
    .map((g) => `${g.bucket} (n=${g.soldCount})`);
  const anyHeadline = headlineBuckets.length > 0;

  const noteParts: string[] = [];
  noteParts.push(
    `Computed ${dimensionLabel(dimension)} cut${filters.length ? ` for ${filters.map((f) => f.value).join(" · ")}` : ""} from ${monthYear} data.`,
  );
  if (headlineBuckets.length) {
    noteParts.push(`Headline-safe (≥${headlineSoldFloor} sold): ${headlineBuckets.join(", ")}.`);
  }
  if (textureBuckets.length) {
    noteParts.push(
      `Below the ${headlineSoldFloor}-sale floor — texture only, do not headline: ${textureBuckets.join(", ")}.`,
    );
  }
  noteParts.push("Cite these numbers only by their fact ids.");

  const classification: RunCutClassification = anyHeadline
    ? "computed"
    : "sample_too_small";
  await logCall(
    deps,
    userId,
    upload.id,
    params,
    anyHeadline ? "computed" : "sample_too_small",
    pending[0]?.id ?? null,
  );

  return {
    ok: true,
    classification,
    monthYear,
    dimension,
    note: noteParts.join(" "),
    facts: pending.map((p) => p.ledger),
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
