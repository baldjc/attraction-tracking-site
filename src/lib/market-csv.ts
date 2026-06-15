import Anthropic from "@anthropic-ai/sdk";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import {
  CANONICAL_FIELDS,
  OPTIONAL_FIELDS,
  FIELD_LABELS,
  type ColumnMapping,
  type AnyMappedField,
} from "@/lib/market-config";
import { parseCsvRecords } from "@/lib/csv-parse-options";
import { HAIKU_MODEL } from "@/lib/ai-models";
import {
  detectStructuralBlock,
  collectWarnings,
  type PreflightWarning,
} from "@/lib/market-preflight-checks";

// ─── Persistent CSV storage (Replit Object Storage) ──────────────────────────
// Previously CSVs were written to /tmp/uploads which is ephemeral — container
// restarts wipe the directory, losing every uploaded source file. Object
// Storage persists across restarts and redeploys. The bucket is provisioned
// automatically by the Replit App Storage blueprint (env var
// DEFAULT_OBJECT_STORAGE_BUCKET_ID).
//
// Key format: market-data/<userId>/<uploadId>.csv
// We persist this key in MarketDataUpload.csvStorageUrl. The reader
// (`readUploadFile`) looks up the row and fetches by key.

// The Replit sidecar's auto-discovered default bucket is sometimes empty even
// when DEFAULT_OBJECT_STORAGE_BUCKET_ID is set in the environment. Pass the
// bucket ID through explicitly so we fail loudly at boot if it's missing
// instead of silently at first upload.
const OBJECT_STORAGE_BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
if (!OBJECT_STORAGE_BUCKET_ID) {
  throw new Error(
    "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set — Object Storage bucket must be provisioned (run the App Storage blueprint).",
  );
}
console.log("[object-storage] bucket id loaded:", OBJECT_STORAGE_BUCKET_ID);
const objectStorage = new ObjectStorageClient({ bucketId: OBJECT_STORAGE_BUCKET_ID });

/** Storage key for a member's uploaded CSV. */
export function uploadStorageKey(userId: string, uploadId: string): string {
  return `market-data/${userId}/${uploadId}.csv`;
}

/**
 * Write a CSV buffer to Object Storage. Returns the storage key, which the
 * caller persists in `MarketDataUpload.csvStorageUrl`.
 */
function describeStorageError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    try { return JSON.stringify(e); } catch { /* fallthrough */ }
  }
  return String(err);
}

export async function writeUploadFile(
  userId: string,
  uploadId: string,
  buf: Buffer,
): Promise<string> {
  const key = uploadStorageKey(userId, uploadId);
  const result = await objectStorage.uploadFromBytes(key, buf);
  if (!result.ok) {
    throw new Error(
      `Object Storage upload failed for ${key}: ${describeStorageError(result.error)}`,
    );
  }
  return key;
}

/**
 * Read a CSV buffer back from Object Storage by the previously-saved key (the
 * value stored in `MarketDataUpload.csvStorageUrl`). Throws a clear error if
 * the object is missing — that signals the row needs re-upload.
 */
