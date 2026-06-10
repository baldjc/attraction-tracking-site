// Structural + content preflight checks for market-data CSV uploads.
//
// This module is the "block / warn" half of the upload normalization layer (the
// "auto-clean" half lives in `parseNumber` in csv-aggregate.ts and the BOM strip
// in `parseCsvPreview`). It is intentionally a PURE module with no side-effect
// imports (unlike market-csv.ts, which throws at import time when the Object
// Storage bucket env is missing) so the unit tests can import it directly.
//
// runPreflight (market-csv.ts) calls these to catch the upload shapes that would
// otherwise silently produce garbage aggregates or burn Claude validator cost:
//   BLOCK  — AGGREGATE_REPORT (a pivot/summary, not row-level listings)
//          — HEADER_NOT_ROW1  (a title/banner row sits above the real header)
//          — MULTI_MONTH      (one file holds many months of sold listings)
//   WARN   — DATE_AMBIGUITY / THIN_SAMPLE / UNIT_SUSPECT (non-blocking signals)
//
// Every detector is deliberately conservative: a clean single-month row-level
// export (Pillar 9 / RAE, NTREIS, etc.) must pass untouched.

import type { ColumnMapping, AnyMappedField } from "@/lib/market-config";

/** Minimal shape of a parsed CSV preview — decoupled from market-csv.ts so this
 *  module has no runtime dependency on it (avoids the bucket-env import side
 *  effect and any import cycle). */
export interface PreviewLike {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  allRows?: string[][];
}

export type StructuralBlockCode =
  | "AGGREGATE_REPORT"
  | "HEADER_NOT_ROW1"
  | "MULTI_MONTH";

export interface StructuralBlock {
  code: StructuralBlockCode;
  message: string;
  detail: string;
  suggestion: string;
}

export interface PreflightWarning {
  code: "DATE_AMBIGUITY" | "THIN_SAMPLE" | "UNIT_SUSPECT";
  message: string;
  detail: string;
}

// Cell tokens that mark a pivot/summary report rather than per-listing rows.
const SUMMARY_TOKENS = new Set([
  "total",
  "totals",
  "grand total",
  "subtotal",
  "sub total",
  "subtotals",
  "average",
  "averages",
  "summary",
  "all areas",
  "all area",
  "all residential",
  "all neighbourhoods",
  "all neighborhoods",
  "all communities",
]);

const DATE_CANDIDATES = [
  "sold date",
  "sale date",
  "close date",
  "closed date",
  "settlement date",
];
const NEIGHBOURHOOD_CANDIDATES = [
  "community",
  "neighbourhood",
  "neighborhood",
  "area",
  "subdivision",
];
const SQFT_CANDIDATES = ["sqft", "sq ft", "square f", "sf", "living area", "size"];

function mappedHeader(
  mapping: ColumnMapping | null | undefined,
  key: AnyMappedField,
): string | undefined {
  const raw = mapping?.[key];
  if (typeof raw !== "string") return undefined;
  const norm = raw.toLowerCase().trim();
  return norm.length > 0 ? norm : undefined;
}

function resolveIndex(
  headersLower: string[],
  mapping: ColumnMapping | null | undefined,
  mappingKey: AnyMappedField,
  candidates: string[],
): number {
  const mapped = mapping ? mappedHeader(mapping, mappingKey) : undefined;
  if (mapped) {
    const idx = headersLower.indexOf(mapped);
    if (idx >= 0) return idx;
  }
  return headersLower.findIndex((h) => candidates.some((c) => h.includes(c)));
}

function isNumericLike(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  // Pure number / currency / percentage / simple date-ish — i.e. NOT a column
  // name. A header cell that is a bare number or date strongly suggests the
  // real header row is elsewhere.
  return /^[$\s]*-?[\d,]+(\.\d+)?\s*%?$/.test(s) || /^\d{1,4}[-/]\d{1,2}([-/]\d{1,4})?$/.test(s);
}

/** Parse a date cell loosely into a YYYY-MM bucket. Mirrors the lenient parsing
 *  the aggregator uses (`new Date` first, then a slashed/dashed fallback). */
