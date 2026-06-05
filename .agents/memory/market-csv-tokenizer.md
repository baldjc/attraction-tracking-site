---
name: Market-data CSV tokenizer
description: Where/why market-data CSV tokenizing is centralized, and why the helper is a separate pure module.
---

# Market-data CSV tokenizer

The market-data import path tokenizes CSV in ONE place: `src/lib/csv-parse-options.ts`
(`parseCsvRecords` + `detectDelimiter`). Both `parseCsvPreview` (market-csv.ts)
and `parseAllRows` (csv-aggregate.ts) route through it.

**Rule:** any new CSV reading in the market path must use `parseCsvRecords`, never a
manual `split(",")`. csv-parse is RFC-4180 quote-aware, so commas inside quoted
fields ("$1,549,900", "Up to $250,000", quoted addresses) stay in their field.
Options: `bom`, auto-detected `delimiter`, `relax_column_count`, `relax_quotes`,
`skip_empty_lines`, `trim`. Column-count checks (runPreflight) run AFTER tokenizing
on parsed records — never on a raw line split.

**Why the helper is its own module (not in market-csv.ts):** market-csv.ts
instantiates the Object Storage client at import and THROWS if
`DEFAULT_OBJECT_STORAGE_BUCKET_ID` is unset. Importing it from a pure unit test
fails at module load. The tokenizer was deliberately split out so tests can import
it without that side effect. Don't fold it back into market-csv.ts.

**Why delimiter detection is comma-biased:** `detectDelimiter` counts `, ; \t |` in
the header outside quotes and only switches off comma on a strictly-greater count,
so existing comma files are unaffected; semicolon/tab/pipe exports now work too.

**Gotcha that wasn't real:** the reported "naive comma-splitting" bug did NOT exist
in the server path — both parse points already used csv-parse with
`relax_column_count`. The genuine gaps were hardcoded comma delimiter, no
`relax_quotes` (stray quotes threw tokenizing errors), and no regression test. The
client `approximateRowCount` newline scan is advisory-only (soft large-file
warning) and intentionally left as a raw byte count.
