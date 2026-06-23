/**
 * Unit tests for the buildBuckets "mapped-but-missing price column" loud guard.
 *
 * Run: `npx tsx --test src/lib/csv-aggregate.guard.test.ts`
 *
 * The guard fires inside buildBuckets (the shared normalization path) BEFORE
 * any DB access, so these cases short-circuit aggregateUpload without touching
 * Prisma. Regression cover for the NTREIS "Sale Price" (absent) vs "Close
 * Price" (real) mapping mismatch that silently produced a price-less fact set.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { aggregateUpload } from "./csv-aggregate";
import { emptyMarketConfig } from "./market-config";
import type { ColumnMapping } from "./market-config";

function makeConfig(columnMapping: ColumnMapping) {
  return {
    ...emptyMarketConfig(),
    marketName: "Test Market",
    mlsSource: "NTREIS",
    columnMapping,
  };
}

// CSV exposes "Close Price" + "Original List Price" but NOT "Sale Price".
const CSV = Buffer.from(
  [
    "Close Price,Original List Price,Status,Close Date",
    "475000,485000,Sold,2026-05-10",
    "510000,515000,Sold,2026-05-12",
  ].join("\n"),
  "utf8",
);

function run(columnMapping: ColumnMapping) {
  return aggregateUpload({
    uploadId: "test-upload",
    userId: "test-user",
    monthYear: "2026-05",
    csvFileName: "test.csv",
    csvBuffer: CSV,
    config: makeConfig(columnMapping),
  });
}

// A CSV with NO price-like columns, so an absent mapped price header has no
// high-confidence substitute for resolveEffectiveMapping to recover — the loud
// guard must still fire rather than silently persisting a price-less fact set.
const NO_PRICE_CSV = Buffer.from(
  [
    "Community,Status,Close Date",
    "Bridgeland,Sold,2026-05-10",
    "Bridgeland,Sold,2026-05-12",
  ].join("\n"),
  "utf8",
);

function runNoPrice(columnMapping: ColumnMapping) {
  return aggregateUpload({
    uploadId: "test-upload",
    userId: "test-user",
    monthYear: "2026-05",
    csvFileName: "test.csv",
    csvBuffer: NO_PRICE_CSV,
    config: makeConfig(columnMapping),
  });
}

test("throws when mapped salePrice header is absent and no substitute exists", async () => {
  await assert.rejects(
    runNoPrice({ salePrice: "Sale Price", date: "Close Date", status: "Status" }),
    (err: Error) => {
      assert.match(err.message, /not present in the uploaded CSV/);
      assert.match(err.message, /salePrice → "Sale Price"/);
      // The available headers are surfaced so the fix is obvious.
      assert.match(err.message, /Community/);
      return true;
    },
  );
});

test("auto-recovers when absent mapped salePrice has a high-confidence substitute (NTREIS Sale Price → Close Price)", async () => {
  // The CSV exposes "Close Price" — a high-confidence sold-price column — so
  // resolveEffectiveMapping substitutes it per-file for the absent "Sale Price"
  // mapping (older/varied-header uploads) instead of dead-ending the upload.
  const table = await run({
    salePrice: "Sale Price",
    listPrice: "Original List Price",
    date: "Close Date",
    status: "Status",
  });
  const city = table.groups.find(
    (g) =>
      g.neighbourhood === "All Neighbourhoods" &&
      g.propertyType == null &&
      g.priceTier == null,
  );
  assert.ok(city, "citywide rollup present");
  assert.equal(city?.medianPrice, 492500);
});

test("auto-recovers when absent mapped listPrice has a high-confidence substitute", async () => {
  // listPrice maps to a non-existent header, but "Original List Price" is a
  // high-confidence list-price column → substituted per-file, no hard failure.
  const table = await run({
    salePrice: "Close Price",
    listPrice: "No Such List Col",
    date: "Close Date",
    status: "Status",
  });
  assert.ok(table.groups.length > 0, "aggregation still produces groups");
});

test("missing mapped saleToListRatio warns but does not throw", async () => {
  // saleToListRatio is a convenience column; when its mapped header is absent
  // the guard must NOT hard-fail (SP/LP still derives from sale/list prices).
  const table = await run({
    salePrice: "Close Price",
    listPrice: "Original List Price",
    saleToListRatio: "No Such Ratio Col",
    date: "Close Date",
    status: "Status",
  });
  assert.ok(table.groups.length > 0, "aggregation still produces groups");
});

test("resolves price headers case/whitespace-insensitively (no false throw)", async () => {
  // "close price" (lowercased) must resolve to "Close Price" — the guard must
  // NOT trip. Aggregation proceeds past the guard and returns a table.
  const table = await run({
    salePrice: "close price",
    listPrice: "original list price",
    date: "Close Date",
    status: "Status",
  });
  const city = table.groups.find(
    (g) =>
      g.neighbourhood === "All Neighbourhoods" &&
      g.propertyType == null &&
      g.priceTier == null,
  );
  assert.ok(city, "citywide rollup present");
  assert.equal(city?.medianPrice, 492500);
});
