import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCut,
  runComputeCut,
  yearBuiltDecadeLabel,
  type CutRow,
  type ComputeCutDeps,
} from "./computeCut";
import { emptyMarketConfig, type ColumnMapping } from "@/lib/market-config";

/**
 * Build injectable deps for runComputeCut around a fixed CSV + column mapping.
 * Captures any persisted facts and the logged classification so the honesty
 * gates can be asserted without a real DB / Object Storage.
 */
function stubDeps(csv: string, mapping: ColumnMapping) {
  const logged: string[] = [];
  const createdFacts: unknown[] = [];
  const config = { ...emptyMarketConfig(), columnMapping: mapping };
  const deps: ComputeCutDeps = {
    prisma: {
      marketDataUpload: {
        findFirst: async () => ({
          id: "upload-1",
          monthYear: "2026-05",
          csvStorageUrl: "market-data/u/upload-1.csv",
        }),
      },
      marketFact: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async (args: unknown) => {
          const data = (args as { data?: unknown[] }).data ?? [];
          createdFacts.push(...data);
          return { count: data.length };
        },
      },
      onDemandExtractionLog: {
        create: async (args: unknown) => {
          const classification = (
            args as { data?: { resultClassification?: string } }
          ).data?.resultClassification;
          if (classification) logged.push(classification);
          return {};
        },
      },
    },
    readCsv: async () => Buffer.from(csv, "utf8"),
    getMarketConfig: async () => config,
    loadSettings: async () => ({ sampleSizeVariant: "conservative" }),
  };
  return { deps, logged, createdFacts };
}

function soldRow(over: Partial<CutRow>): CutRow {
  return {
    status: "sold",
    neighbourhood: "All Neighbourhoods",
    style: "2 Storey",
    propertyClass: "Single Family",
    priceBracket: null,
    yearBuilt: 1995,
    salePrice: 600000,
    listPrice: 610000,
    daysOnMarket: 20,
    sqft: 2000,
    spLpRatio: null,
    ...over,
  };
}

test("yearBuiltDecadeLabel buckets correctly", () => {
  assert.equal(yearBuiltDecadeLabel(null), "Unknown");
  assert.equal(yearBuiltDecadeLabel(0), "Unknown");
  assert.equal(yearBuiltDecadeLabel(1959), "Pre-1960");
  assert.equal(yearBuiltDecadeLabel(1960), "1960s");
  assert.equal(yearBuiltDecadeLabel(1999), "1990s");
  assert.equal(yearBuiltDecadeLabel(2024), "2020s");
});

test("positive: Single Family × year-built-decade — correct aggregates, sub-floor flagged not headlined", () => {
  const rows: CutRow[] = [];

  // 1990s Single Family: 40 sold (>= 30 floor) → headline-safe.
  for (let i = 0; i < 40; i++) {
    rows.push(
      soldRow({
        yearBuilt: 1990 + (i % 10),
        salePrice: 500000 + i * 1000, // median over 40 values
        listPrice: 500000 + i * 1000, // SP/LP = 100%
        daysOnMarket: 10,
        sqft: 2000,
      }),
    );
  }
  // 1960s Single Family: 7 sold (< 30 floor) → texture only, never headline.
  for (let i = 0; i < 7; i++) {
    rows.push(
      soldRow({
        yearBuilt: 1965,
        salePrice: 300000,
        listPrice: 300000,
        daysOnMarket: 50,
        sqft: 1500,
      }),
    );
  }
  // Some non-SF rows that must be excluded by the propertyClass filter.
  for (let i = 0; i < 20; i++) {
    rows.push(
      soldRow({
        propertyClass: "Condo",
        yearBuilt: 1995,
        salePrice: 999999,
      }),
    );
  }
  // A few Active SF in the 1990s so MOI is computable & non-zero.
  for (let i = 0; i < 8; i++) {
    rows.push(soldRow({ status: "active", yearBuilt: 1992 }));
  }

  const result = computeCut(
    rows,
    {
      dimension: "yearBuiltDecade",
      filters: [{ field: "propertyClass", value: "Single Family" }],
    },
    { headlineSoldFloor: 30 },
  );

  assert.equal(result.classification, "computed");

  const nineties = result.groups.find((g) => g.bucket === "1990s");
  const sixties = result.groups.find((g) => g.bucket === "1960s");
  assert.ok(nineties, "expected a 1990s group");
  assert.ok(sixties, "expected a 1960s group");

  // Counts: condos excluded, actives counted as active not sold.
  assert.equal(nineties!.soldCount, 40);
  assert.equal(nineties!.activeCount, 8);
  assert.equal(sixties!.soldCount, 7);

  // Headline discipline.
  assert.equal(nineties!.headlineSafe, true);
  assert.equal(sixties!.headlineSafe, false);

  // Deterministic median sale price for the 1990s group: 40 evenly-spaced
  // values 500000..539000 → median = (519000 + 520000)/2 = 519500.
  const med = nineties!.metrics.find((m) => m.key === "median_sale_price");
  assert.ok(med);
  assert.equal(med!.value, 519500);
  assert.equal(med!.valueString, "$519,500");

  // SP/LP = 100% (sale == list everywhere in this group).
  const splp = nineties!.metrics.find((m) => m.key === "sale_to_list_ratio");
  assert.ok(splp);
  assert.equal(splp!.valueString, "100.0%");

  // MOI strict = active / sold = 8 / 40 = 0.2 months.
  const moi = nineties!.metrics.find((m) => m.key === "months_of_inventory");
  assert.ok(moi);
  assert.equal(moi!.valueString, "0.2 months");

  // DOM median = 10 days.
  const dom = nineties!.metrics.find((m) => m.key === "median_dom");
  assert.ok(dom);
  assert.equal(dom!.valueString, "10 days");

  // Sub-floor group carries metrics but must never be headline-safe.
  assert.ok(sixties!.metrics.length > 0);
  assert.equal(sixties!.headlineSafe, false);
});

