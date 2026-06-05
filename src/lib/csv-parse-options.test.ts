/**
 * Unit tests for the shared market-data CSV tokenizer (`csv-parse-options`).
 *
 * Run: `npx tsx --test src/lib/csv-parse-options.test.ts`
 *
 * The non-negotiable invariant: commas INSIDE quoted fields never inflate the
 * column count. A naive `split(",")` would turn a 9-column row into 14+ columns
 * (or throw a field-count error), which is the bug that surfaced to members as
 * "Couldn't read this file." These tests pin the RFC-4180 behavior plus
 * delimiter auto-detection and CRLF handling.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { detectDelimiter, parseCsvRecords } from "./csv-parse-options";

// A realistic MLS export row whose fields contain commas inside quotes:
//   - price bracket "Up to $250,000"
//   - dollar amounts "$1,549,900" / "$1,575,000"
//   - a quoted decimal "3,602.17"
//   - quoted neighbourhood "Bridgeland, NE" and address "123 Main St, Unit 4"
const HEADER =
  'Status,Property Type,Sale Price,List Price,DOM,Community,Sold Date,Address,Price Bracket';
const ROW_1 =
  'Sold,Detached,"$1,549,900","$1,575,000",12,"Bridgeland, NE","2026-04-03","123 Main St, Unit 4","Up to $250,000"';
const ROW_2 =
  'Active,Condo,"$3,602.17","$3,700.00",5,Beltline,2026-04-10,"456 Oak Ave","$250,000 - $500,000"';

test("quoted commas do not inflate the column count (CRLF endings)", () => {
  const csv = [HEADER, ROW_1, ROW_2].join("\r\n");
  const records = parseCsvRecords<string[]>(csv);

  assert.equal(records.length, 3, "header + 2 data rows");
  // Every row must tokenize to exactly 9 columns — a naive split(",") would
  // produce 14 on ROW_1 (5 of the commas live inside quotes).
  for (const row of records) {
    assert.equal(row.length, 9, `expected 9 columns, got ${row.length}`);
  }

  // Values with quoted commas survive intact (no field splitting).
  assert.equal(records[1][2], "$1,549,900");
  assert.equal(records[1][5], "Bridgeland, NE");
  assert.equal(records[1][7], "123 Main St, Unit 4");
  assert.equal(records[1][8], "Up to $250,000");
  assert.equal(records[2][2], "$3,602.17");
});

test("columns:true keys rows by header and preserves quoted-comma values", () => {
  const csv = [HEADER, ROW_1].join("\n");
  const rows = parseCsvRecords<Record<string, string>>(csv, { columns: true });

  assert.equal(rows.length, 1);
  assert.equal(Object.keys(rows[0]).length, 9);
  assert.equal(rows[0]["Sale Price"], "$1,549,900");
  assert.equal(rows[0]["Price Bracket"], "Up to $250,000");
  assert.equal(rows[0]["Address"], "123 Main St, Unit 4");
});

test("detectDelimiter ignores commas inside quoted headers", () => {
  // Tab-delimited file whose header has a quoted comma — must pick tab, not comma.
  const tabHeader = '"Area, Zone"\tStatus\tSale Price';
  assert.equal(detectDelimiter(tabHeader), "\t");

  // Semicolon-delimited.
  assert.equal(detectDelimiter("Status;Sale Price;DOM"), ";");

  // Pipe-delimited.
  assert.equal(detectDelimiter("Status|Sale Price|DOM"), "|");

  // Plain comma header.
  assert.equal(detectDelimiter(HEADER), ",");

  // Single-column / no delimiter → comma fallback.
  assert.equal(detectDelimiter("Status"), ",");
});

test("auto-detected delimiter parses a semicolon file with quoted commas", () => {
  const csv = [
    'Status;Sale Price;Community',
    'Sold;"$1,549,900";"Bridgeland, NE"',
  ].join("\r\n");
  const records = parseCsvRecords<string[]>(csv);

  assert.equal(records.length, 2);
  assert.equal(records[1].length, 3, "semicolon-delimited row keeps 3 columns");
  assert.equal(records[1][1], "$1,549,900");
  assert.equal(records[1][2], "Bridgeland, NE");
});

test("ragged rows and a stray quote do not throw a tokenizing error", () => {
  const csv = [
    HEADER,
    // Missing trailing columns (ragged) — relax_column_count must tolerate it.
    'Sold,Detached,"$1,549,900"',
    // Stray unbalanced quote in an otherwise-readable field.
    'Active,Condo,$700,000 (approx 12" deep lot),"$3,700.00",5,Beltline,2026-04-10,addr,bracket',
  ].join("\n");

  assert.doesNotThrow(() => {
    const records = parseCsvRecords<string[]>(csv);
    assert.ok(records.length >= 2);
  });
});
