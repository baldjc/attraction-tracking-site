import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCut,
  runComputeCut,
  runYoYCut,
  yearBuiltDecadeLabel,
  type CutRow,
  type ComputeCutDeps,
} from "./computeCut";
import { emptyMarketConfig, type ColumnMapping } from "@/lib/market-config";
import { HEADLINE_SOLD_FLOOR } from "@/lib/member-metric-settings";

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
    city: null,
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

// ── City / multi-city neighbourhood scoping ──────────────────────────────────

test("city: multi-city neighbourhood cut keeps same-named neighbourhoods separate by city", () => {
  const rows: CutRow[] = [];
  // "Downtown" in two different cities at different price levels. With >=2
  // distinct cities in scope, neighbourhood buckets disambiguate by city so the
  // two Downtowns never merge into one (wrong) blended median.
  for (let i = 0; i < 40; i++)
    rows.push(soldRow({ neighbourhood: "Downtown", city: "Plano", salePrice: 500000, listPrice: 500000 }));
  for (let i = 0; i < 40; i++)
    rows.push(soldRow({ neighbourhood: "Downtown", city: "Frisco", salePrice: 800000, listPrice: 800000 }));

  const result = computeCut(rows, { dimension: "neighbourhood" }, { headlineSoldFloor: 30 });

  assert.deepEqual(
    result.groups.map((g) => g.bucket).sort(),
    ["Downtown (Frisco)", "Downtown (Plano)"],
  );
  const plano = result.groups.find((g) => g.bucket === "Downtown (Plano)")!;
  const frisco = result.groups.find((g) => g.bucket === "Downtown (Frisco)")!;
  const medOf = (g: typeof plano) => g.metrics.find((m) => m.key === "median_sale_price")!.value;
  assert.equal(medOf(plano), 500000);
  assert.equal(medOf(frisco), 800000);
  assert.equal(plano.soldCount, 40);
  assert.equal(frisco.soldCount, 40);
});

test("city: dimension=city returns per-city rollups", () => {
  const rows: CutRow[] = [];
  for (let i = 0; i < 40; i++)
    rows.push(soldRow({ neighbourhood: "A", city: "Plano", salePrice: 500000, listPrice: 500000 }));
  for (let i = 0; i < 40; i++)
    rows.push(soldRow({ neighbourhood: "B", city: "Frisco", salePrice: 800000, listPrice: 800000 }));

  const result = computeCut(rows, { dimension: "city" }, { headlineSoldFloor: 30 });

  assert.deepEqual(result.groups.map((g) => g.bucket).sort(), ["Frisco", "Plano"]);
  const plano = result.groups.find((g) => g.bucket === "Plano")!;
  assert.equal(plano.metrics.find((m) => m.key === "median_sale_price")!.value, 500000);
});

test("city: filterCity scopes a neighbourhood cut to one city (plain labels, no merge)", () => {
  const rows: CutRow[] = [];
  for (let i = 0; i < 40; i++)
    rows.push(soldRow({ neighbourhood: "Downtown", city: "Plano", salePrice: 500000, listPrice: 500000 }));
  for (let i = 0; i < 40; i++)
    rows.push(soldRow({ neighbourhood: "Downtown", city: "Frisco", salePrice: 800000, listPrice: 800000 }));

  const result = computeCut(
    rows,
    { dimension: "neighbourhood", filters: [{ field: "city", value: "Plano" }] },
    { headlineSoldFloor: 30 },
  );

  // Only one city is in scope after the filter → plain label, only Plano rows.
  assert.deepEqual(result.groups.map((g) => g.bucket), ["Downtown"]);
  assert.equal(result.groups[0].soldCount, 40);
  assert.equal(result.groups[0].metrics.find((m) => m.key === "median_sale_price")!.value, 500000);
});