function monthBucket(raw: string): string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const m = s.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (m) {
    // Heuristic: a 4-digit first group is a year (ISO-ish); otherwise the third
    // group is the year and the FIRST is the month (US MM/DD/YYYY default).
    if (m[1].length === 4) return `${m[1]}-${m[2].padStart(2, "0")}`;
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/**
 * Structural blocks — file shape is wrong (not a single-month row-level export).
 * Returns the first block found, or null when the structure looks fine.
 * Designed to run BEFORE the missing-column check so a banner/title row or a
 * pivot report gets a precise reason instead of a generic "missing columns".
 */
export function detectStructuralBlock(
  preview: PreviewLike,
  mapping?: ColumnMapping | null,
): StructuralBlock | null {
  const headers = preview.headers ?? [];
  const headersLower = headers.map((h) => h.toLowerCase().trim());
  const rows = preview.allRows ?? preview.sampleRows ?? [];

  // 1. HEADER_NOT_ROW1 — row 1 doesn't look like a header row. Two signals:
  //    (a) most header cells are blank (a title/banner row that only fills the
  //        first cell), or (b) most header cells are bare numbers/dates (the
  //        real header is a row or two below). A genuine header row is text.
  if (headers.length > 0) {
    const nonEmpty = headersLower.filter((h) => h.length > 0);
    const blankRatio = 1 - nonEmpty.length / headers.length;
    const numericHeaderRatio =
      nonEmpty.length > 0
        ? nonEmpty.filter((h) => isNumericLike(h)).length / nonEmpty.length
        : 0;
    // Only flag a sparse header when the data rows are clearly wider than the
    // header — a one-cell banner above a many-column table.
    const widestRow = rows.reduce((mx, r) => Math.max(mx, r.length), 0);
    const sparseBanner = nonEmpty.length <= 1 && widestRow >= 3;
    if (blankRatio > 0.5 || numericHeaderRatio > 0.4 || sparseBanner) {
      return {
        code: "HEADER_NOT_ROW1",
        message: "The first row doesn't look like column headers.",
        detail:
          "Row 1 should hold column names (Status, Sale Price, Community …), but it looks like a title/banner or data row. Many MLS reports put a title or date line above the real header.",
        suggestion:
          "Delete any title/blank rows above the header so the column-name row is row 1, then re-upload.",
      };
    }
  }

  // 2. AGGREGATE_REPORT — a pivot/summary export with Total / Average / Subtotal
  //    lines instead of one row per listing. We look at the neighbourhood/first
  //    column for standalone summary tokens; a real listing's area name is never
  //    literally "Total" or "Grand Total". Require ≥2 such rows so a single
  //    stray footer line doesn't block (the aggregator tolerates one).
  if (rows.length > 0) {
    const hoodIdx = resolveIndex(
      headersLower,
      mapping,
      "neighbourhood",
      NEIGHBOURHOOD_CANDIDATES,
    );
    const col = hoodIdx >= 0 ? hoodIdx : 0;
    let summaryRows = 0;
    for (const r of rows) {
      const cell = (r[col] ?? "").toString().trim().toLowerCase();
      if (cell && SUMMARY_TOKENS.has(cell)) summaryRows++;
    }
    if (summaryRows >= 2) {
      return {
        code: "AGGREGATE_REPORT",
        message: "This looks like a summary report, not listing-level data.",
        detail:
          "We found multiple Total / Average / Subtotal rows. Market analysis needs one row per listing (each sale, active, and pending), not a pre-aggregated pivot or board summary.",
        suggestion:
          "Export the raw listing-level results from your MLS (one row per property), not a stats/summary report.",
      };
    }
  }

  // 3. MULTI_MONTH — one file should be a single calendar month. Bucket the
  //    SOLD/CLOSE dates (active/pending rows have none) by YYYY-MM. Only block
  //    when the spread is genuinely multi-month: the dominant month is under 70%
  //    of dated rows AND at least two months each carry a real volume (≥50). A
  //    handful of end-of-month closing stragglers never trips this.
  const dateIdx = resolveIndex(headersLower, mapping, "date", DATE_CANDIDATES);
  if (dateIdx >= 0 && rows.length > 0) {
    const counts = new Map<string, number>();
    let dated = 0;
    for (const r of rows) {
      const b = monthBucket((r[dateIdx] ?? "").toString());
      if (b) {
        counts.set(b, (counts.get(b) ?? 0) + 1);
        dated++;
      }
    }
    if (dated >= 50 && counts.size >= 2) {
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const topShare = sorted[0][1] / dated;
      const volumeMonths = sorted.filter(([, c]) => c >= 50).length;
      if (topShare < 0.7 && volumeMonths >= 2) {
        const span = sorted
          .slice(0, 4)
          .map(([k, c]) => `${k} (${c})`)
          .join(", ");
        return {
          code: "MULTI_MONTH",
          message: "This file spans more than one month.",
          detail: `Sold/closed dates fall across several months: ${span}. Each upload should be a single calendar month so monthly trends line up.`,
          suggestion:
            "Split the export into one file per month (or filter to a single sold/closed month) and upload them separately.",
        };
      }
    }
  }

  return null;
}

/**
 * Non-blocking warnings. The upload still proceeds; these are surfaced/logged so
 * the member can spot a likely data-quality issue. Kept conservative so a normal
 * monthly export produces no noise.
 */
export function collectWarnings(
  preview: PreviewLike,
  mapping?: ColumnMapping | null,
): PreflightWarning[] {
  const warnings: PreflightWarning[] = [];
  const headersLower = (preview.headers ?? []).map((h) => h.toLowerCase().trim());
  const rows = preview.allRows ?? preview.sampleRows ?? [];

  // THIN_SAMPLE — too few rows to produce headline-grade metrics.
  if (preview.rowCount > 0 && preview.rowCount < 20) {
    warnings.push({
      code: "THIN_SAMPLE",
      message: "This month has very few listings.",
      detail: `Only ${preview.rowCount} data row${preview.rowCount === 1 ? "" : "s"} found — most neighbourhood metrics will be supporting-texture only, not headline numbers.`,
    });
  }

  // DATE_AMBIGUITY — slashed dates where day and month are both ≤12 so the order
  // (MM/DD vs DD/MM) can't be inferred from the values alone.
  const dateIdx = resolveIndex(headersLower, mapping, "date", DATE_CANDIDATES);
  if (dateIdx >= 0 && rows.length > 0) {
    let slashed = 0;
    let ambiguous = 0;
    for (const r of rows) {
      const v = (r[dateIdx] ?? "").toString().trim();
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);
      if (m) {
        slashed++;
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (a <= 12 && b <= 12) ambiguous++;
      }
    }
    if (slashed > 0 && ambiguous / slashed > 0.5) {
      warnings.push({
        code: "DATE_AMBIGUITY",
        message: "Date format is ambiguous (MM/DD vs DD/MM).",
        detail:
          "Many dates have both parts ≤ 12, so the month/day order can't be inferred. If months look wrong after upload, re-export dates in ISO format (YYYY-MM-DD).",
      });
    }
  }

  // UNIT_SUSPECT — square-footage values look like square metres (suspiciously
  // small), which would skew $/sq-ft. Only fires when there's a clear signal.
  const sqftIdx = resolveIndex(headersLower, mapping, "sqft", SQFT_CANDIDATES);
  if (sqftIdx >= 0 && rows.length > 0) {
    const vals: number[] = [];
    for (const r of rows) {
      const n = Number((r[sqftIdx] ?? "").toString().replace(/[$,\s]/g, ""));
      if (Number.isFinite(n) && n > 0) vals.push(n);
    }
    if (vals.length >= 20) {
      vals.sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      if (median < 100) {
        warnings.push({
          code: "UNIT_SUSPECT",
          message: "Floor-area values look unusually small.",
          detail: `Median size is ${median} — that looks like square metres, not square feet. $/sq-ft figures may be off if the column is in metric.`,
        });
      }
    }
  }

  return warnings;
}
