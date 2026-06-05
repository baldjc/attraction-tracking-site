import { parse } from "csv-parse/sync";

// Shared, side-effect-free CSV tokenizing for the market-data import path.
//
// Both the preview parser (`parseCsvPreview` in market-csv.ts) and the
// full-row aggregation parser (`parseAllRows` in csv-aggregate.ts) route
// through here so they tokenize identically. We use csv-parse (RFC-4180
// quote-aware) — never a manual `split(",")` — so commas inside quoted fields
// ("Up to $250,000", "$1,549,900", "3,602.17", quoted addresses) stay inside
// their field instead of inflating the column count and tripping a field-count
// error that surfaced to members as "Couldn't read this file."
//
// Kept out of market-csv.ts (which has module-load side effects: it
// instantiates the Object Storage client and throws if the bucket env var is
// missing) so this stays importable from pure unit tests.

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"] as const;
export type CsvDelimiter = (typeof CANDIDATE_DELIMITERS)[number];

/** First line that has any non-whitespace content (the header row), with a
 *  leading BOM stripped. Splitting on line endings here is only used to sniff
 *  the delimiter from the header — field tokenizing itself is always done by
 *  the quote-aware parser below. */
function firstNonEmptyLine(text: string): string | null {
  const stripped = text.replace(/^\uFEFF/, "");
  for (const raw of stripped.split(/\r\n|\r|\n/)) {
    if (raw.trim().length > 0) return raw;
  }
  return null;
}

/**
 * Detect the field delimiter by counting candidate delimiters in the header
 * row, ignoring any that appear inside double-quoted segments (so a quoted
 * header like "Area, Zone" doesn't make us pick comma when the file is really
 * tab- or semicolon-delimited). Falls back to comma when nothing is found.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const header = firstNonEmptyLine(text);
  if (!header) return ",";

  const counts = new Map<CsvDelimiter, number>();
  let inQuotes = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i];
    if (ch === '"') {
      // Escaped quote ("") inside a quoted field — skip both characters.
      if (inQuotes && header[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    for (const d of CANDIDATE_DELIMITERS) {
      if (ch === d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }

  let best: CsvDelimiter = ",";
  let bestCount = 0;
  for (const d of CANDIDATE_DELIMITERS) {
    const c = counts.get(d) ?? 0;
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return bestCount > 0 ? best : ",";
}

/**
 * Tokenize CSV text into records. RFC-4180 quote-aware (commas inside quoted
 * fields are preserved), auto-detects the delimiter, accepts CRLF/LF/CR line
 * endings (csv-parse handles record delimiters natively), and is tolerant of
 * the messy realities of MLS exports:
 *   - `relax_column_count`: ragged rows don't throw — column-count validation,
 *     if any, happens AFTER tokenizing on the parsed records.
 *   - `relax_quotes`: a stray/unbalanced quote in a field doesn't throw a
 *     tokenizing error on an otherwise-readable file.
 *
 * Pass `{ columns: true }` to get header-keyed record objects; the default
 * returns positional string arrays (header row included as the first record).
 */
export function parseCsvRecords<T = string[]>(
  text: string,
  opts: { columns?: boolean } = {},
): T[] {
  return parse(text, {
    bom: true,
    delimiter: detectDelimiter(text),
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    columns: opts.columns ?? false,
  }) as T[];
}
