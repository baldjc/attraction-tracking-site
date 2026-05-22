import { parse } from "csv-parse/sync";
import Anthropic from "@anthropic-ai/sdk";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import {
  CANONICAL_FIELDS,
  OPTIONAL_FIELDS,
  FIELD_LABELS,
  type ColumnMapping,
} from "@/lib/market-config";

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
}

/**
 * Parse a CSV buffer: return headers, up to 20 sample rows (after header), and
 * total data-row count. Tolerates the common case of stray BOMs and
 * inconsistent column counts.
 */
export function parseCsvPreview(buf: Buffer): ParsedCsvPreview {
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const records = parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  if (records.length === 0) {
    return { headers: [], sampleRows: [], rowCount: 0 };
  }
  const [headers, ...rows] = records;
  return {
    headers: headers.map((h) => (h ?? "").toString()),
    sampleRows: rows.slice(0, 20),
    rowCount: rows.length,
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

const HAIKU_MODEL = "claude-haiku-4-5";

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