test("city: case/whitespace variants of ONE city stay single-city (no composite labels)", () => {
  // "Plano", "PLANO" and " plano " are the same municipality typed three ways.
  // They must NOT trip multi-city mode, so neighbourhood buckets stay plain.
  const rows: CutRow[] = [];
  for (const variant of ["Plano", "PLANO", " plano "]) {
    for (let i = 0; i < 14; i++)
      rows.push(soldRow({ neighbourhood: "Downtown", city: variant, salePrice: 500000, listPrice: 500000 }));
  }
  const result = computeCut(rows, { dimension: "neighbourhood" }, { headlineSoldFloor: 30 });
  assert.deepEqual(result.groups.map((g) => g.bucket), ["Downtown"]);
  assert.equal(result.groups[0].soldCount, 42);
});

test("city: single-city dataset is byte-for-byte identical to a no-city dataset", () => {
  const build = (city: string | null): CutRow[] => {
    const rows: CutRow[] = [];
    for (let i = 0; i < 40; i++)
      rows.push(soldRow({ neighbourhood: "Downtown", city, salePrice: 500000 + i * 1000, listPrice: 500000 + i * 1000 }));
    for (let i = 0; i < 35; i++)
      rows.push(soldRow({ neighbourhood: "Uptown", city, salePrice: 700000 + i * 1000, listPrice: 700000 + i * 1000 }));
    return rows;
  };
  const withCity = computeCut(build("Plano"), { dimension: "neighbourhood" }, { headlineSoldFloor: 30 });
  const noCity = computeCut(build(null), { dimension: "neighbourhood" }, { headlineSoldFloor: 30 });

  // With a single distinct city, the city dimension plays no role: plain
  // neighbourhood buckets and identical aggregates to the no-city baseline.
  assert.deepEqual(withCity.groups.map((g) => g.bucket).sort(), ["Downtown", "Uptown"]);
  assert.deepEqual(
    withCity.groups.map((g) => ({ bucket: g.bucket, sold: g.soldCount, metrics: g.metrics })),
    noCity.groups.map((g) => ({ bucket: g.bucket, sold: g.soldCount, metrics: g.metrics })),
  );
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

// ── Sample-size honesty bands ────────────────────────────────────────────────

/** A neighbourhood CSV with exactly `n` sold rows (Community-mapped). */
function soldNbhdCsv(neighbourhood: string, n: number): string {
  let csv = "Community,Status,Sale Price,List Price\n";
  for (let i = 0; i < n; i++) {
    csv += `${neighbourhood},Sold,${500000 + i * 1000},${510000 + i * 1000}\n`;
  }
  return csv;
}

const NBHD_MAPPING: ColumnMapping = {
  neighbourhood: "Community",
  status: "Status",
  salePrice: "Sale Price",
  listPrice: "List Price",
};

test("HEADLINE_SOLD_FLOOR is the single tunable source of truth (15)", () => {
  assert.equal(HEADLINE_SOLD_FLOOR, 15);
});

test("computeCut: classifies sold count into headline / disclose / thin bands", () => {
  const mk = (hood: string, n: number): CutRow[] =>
    Array.from({ length: n }, () => soldRow({ neighbourhood: hood }));
  const rows = [...mk("A", 24), ...mk("B", 12), ...mk("C", 4)];

  const result = computeCut(
    rows,
    { dimension: "neighbourhood" },
    { headlineSoldFloor: 15, discloseFloor: 5 },
  );

  const a = result.groups.find((g) => g.bucket === "A")!;
  const b = result.groups.find((g) => g.bucket === "B")!;
  const c = result.groups.find((g) => g.bucket === "C")!;

  // 24 sales → headline band, headline-safe.
  assert.equal(a.band, "headline");
  assert.equal(a.headlineSafe, true);
  // 12 sales → disclose band: usable but NOT headlineSafe (needs disclosure).
  assert.equal(b.band, "disclose");
  assert.equal(b.headlineSafe, false);
  // 4 sales → thin band, never headline.
  assert.equal(c.band, "thin");
  assert.equal(c.headlineSafe, false);
});

test("computeCut: 15 sold is the headline boundary (inclusive)", () => {
  const rows = Array.from({ length: 15 }, () =>
    soldRow({ neighbourhood: "Edge" }),
  );
  const result = computeCut(
    rows,
    { dimension: "neighbourhood" },
    { headlineSoldFloor: 15, discloseFloor: 5 },
  );
  const edge = result.groups.find((g) => g.bucket === "Edge")!;
  assert.equal(edge.band, "headline");
  assert.equal(edge.headlineSafe, true);
});

test("computeCut: discloseFloor defaults to MIN_SOLD_SAMPLE (5) when omitted", () => {
  const rows = Array.from({ length: 5 }, () =>
    soldRow({ neighbourhood: "Five" }),
  );
  const result = computeCut(
    rows,
    { dimension: "neighbourhood" },
    { headlineSoldFloor: 15 },
  );
  const five = result.groups.find((g) => g.bucket === "Five")!;
  // 5 >= default hard floor 5 → disclose (usable), not thin.
  assert.equal(five.band, "disclose");
});

test("runComputeCut: 24-sale neighbourhood headlines WITH 'based on 24 sales' disclosure", async () => {
  const { deps, logged, createdFacts } = stubDeps(
    soldNbhdCsv("Bowness", 24),
    NBHD_MAPPING,
  );
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "computed");
  assert.ok(createdFacts.length > 0, "expected persisted facts");
  for (const f of createdFacts as Array<{
    usageClass: string;
    viewerCaveat: string | null;
  }>) {
    assert.equal(f.usageClass, "headline_safe");
    assert.match(f.viewerCaveat ?? "", /based on 24 sales in may 2026/i);
  }
  assert.deepEqual(logged, ["computed"]);
});

test("runComputeCut: 12-sale neighbourhood stays usable WITH mandatory small-sample disclosure", async () => {
  const { deps, createdFacts } = stubDeps(
    soldNbhdCsv("Bowness", 12),
    NBHD_MAPPING,
  );
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  // Disclose band is still computed/usable, not benched.
  assert.equal(res.classification, "computed");
  assert.ok(createdFacts.length > 0, "expected persisted facts");
  for (const f of createdFacts as Array<{
    usageClass: string;
    viewerCaveat: string | null;
  }>) {
    assert.equal(f.usageClass, "headline_safe");
    assert.match(f.viewerCaveat ?? "", /based on 12 sales/i);
    assert.match(f.viewerCaveat ?? "", /state the sample size/i);
  }
});

test("runComputeCut: 4-sale neighbourhood held back honestly as texture-only", async () => {
  const { deps, logged, createdFacts } = stubDeps(
    soldNbhdCsv("Bowness", 4),
    NBHD_MAPPING,
  );
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  // Below the hard floor → no usable headline → sample_too_small, but the fact
  // is still emitted honestly (texture-only), never fabricated away.
  assert.equal(res.classification, "sample_too_small");
  assert.ok(createdFacts.length > 0, "thin facts are still persisted as texture");
  for (const f of createdFacts as Array<{
    usageClass: string;
    viewerCaveat: string | null;
  }>) {
    assert.equal(f.usageClass, "supporting_texture_only");
    assert.match(f.viewerCaveat ?? "", /only 4 sales/i);
    assert.match(f.viewerCaveat ?? "", /too thin to headline/i);
  }
  assert.deepEqual(logged, ["sample_too_small"]);
});

test("computed-cut disclosure carries NO property-type words (scriptBuilder caveat parser safety)", async () => {
  const { deps, createdFacts } = stubDeps(
    soldNbhdCsv("Bowness", 12),
    NBHD_MAPPING,
  );
  await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  const propertyWords =
    /\b(detached|semi|townhouse|townhome|condo|apartment|duplex|bungalow|single[- ]family)\b/i;
  for (const f of createdFacts as Array<{ viewerCaveat: string | null }>) {
    assert.ok(
      !propertyWords.test(f.viewerCaveat ?? ""),
      `caveat must not contain property-type words: ${f.viewerCaveat}`,
    );
  }
});

// ── Period-aware selection + year-over-year (runYoYCut) ─────────────────────

/**
 * CSV of `n` sold rows of one property type, with a deterministic ascending
 * sale price so medians are predictable. Header always carries "Property Type"
 * so the propertyClass dimension (raw-header based) resolves.
 */
function soldTypeRows(propertyType: string, base: number, n: number): string {
  let csv = "";
  for (let i = 0; i < n; i++) {
    csv += `${propertyType},All,Sold,${base + i * 1000},${base + i * 1000}\n`;
  }
  return csv;
}

function typeCsv(blocks: string): string {
  return "Property Type,Community,Status,Sale Price,List Price\n" + blocks;
}

const TYPE_MAPPING: ColumnMapping = {
  neighbourhood: "Community",
  status: "Status",
  salePrice: "Sale Price",
  listPrice: "List Price",
};

/**
 * Injectable deps over a {monthYear → CSV} map. findFirst honours an explicit
 * where.monthYear (else returns the latest), findMany lists validated months,
 * and readCsv resolves each upload's CSV — enough to exercise period-aware
 * selection and the two-period YoY engine without a real DB.
 */
function stubMultiMonth(months: Record<string, string>, mapping: ColumnMapping) {
  const logged: string[] = [];
  const createdFacts: unknown[] = [];
  const config = { ...emptyMarketConfig(), columnMapping: mapping };
  const monthList = Object.keys(months).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
  const byUrl = new Map<string, string>();
  for (const m of monthList) byUrl.set(`market-data/u/${m}.csv`, months[m]);
  const deps: ComputeCutDeps = {
    prisma: {
      marketDataUpload: {
        findFirst: async (args: unknown) => {
          const where =
            (args as { where?: { monthYear?: string } }).where ?? {};
          const want = where.monthYear;
          const m = want ? (months[want] ? want : null) : (monthList[0] ?? null);
          if (!m) return null;
          return {
            id: `upload-${m}`,
            monthYear: m,
            csvStorageUrl: `market-data/u/${m}.csv`,
          };
        },
        findMany: async () => monthList.map((m) => ({ monthYear: m })),
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
    readCsv: async (storageKey: string) =>
      Buffer.from(byUrl.get(storageKey) ?? "", "utf8"),
    getMarketConfig: async () => config,
    loadSettings: async () => ({ sampleSizeVariant: "conservative" }),
  };
  return { deps, logged, createdFacts };
}

test("runComputeCut: monthYear targets that exact upload, not the latest", async () => {
  const { deps } = stubMultiMonth(
    {
      "2026-05": typeCsv(soldTypeRows("Condo", 400000, 20)),
      "2025-05": typeCsv(soldTypeRows("Condo", 380000, 20)),
    },
    TYPE_MAPPING,
  );
  const res = await runComputeCut(
    {
      userId: "u",
      params: { dimension: "propertyClass", filters: [], monthYear: "2025-05" },
    },
    deps,
  );
  assert.equal(res.classification, "computed");
  assert.equal(res.monthYear, "2025-05");
  // Facts must carry the requested period, never the latest.
  for (const f of res.facts) assert.equal(f.monthYear, "2025-05");
});

test("runComputeCut: monthYear with no upload → honest no_upload (no silent swap)", async () => {
  const { deps } = stubMultiMonth(
    { "2026-05": typeCsv(soldTypeRows("Condo", 400000, 20)) },
    TYPE_MAPPING,
  );
  const res = await runComputeCut(
    {
      userId: "u",
      params: { dimension: "propertyClass", filters: [], monthYear: "2024-01" },
    },
    deps,
  );
  assert.equal(res.ok, false);
  assert.equal(res.classification, "no_upload");
  assert.equal(res.facts.length, 0);
  assert.match(res.note, /2024-01/);
});

test("runYoYCut: real delta per property type when BOTH periods exist", async () => {
  const { deps } = stubMultiMonth(
    {
      "2026-05": typeCsv(
        soldTypeRows("Condo", 400000, 20) + soldTypeRows("Single Family", 600000, 20),
      ),
      "2025-05": typeCsv(
        soldTypeRows("Condo", 380000, 20) + soldTypeRows("Single Family", 560000, 20),
      ),
    },
    TYPE_MAPPING,
  );
  const res = await runYoYCut(
    { userId: "u", params: { dimension: "propertyClass", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "computed");
  assert.equal(res.baseMonth, "2026-05");
  assert.equal(res.comparisonMonth, "2025-05");
  assert.equal(res.comparisonIsFallback, false);
  // Both periods' facts are returned so each endpoint is citable.
  assert.ok(res.facts.length > 0);
  // Condo median sale price rose YoY (400000-base vs 380000-base) → positive.
  const condoMed = res.deltas.find(
    (d) => d.bucket === "Condo" && d.metricKey === "median_sale_price",
  );
  assert.ok(condoMed, "expected a Condo median-sale-price delta");
  assert.ok(condoMed!.deltaPct > 0, "Condo prices rose YoY → positive delta");
  assert.match(condoMed!.deltaPctString, /^\+/);
});

test("runYoYCut: only one uploaded month → no_comparison listing available months, no fabricated baseline", async () => {
  const { deps } = stubMultiMonth(
    { "2026-05": typeCsv(soldTypeRows("Condo", 400000, 20)) },
    TYPE_MAPPING,
  );
  const res = await runYoYCut(
    { userId: "u", params: { dimension: "propertyClass", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "no_comparison");
  assert.equal(res.comparisonMonth, null);
  assert.equal(res.deltas.length, 0);
  assert.deepEqual(res.availableMonths, ["2026-05"]);
  assert.match(res.note, /do NOT invent/i);
});

test("runYoYCut: exact year-ago missing → nearest prior period flagged as fallback", async () => {
  const { deps } = stubMultiMonth(
    {
      "2026-05": typeCsv(soldTypeRows("Condo", 400000, 20)),
      "2025-03": typeCsv(soldTypeRows("Condo", 360000, 20)),
    },
    TYPE_MAPPING,
  );
  const res = await runYoYCut(
    { userId: "u", params: { dimension: "propertyClass", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "computed");
  assert.equal(res.comparisonMonth, "2025-03");
  assert.equal(res.comparisonIsFallback, true);
  assert.match(res.note, /nearest available prior period/i);
});

test("runYoYCut: prior upload lacks the property-type column → degrades honestly, no delta, base facts kept", async () => {
  // The 2025-05 export has NO "Property Type" column, so the propertyClass cut
  // can't be computed there. The engine must withhold any YoY delta but still
  // surface the base-period facts — never fabricate a prior-year number.
  const { deps } = stubMultiMonth(
    {
      "2026-05": typeCsv(soldTypeRows("Condo", 400000, 20)),
      "2025-05": soldNbhdCsv("All", 20), // no Property Type column at all
    },
    TYPE_MAPPING,
  );
  const res = await runYoYCut(
    { userId: "u", params: { dimension: "propertyClass", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "no_comparison");
  assert.equal(res.deltas.length, 0);
  // Base-period facts are still returned so the current period stays citable.
  assert.ok(res.facts.some((f) => f.monthYear === "2026-05"));
  assert.match(res.note, /do NOT invent/i);
});

// ── City dimension through the full runComputeCut / runYoYCut pipeline ────────

const CITY_MAPPING: ColumnMapping = {
  neighbourhood: "Community",
  city: "City",
  status: "Status",
  salePrice: "Sale Price",
  listPrice: "List Price",
};

function cityCsv(blocks: string): string {
  return "City,Community,Status,Sale Price,List Price\n" + blocks;
}

/** `n` sold rows for one city × community at a fixed sale (== list) price. */
function soldCityRows(city: string, community: string, price: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += `${city},${community},Sold,${price + i * 1000},${price + i * 1000}\n`;
  }
  return s;
}

test("runComputeCut: dimension=city with no city column mapped → honest unavailable", async () => {
  // The upload has no City column and the mapping doesn't point at one, so a
  // city cut must refuse honestly rather than inventing a single bucket.
  const { deps, logged, createdFacts } = stubDeps(
    typeCsv(soldTypeRows("Condo", 400000, 20)),
    TYPE_MAPPING,
  );
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "city", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "unavailable");
  assert.equal(res.facts.length, 0);
  assert.equal(createdFacts.length, 0, "must not persist facts on unavailable");
  assert.deepEqual(logged, ["unavailable"]);
});

test("runComputeCut: multi-city neighbourhood cut disambiguates same-named neighbourhoods", async () => {
  const { deps } = stubMultiMonth(
    {
      "2026-05": cityCsv(
        soldCityRows("Plano", "Downtown", 500000, 20) +
          soldCityRows("Frisco", "Downtown", 800000, 20),
      ),
    },
    CITY_MAPPING,
  );
  const res = await runComputeCut(
    { userId: "u", params: { dimension: "neighbourhood", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "computed");
  // Two distinct cities in scope → each Downtown fact is city-qualified, never merged.
  const hoods = new Set(res.facts.map((f) => f.neighbourhood));
  assert.ok(hoods.has("Downtown (Plano)"), "expected a Plano-scoped Downtown");
  assert.ok(hoods.has("Downtown (Frisco)"), "expected a Frisco-scoped Downtown");
  assert.ok(!hoods.has("Downtown"), "the bare merged Downtown must not appear");
});

test("runYoYCut: dimension=city composes a real per-city delta across two periods", async () => {
  const { deps } = stubMultiMonth(
    {
      "2026-05": cityCsv(
        soldCityRows("Plano", "A", 500000, 20) + soldCityRows("Frisco", "B", 800000, 20),
      ),
      "2025-05": cityCsv(
        soldCityRows("Plano", "A", 460000, 20) + soldCityRows("Frisco", "B", 760000, 20),
      ),
    },
    CITY_MAPPING,
  );
  const res = await runYoYCut(
    { userId: "u", params: { dimension: "city", filters: [] } },
    deps,
  );
  assert.equal(res.classification, "computed");
  assert.equal(res.baseMonth, "2026-05");
  assert.equal(res.comparisonMonth, "2025-05");
  const planoMed = res.deltas.find(
    (d) => d.bucket === "Plano" && d.metricKey === "median_sale_price",
  );
  assert.ok(planoMed, "expected a Plano median-sale-price delta");
  assert.ok(planoMed!.deltaPct > 0, "Plano prices rose YoY → positive delta");
  assert.match(planoMed!.deltaPctString, /^\+/);
});

test("runComputeCut: filterCity scopes a neighbourhood cut to one city end-to-end", async () => {
  const { deps } = stubMultiMonth(
    {
      "2026-05": cityCsv(
        soldCityRows("Plano", "Downtown", 500000, 20) +
          soldCityRows("Frisco", "Downtown", 800000, 20),
      ),
    },
    CITY_MAPPING,
  );
  const res = await runComputeCut(
    {
      userId: "u",
      params: { dimension: "neighbourhood", filters: [{ field: "city", value: "Plano" }] },
    },
    deps,
  );
  assert.equal(res.classification, "computed");
  // Only Plano in scope after the filter → plain label, no Frisco leakage.
  const hoods = new Set(res.facts.map((f) => f.neighbourhood));
  assert.ok(hoods.has("Downtown"), "expected the plain Plano Downtown");
  assert.ok(!hoods.has("Downtown (Frisco)"), "Frisco must be filtered out");
});