test("honesty: townhouse filter → no_match listing available classes, no style proxy", () => {
  const rows: CutRow[] = [];
  for (let i = 0; i < 30; i++) {
    rows.push(soldRow({ propertyClass: "Single Family", style: "Bungalow" }));
  }
  for (let i = 0; i < 30; i++) {
    rows.push(soldRow({ propertyClass: "Condo", style: "Apartment Unit" }));
  }

  const result = computeCut(
    rows,
    {
      dimension: "yearBuiltDecade",
      filters: [{ field: "propertyClass", value: "townhouse" }],
    },
    { headlineSoldFloor: 30 },
  );

  assert.equal(result.classification, "no_match");
  assert.equal(result.groups.length, 0);
  // Available property classes are surfaced honestly...
  assert.deepEqual(result.availableValues.propertyClass, ["Condo", "Single Family"]);
  // ...and the style column is NOT used as a townhouse proxy.
  assert.ok(!result.availableValues.propertyClass.includes("townhouse"));
});

test("zero-sold group → metrics null, never headline", () => {
  const rows: CutRow[] = [];
  for (let i = 0; i < 50; i++) {
    rows.push(soldRow({ status: "active", propertyClass: "Single Family" }));
  }
  const result = computeCut(
    rows,
    {
      dimension: "yearBuiltDecade",
      filters: [{ field: "propertyClass", value: "Single Family" }],
    },
    { headlineSoldFloor: 30 },
  );
  assert.equal(result.classification, "computed");
  for (const g of result.groups) {
    assert.equal(g.soldCount, 0);
    assert.equal(g.headlineSafe, false);
    // No sold rows → no sale-derived metrics, and MOI requires sold > 0.
    assert.equal(g.metrics.length, 0);
  }
});

test("propertyClass vs style are distinct dimensions", () => {
  const rows: CutRow[] = [
    soldRow({ propertyClass: "Single Family", style: "Bungalow" }),
    soldRow({ propertyClass: "Single Family", style: "2 Storey" }),
    soldRow({ propertyClass: "Condo", style: "Apartment Unit" }),
  ];
  const byClass = computeCut(rows, { dimension: "propertyClass" }, { headlineSoldFloor: 30 });
  const byStyle = computeCut(rows, { dimension: "style" }, { headlineSoldFloor: 30 });
  assert.deepEqual(byClass.dimensionValues.sort(), ["Condo", "Single Family"]);
  assert.deepEqual(byStyle.dimensionValues.sort(), ["2 Storey", "Apartment Unit", "Bungalow"]);
});

// CSV whose headers do NOT include the column some mappings point at.
const HEADER_CSV =
  "Community,Status,Sale Price,List Price\n" +
  "Bridgeland,Sold,500000,510000\n" +
  "Bridgeland,Sold,520000,520000\n";

test("runComputeCut: dimension mapped to a header missing from the upload → unavailable", async () => {
  // neighbourhood is mapped to a header that isn't in HEADER_CSV.
  const { deps, logged, createdFacts } = stubDeps(HEADER_CSV, {
    neighbourhood: "Subdivision",
    status: "Status",
    salePrice: "Sale Price",
    listPrice: "List Price",
  });
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "unavailable");
  assert.equal(res.facts.length, 0);
  assert.equal(createdFacts.length, 0, "must not persist facts on unavailable");
  assert.deepEqual(logged, ["unavailable"]);
});

test("runComputeCut: filter column mapped to a missing header → unavailable", async () => {
  // The cut dimension (priceBracket via raw header — also absent) plus a style
  // filter mapped to a non-existent header must both be reported unavailable.
  const { deps, logged } = stubDeps(HEADER_CSV, {
    neighbourhood: "Community",
    status: "Status",
    salePrice: "Sale Price",
    listPrice: "List Price",
    propertyType: "Style",
  });
  const res = await runComputeCut(
    {
      userId: "u",
      params: {
        dimension: "neighbourhood",
        filters: [{ field: "style", value: "Bungalow" }],
      },
    },
    deps,
  );
  assert.equal(res.classification, "unavailable");
  assert.match(res.note, /style/i);
  assert.deepEqual(logged, ["unavailable"]);
});

test("runComputeCut: properly mapped headers resolve and compute (sanity)", async () => {
  // neighbourhood maps to the real "Community" header → the cut runs.
  const { deps } = stubDeps(HEADER_CSV, {
    neighbourhood: "Community",
    status: "Status",
    salePrice: "Sale Price",
    listPrice: "List Price",
  });
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  // Not an availability failure — the column resolved. (Two sold rows is below
  // the headline floor, so it lands on a computed/sample classification, never
  // "unavailable".)
  assert.notEqual(res.classification, "unavailable");
  assert.notEqual(res.classification, "no_upload");
});