export async function readUploadFile(storageKey: string): Promise<Buffer> {
  const result = await objectStorage.downloadAsBytes(storageKey);
  if (!result.ok) {
    throw new Error(
      `CSV not found in Object Storage at ${storageKey}: ${describeStorageError(result.error)}`,
    );
  }
  // SDK returns [Buffer] — a single-element tuple — for downloadAsBytes.
  return result.value[0];
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Attempt to detect month-year from a CSV filename. Recognises:
 *   2026-04-anything.csv     → "2026-04"
 *   april-2026.csv           → "2026-04"
 *   apr_2026.csv             → "2026-04"
 *   2026_04.csv              → "2026-04"
 * Returns null if nothing is confident.
 */
export function detectMonthYearFromFilename(name: string): string | null {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();

  const iso = base.match(/(20\d{2})[-_./]?(0[1-9]|1[0-2])/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  // Month-first long year: 04-2026, 04_2026, 04.2026, 04/2026
  const mmYyyy = base.match(/(?<![0-9])(0[1-9]|1[0-2])[-_./](20\d{2})(?![0-9])/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1]}`;

  // Month-first short year: 04-26, 04_26, 04.26, 04/26 — assume 20YY
  const mmYy = base.match(/(?<![0-9])(0[1-9]|1[0-2])[-_./](\d{2})(?![0-9])/);
  if (mmYy) return `20${mmYy[2]}-${mmYy[1]}`;

  const wordMatch = base.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-_]?(20\d{2})/,
  );
  if (wordMatch) {
    const m = MONTH_NAMES[wordMatch[1]];
    if (m) return `${wordMatch[2]}-${String(m).padStart(2, "0")}`;
  }

  const wordMatchRev = base.match(
    /(20\d{2})[\s\-_]?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*/,
  );
  if (wordMatchRev) {
    const m = MONTH_NAMES[wordMatchRev[2]];
    if (m) return `${wordMatchRev[1]}-${String(m).padStart(2, "0")}`;
  }

  return null;
}

export interface ParsedCsvPreview {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  // Every parsed data row, used only for deterministic full-column statistics
  // in runPreflight (e.g. the status-actionability gate). Kept separate from
  // `sampleRows` (which feeds the AI preview prompt) so a file sorted with all
  // non-actionable rows first can't be falsely blocked from a 20-row sample.
  // Never serialized to the client.
  allRows?: string[][];
}

/**
 * Parse a CSV buffer: return headers, up to 20 sample rows (after header), and
 * total data-row count. Tolerates the common case of stray BOMs and
 * inconsistent column counts.
 */
export function parseCsvPreview(buf: Buffer): ParsedCsvPreview {
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const records = parseCsvRecords<string[]>(text);

  if (records.length === 0) {
    return { headers: [], sampleRows: [], rowCount: 0 };
  }
  const [headers, ...rows] = records;
  return {
    headers: headers.map((h) => (h ?? "").toString()),
    sampleRows: rows.slice(0, 20),
    rowCount: rows.length,
    allRows: rows,
  };
}

/**
 * Deterministic preflight check on a parsed CSV. Catches the three failure
 * modes that otherwise burn $1–2.50 of Claude validator time:
 *   - MISSING_COLUMNS: header row doesn't contain the required fields
 *   - STATUS_VALUES_UNRECOGNIZED: status column is all codes (S/C/A) etc.
 *   - EMPTY_FILE: no data rows at all
 * Column matching is intentionally flexible (lowercased `includes`) so we
 * don't false-positive on regional MLS naming.
 */
export interface PreflightOk {
  ok: true;
  rowCount: number;
  headersCount: number;
  statusRecognizedRatio: number | null;
  /** Non-blocking data-quality signals (thin sample, ambiguous dates, suspect
   *  units). The upload still proceeds — these are surfaced/logged only. */
  warnings?: PreflightWarning[];
}
export interface PreflightFail {
  ok: false;
  code:
    | "MISSING_COLUMNS"
    | "STATUS_VALUES_UNRECOGNIZED"
    | "STATUS_ONLY_NON_ACTIONABLE"
    | "NEIGHBOURHOOD_MOSTLY_NUMERIC"
    | "AGGREGATE_REPORT"
    | "HEADER_NOT_ROW1"
    | "MULTI_MONTH"
    | "EMPTY_FILE";
  message: string;
  detail: string;
  suggestion?: string;
  /**
   * When true the member can knowingly proceed past this warning (e.g. their MLS
   * genuinely has no neighbourhood-name column, only numeric area codes). The
   * upload re-submits with an acknowledgement flag that suppresses the check.
   * Hard data failures (missing columns, empty file) leave this false/undefined.
   */
  confirmable?: boolean;
  rowCount: number;
  headersCount: number;
  statusRecognizedRatio: number | null;
}
export type PreflightResult = PreflightOk | PreflightFail;

const REQUIRED_COLUMN_CANDIDATES: Record<string, string[]> = {
  status: ["status"],
  propertyType: ["property type", "prop type", "type", "style"],
  salePrice: ["sold price", "sale price", "sold $", "closed price", "close price"],
  listPrice: ["list price", "original list price", "asking price"],
  dom: ["dom", "days on market", "days"],
  neighbourhood: ["community", "neighbourhood", "neighborhood", "area", "subdivision"],
  saleDate: ["sold date", "sale date", "close date", "closed date"],
};
const REQUIRED_LABELS: Record<string, string> = {
  status: "Status",
  propertyType: "Property Type",
  salePrice: "Sale Price",
  listPrice: "List Price",
  dom: "Days on Market",
  neighbourhood: "Neighbourhood",
  saleDate: "Sale Date",
};
// Maps each preflight field key to its ColumnMapping canonical field so a
// member's saved mapping can satisfy the required-column check even when the
// raw CSV header is a regional/short name (e.g. NTREIS "St" for status).
const PREFLIGHT_FIELD_TO_MAPPING: Record<string, AnyMappedField> = {
  status: "status",
  propertyType: "propertyType",
  salePrice: "salePrice",
  listPrice: "listPrice",
  dom: "daysOnMarket",
  neighbourhood: "neighbourhood",
  saleDate: "date",
};

// Recognized status words (substring match). Includes both actionable
// (Sold/Active/Pending/Closed…) and non-actionable (Cancelled/Withdrawn/
// Expired/Terminated…) lifecycle states so the recognition gate doesn't
// false-negative on a file that legitimately contains those states.
const ACTIONABLE_STATUS_WORDS = [
  "sold",
  "closed",
  "active",
  "pending",
  "contingent",
  "leased",
  "rented",
  "under contract",
];
const NON_ACTIONABLE_STATUS_WORDS = [
  "cancelled",
  "canceled",
  "withdrawn",
  "expired",
  "terminated",
  "off market",
  "off-market",
  "offmarket",
  "hold",
  "coming soon",
];
const KNOWN_STATUS_WORDS = [
  ...ACTIONABLE_STATUS_WORDS,
  ...NON_ACTIONABLE_STATUS_WORDS,
];

// Single-letter MLS status codes (EXACT match — a substring match would treat
// any value containing the letter as a status). NTREIS-style:
//   A=Active, P=Pending, S=Sold, C=Closed, L=Leased  → actionable
//   W=Withdrawn, E=Expired, T=Terminated, X=Cancelled/Off-market → non-actionable
const ACTIONABLE_STATUS_CODES = ["s", "a", "p", "c", "l"];
const NON_ACTIONABLE_STATUS_CODES = ["w", "e", "t", "x"];
const KNOWN_STATUS_CODES = [
  ...ACTIONABLE_STATUS_CODES,
  ...NON_ACTIONABLE_STATUS_CODES,
];

function isRecognizedStatus(v: string): boolean {
  return (
    KNOWN_STATUS_WORDS.some((k) => v.includes(k)) ||
    KNOWN_STATUS_CODES.includes(v)
  );
}
function isActionableStatus(v: string): boolean {
  return (
    ACTIONABLE_STATUS_WORDS.some((k) => v.includes(k)) ||
    ACTIONABLE_STATUS_CODES.includes(v)
  );
}

export function runPreflight(
  preview: ParsedCsvPreview,
  columnMapping?: ColumnMapping | null,
  opts?: { allowNumericNeighbourhood?: boolean },
): PreflightResult {
  const headersLower = preview.headers.map((h) => h.toLowerCase().trim());
  const headersCount = preview.headers.length;

  // 0. Structural blocks — the file shape itself is wrong (a banner/title row
  // above the header, a pre-aggregated summary report, or several months in one
  // file). Run FIRST so these give a precise reason instead of a generic
  // "missing columns". Each detector is conservative: a clean single-month
  // row-level export passes untouched.
  const structural = detectStructuralBlock(preview, columnMapping);
  if (structural) {
    return {
      ok: false,
      code: structural.code,
      message: structural.message,
      detail: structural.detail,
      suggestion: structural.suggestion,
      rowCount: preview.rowCount,
      headersCount,
      statusRecognizedRatio: null,
    };
  }

  const mappedHeaderFor = (field: string): string | undefined => {
    const key = PREFLIGHT_FIELD_TO_MAPPING[field];
    const raw = key ? columnMapping?.[key] : undefined;
    // Defensive: legacy/bad DB JSON may hold non-string values; ignore them
    // rather than throwing on .toLowerCase().
    if (typeof raw !== "string") return undefined;
    const norm = raw.toLowerCase().trim();
    return norm.length > 0 ? norm : undefined;
  };

  // 1. Required columns. A field is satisfied when the member's saved mapping
  // points at a header present in THIS file; otherwise we fall back to flexible
  // keyword matching so unmapped uploads still work.
  const missing: string[] = [];
  let statusMappedButAbsent = false;
  for (const [field, candidates] of Object.entries(REQUIRED_COLUMN_CANDIDATES)) {
    const mapped = mappedHeaderFor(field);
    if (mapped) {
      if (headersLower.includes(mapped)) continue; // satisfied by explicit mapping
      if (field === "status") statusMappedButAbsent = true;
    }
    const hit = candidates.some((c) => headersLower.some((h) => h.includes(c)));
    if (!hit) missing.push(field);
  }
  if (missing.length > 0) {
    const statusMissingUnmapped =
      missing.includes("status") && !mappedHeaderFor("status");
    const suggestion =
      headersCount === 0
        ? "Make sure row 1 of your CSV is a header row (column names), not data."
        : statusMissingUnmapped
          ? "We couldn't find a listing-status column. If your MLS uses a short or coded column name (e.g. \"St\"), set up your column mapping so we know which column holds the status."
          : statusMappedButAbsent
            ? "Your saved column mapping points at a status column that isn't in this file. Re-check the mapping or re-export with the mapped columns included."
            : "Re-export from your MLS with the missing columns included, or contact support if your export uses different names.";
    return {
      ok: false,
      code: "MISSING_COLUMNS",
      message: `Missing required columns: ${missing
        .map((m) => REQUIRED_LABELS[m])
        .join(", ")}.`,
      detail:
        headersCount === 0
          ? "We couldn't read any header row from this file."
          : `Columns we did find: ${preview.headers.join(", ")}.`,
      suggestion,
      rowCount: preview.rowCount,
      headersCount,
      statusRecognizedRatio: null,
    };
  }

  // 2. Empty file (no data rows after headers)
  if (preview.rowCount === 0) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: "No data rows found.",
      detail: "This file has a header row but no listing rows beneath it.",
      suggestion:
        "Re-export the month from your MLS and check that filters didn't exclude every row.",
      rowCount: 0,
      headersCount,
      statusRecognizedRatio: null,
    };
  }

  // 3. Status values look recognizable. Locate the status column via the saved
  // mapping first (handles short/coded NTREIS-style headers), then keyword.
  const mappedStatusHeader = mappedHeaderFor("status");
  let statusIdx = mappedStatusHeader
    ? headersLower.indexOf(mappedStatusHeader)
    : -1;
  if (statusIdx < 0) {
    statusIdx = headersLower.findIndex((h) =>
      REQUIRED_COLUMN_CANDIDATES.status.some((c) => h.includes(c)),
    );
  }
  // Scan the FULL status column (not just the 20-row AI sample) so a file
  // sorted with all non-actionable rows first can't be falsely classified.
  const statusRows = preview.allRows ?? preview.sampleRows;
  let statusRecognizedRatio: number | null = null;
  if (statusIdx >= 0 && statusRows.length > 0) {
    const values = statusRows
      .map((r) => (r[statusIdx] ?? "").toString().toLowerCase().trim())
      .filter((v) => v.length > 0);
    if (values.length > 0) {
      const recognized = values.filter(isRecognizedStatus);
      statusRecognizedRatio = recognized.length / values.length;
      if (statusRecognizedRatio < 0.5) {
        const sample = Array.from(new Set(values)).slice(0, 5);
        return {
          ok: false,
          code: "STATUS_VALUES_UNRECOGNIZED",
          message: "Status column values aren't recognized.",
          detail: `Found values like: ${sample.join(", ")}. Expected words like Sold, Closed, Active, Pending (or codes like S/A/P).`,
          suggestion:
            "Check that the mapped Status column holds listing states. If your MLS uses codes, make sure you mapped the right column.",
          rowCount: preview.rowCount,
          headersCount,
          statusRecognizedRatio,
        };
      }

      // Recognized, but is there anything actionable? A file that is 100%
      // Cancelled/Withdrawn/Expired/Terminated/Off-market has no Sold/Active/
      // Pending listings and can't produce inventory, pricing, or absorption
      // metrics — fail it deterministically instead of burning validator cost.
      const actionableValues = recognized.filter(isActionableStatus);
      if (recognized.length > 0 && actionableValues.length === 0) {
        const sample = Array.from(new Set(values)).slice(0, 5);
        return {
          ok: false,
          code: "STATUS_ONLY_NON_ACTIONABLE",
          message: "This file has no active, pending, or sold listings.",
          detail: `Every listing has a non-actionable status (e.g. ${sample.join(
            ", ",
          )}). Market analysis needs Sold, Active, or Pending listings to compute inventory, pricing, and absorption.`,
          suggestion:
            "Re-export the month including Sold/Closed, Active, and Pending listings — not just Cancelled/Withdrawn/Expired records.",
          rowCount: preview.rowCount,
          headersCount,
          statusRecognizedRatio,
        };
      }
    }
  }

  // 4. Neighbourhood column should hold area NAMES, not numeric MLS zone/area
  // codes — Jarvis needs names (e.g. "Crystallina Nera") to write neighbourhood
  // content. Some boards genuinely only export numeric area codes (no name
  // column exists), so this is a CONFIRMABLE warning the member can knowingly
  // proceed past, not a hard block. Suppressed when the caller passes the
  // acknowledgement flag (member chose to upload anyway).
  if (!opts?.allowNumericNeighbourhood) {
    const mappedHoodHeader = mappedHeaderFor("neighbourhood");
    let hoodIdx = mappedHoodHeader ? headersLower.indexOf(mappedHoodHeader) : -1;
    if (hoodIdx < 0) {
      hoodIdx = headersLower.findIndex((h) =>
        REQUIRED_COLUMN_CANDIDATES.neighbourhood.some((c) => h.includes(c)),
      );
    }
    const hoodRows = preview.allRows ?? preview.sampleRows;
    if (hoodIdx >= 0 && hoodRows.length > 0) {
      const values = hoodRows
        .map((r) => (r[hoodIdx] ?? "").toString().trim())
        .filter((v) => v.length > 0);
      if (values.length > 0) {
        // "Numeric" = no alphabetic characters at all (plain numbers or
        // punctuation-only codes like "12" or "3.1"). Names like "Windermere"
        // or "St. Albert" contain letters and don't count.
        const numericLike = values.filter((v) => !/[a-zA-Z]/.test(v));
        const numericRatio = numericLike.length / values.length;
        if (numericRatio > 0.6) {
          const sample = Array.from(new Set(values)).slice(0, 5);
          return {
            ok: false,
            code: "NEIGHBOURHOOD_MOSTLY_NUMERIC",
            message: "Your Neighbourhood column looks like numbers or codes.",
            detail: `Found values like: ${sample.join(", ")}. Jarvis needs the area names (e.g. Crystallina Nera) to write neighbourhood content.`,
            suggestion:
              "Re-export with neighbourhood names, or remap the column to the one that holds area names. If your MLS only provides numeric area codes, you can upload anyway.",
            confirmable: true,
            rowCount: preview.rowCount,
            headersCount,
            statusRecognizedRatio,
          };
        }
      }
    }
  }

  // Non-blocking data-quality signals — the upload proceeds; the caller logs /
  // surfaces these. Computed last so they ride along with an otherwise-clean
  // result without ever gating it.
  const warnings = collectWarnings(preview, columnMapping);

  return {
    ok: true,
    rowCount: preview.rowCount,
    headersCount,
    statusRecognizedRatio,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ColumnMappingSuggestion {
  mapping: ColumnMapping;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  raw: string;
}


// Haiku pricing (Oct 2025): $1 / 1M input, $5 / 1M output
const HAIKU_INPUT_COST_PER_TOKEN = 0.000001;
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000005;

/**
 * Single short Haiku call. Asks the model to propose canonical-field → CSV
 * column mappings given headers + sample rows. Forces structured JSON.
 */
export async function suggestColumnMapping(
  preview: ParsedCsvPreview,
): Promise<ColumnMappingSuggestion> {
  const fields = [...CANONICAL_FIELDS, ...OPTIONAL_FIELDS];
  const fieldList = fields
    .map((f) => `  - "${f}" — ${FIELD_LABELS[f]}`)
    .join("\n");

  const system = `You map MLS export CSV columns to a fixed set of canonical fields for a real-estate analytics pipeline.

Canonical fields:
${fieldList}

Rules:
- Respond with a single JSON object. No prose, no markdown fences.
- Keys are canonical field names from the list above.
- Values are the EXACT header string from the provided CSV that best matches.
- Omit any field you can't confidently match. Do not invent column names.
- Required fields (must map if a plausible column exists): date, neighbourhood, salePrice, listPrice, daysOnMarket, sqft, propertyType.`;

  const userMsg = `CSV headers:\n${JSON.stringify(preview.headers)}\n\nFirst ${preview.sampleRows.length} sample rows (parallel to headers):\n${JSON.stringify(preview.sampleRows.slice(0, 10))}\n\nReturn JSON only.`;

  const resp = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const text =
    resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim() || "{}";

  // Strip accidental markdown fences if Haiku adds them anyway.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }

  const mapping: ColumnMapping = {};
  for (const f of fields) {
    const v = parsed[f];
    if (typeof v === "string" && preview.headers.includes(v)) {
      mapping[f] = v;
    }
  }

  const inputTokens = resp.usage.input_tokens ?? 0;
  const outputTokens = resp.usage.output_tokens ?? 0;
  const costUsd =
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;

  return { mapping, costUsd, inputTokens, outputTokens, raw: text };
}
