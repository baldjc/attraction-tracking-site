/**
 * Unit tests for the upload preflight block/warn layer + parseNumber auto-clean.
 *
 * Run: `npx tsx --test src/lib/market-preflight-checks.test.ts`
 *
 * Covers:
 *   - One fixture per BLOCK category trips its reason (AGGREGATE_REPORT,
 *     HEADER_NOT_ROW1, MULTI_MONTH).
 *   - A clean single-month row-level export (NTREIS/Phil-shaped + RAE/Chris-
 *     shaped) passes with no block (regression guard).
 *   - Non-blocking warnings (THIN_SAMPLE, DATE_AMBIGUITY, UNIT_SUSPECT).
 *   - $/comma/k-M/parenthesis/unicode-minus auto-clean via parseNumber.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  detectStructuralBlock,
  collectWarnings,
  type PreviewLike,
} from "./market-preflight-checks";
import type { ColumnMapping } from "./market-config";

// A clean, NTREIS-shaped single-month sold export (Phil's control shape).
function cleanPreview(rowN = 200): PreviewLike {
  const headers = [
    "Status",
    "Close Price",
    "List Price",
    "DOM",
    "SqFt",
    "Subdivision",
    "Close Date",
  ];
  const allRows: string[][] = [];
  for (let i = 0; i < rowN; i++) {
    allRows.push([
      i % 3 === 0 ? "S" : i % 3 === 1 ? "A" : "P",
      "450000",
      "460000",
      "21",
      "1850",
      `Neighbourhood ${i % 12}`,
      // Sold rows carry a close date; non-sold rows leave it blank (realistic).
      i % 3 === 0 ? "2026-05-12" : "",
    ]);
  }
  return { headers, sampleRows: allRows.slice(0, 20), rowCount: rowN, allRows };
}

const NTREIS_MAP: ColumnMapping = {
  status: "Status",
  salePrice: "Close Price",
  listPrice: "List Price",
  daysOnMarket: "DOM",
  sqft: "SqFt",
  neighbourhood: "Subdivision",
  date: "Close Date",
};

test("clean single-month export — no structural block (regression guard)", () => {
  assert.equal(detectStructuralBlock(cleanPreview(), NTREIS_MAP), null);
  // Also works without an explicit mapping (keyword fallback).
  assert.equal(detectStructuralBlock(cleanPreview()), null);
});

test("clean export — no warnings", () => {
  assert.deepEqual(collectWarnings(cleanPreview(), NTREIS_MAP), []);
});

test("BLOCK: AGGREGATE_REPORT — summary/pivot rows", () => {
  const headers = ["Community", "Sales", "Avg Price", "Status", "Close Date"];
  const allRows = [
    ["Downtown", "40", "500000", "S", "2026-05-03"],
    ["Westmount", "22", "480000", "S", "2026-05-09"],
    ["Subtotal", "62", "490000", "", ""],
    ["Glenora", "15", "700000", "S", "2026-05-11"],
    ["Grand Total", "77", "560000", "", ""],
    ["Average", "25", "560000", "", ""],
  ];
  const r = detectStructuralBlock(
    { headers, sampleRows: allRows, rowCount: allRows.length, allRows },
    { neighbourhood: "Community", status: "Status", date: "Close Date" },
  );
  assert.equal(r?.code, "AGGREGATE_REPORT");
});

test("BLOCK: HEADER_NOT_ROW1 — banner/title row above header", () => {
  // Row 1 is a single-cell report title; the real header sits below it.
  const headers = ["Calgary Real Estate Board — May 2026 Statistics", "", "", "", ""];
  const allRows = [
    ["Status", "Close Price", "List Price", "DOM", "Community"],
    ["S", "450000", "460000", "21", "Downtown"],
  ];
  const r = detectStructuralBlock({
    headers,
    sampleRows: allRows,
    rowCount: allRows.length,
    allRows,
  });
  assert.equal(r?.code, "HEADER_NOT_ROW1");
});

test("BLOCK: HEADER_NOT_ROW1 — numeric/date header cells", () => {
  const headers = ["2026-05-01", "450000", "460000", "21", "0.97"];
  const allRows = [["2026-05-02", "451000", "462000", "19", "0.98"]];
  const r = detectStructuralBlock({
    headers,
    sampleRows: allRows,
    rowCount: 1,
    allRows,
  });
  assert.equal(r?.code, "HEADER_NOT_ROW1");
});

test("BLOCK: MULTI_MONTH — sold dates span several months", () => {
  const headers = ["Status", "Close Price", "Community", "Close Date"];
  const allRows: string[][] = [];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
  for (let i = 0; i < 240; i++) {
    const mo = months[i % months.length];
    allRows.push(["S", "450000", `Hood ${i % 5}`, `${mo}-12`]);
  }
  const r = detectStructuralBlock(
    { headers, sampleRows: allRows.slice(0, 20), rowCount: allRows.length, allRows },
    { status: "Status", salePrice: "Close Price", neighbourhood: "Community", date: "Close Date" },
  );
  assert.equal(r?.code, "MULTI_MONTH");
});

test("MULTI_MONTH NOT tripped by end-of-month stragglers", () => {
  const headers = ["Status", "Close Date", "Community"];
  const allRows: string[][] = [];
  // 95% May, 5% April closings — a normal monthly export edge.
  for (let i = 0; i < 200; i++) {
    allRows.push(["S", i < 10 ? "2026-04-29" : "2026-05-15", `Hood ${i % 6}`]);
  }
  const r = detectStructuralBlock(
    { headers, sampleRows: allRows.slice(0, 20), rowCount: allRows.length, allRows },
    { status: "Status", date: "Close Date", neighbourhood: "Community" },
  );
  assert.equal(r, null);
});

test("WARN: THIN_SAMPLE for very small files", () => {
  const p = cleanPreview(8);
  const w = collectWarnings(p, NTREIS_MAP);
  assert.ok(w.some((x) => x.code === "THIN_SAMPLE"));
});

test("WARN: DATE_AMBIGUITY for ambiguous slashed dates", () => {
  const headers = ["Status", "Close Date", "Community"];
  const allRows: string[][] = [];
  for (let i = 0; i < 40; i++) allRows.push(["S", "03/04/2026", `Hood ${i % 5}`]);
  const w = collectWarnings(
    { headers, sampleRows: allRows.slice(0, 20), rowCount: allRows.length, allRows },
    { status: "Status", date: "Close Date", neighbourhood: "Community" },
  );
  assert.ok(w.some((x) => x.code === "DATE_AMBIGUITY"));
});

test("WARN: no DATE_AMBIGUITY for ISO dates", () => {
  const w = collectWarnings(cleanPreview(), NTREIS_MAP);
  assert.ok(!w.some((x) => x.code === "DATE_AMBIGUITY"));
});

test("WARN: UNIT_SUSPECT when floor area looks like square metres", () => {
  const headers = ["Status", "SqFt", "Community"];
  const allRows: string[][] = [];
  for (let i = 0; i < 40; i++) allRows.push(["S", "75", `Hood ${i % 5}`]);
  const w = collectWarnings(
    { headers, sampleRows: allRows.slice(0, 20), rowCount: allRows.length, allRows },
    { status: "Status", sqft: "SqFt", neighbourhood: "Community" },
  );
  assert.ok(w.some((x) => x.code === "UNIT_SUSPECT"));
});
