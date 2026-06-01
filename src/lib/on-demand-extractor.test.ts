/**
 * Unit tests for the Layer 2 paid extractor (`extractOnDemand`).
 *
 * Run: `npx tsx --test src/lib/on-demand-extractor.test.ts`
 *
 * The non-negotiable invariant: Claude is NEVER called when a cost gate trips.
 * Every test asserts on a Claude spy's call count.
 *
 * Acceptance coverage:
 *   - monthly hard cap blocked      -> cost_cap_hit, Claude NOT called, no spend
 *   - per-request estimate too high -> cost_cap_hit, Claude NOT called, no spend
 *   - success                       -> persists MarketFact + logs spend, returns cost
 *   - sample floor (<10 in scope)   -> sample_too_small, Claude NOT called
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractOnDemand,
  parseExtractionJson,
  type ExtractDeps,
} from "./on-demand-extractor";
import { MetricFamily, type ScriptDataNeed } from "./script-data-resolver";

const need = (over: Partial<ScriptDataNeed> = {}): ScriptDataNeed => ({
  memberId: "m1",
  marketConfigId: "cfg1",
  neighbourhood: "Bridgeland",
  propertyType: "Detached",
  metricFamily: MetricFamily.MEDIAN,
  timeWindow: { startMonth: "2026-01", endMonth: "2026-06" },
  ...over,
});

const MAPPING = {
  neighbourhood: "Community",
  propertyType: "Type",
  salePrice: "SoldPrice",
  listPrice: "ListPrice",
  daysOnMarket: "DOM",
};

function csvBuffer(rowCount: number): Buffer {
  const header = "Community,Type,SoldPrice,ListPrice,DOM";
  const lines = [header];
  for (let i = 0; i < rowCount; i++) {
    lines.push(`Bridgeland,Detached,${700000 + i * 1000},${710000 + i * 1000},${10 + i}`);
  }
  // A couple of out-of-scope rows that must be filtered out.
  lines.push("Inglewood,Detached,900000,910000,5");
  lines.push("Bridgeland,Apartment,400000,410000,20");
  return Buffer.from(lines.join("\n"), "utf8");
}

type Calls = {
  claude: number;
  factCreate: number;
  logUsage: number;
  logCreate: number;
};

function makeDeps(over: {
  cap?: Partial<ReturnType<() => never>> | Record<string, unknown>;
  csvRows?: number;
  claudeResp?: { text: string; inputTokens: number; outputTokens: number };
  upload?: unknown;
  mapping?: Record<string, string>;
  onClaude?: (args: { system: string; user: string }) => void;
} = {}): { deps: ExtractDeps; calls: Calls } {
  const calls: Calls = { claude: 0, factCreate: 0, logUsage: 0, logCreate: 0 };
  const deps = {
    prisma: {
      marketDataUpload: {
        findFirst: async () =>
          over.upload === undefined
            ? {
                id: "up1",
                monthYear: "2026-05",
                csvStorageUrl: "market-data/m1/up1.csv",
                rowCount: 100,
              }
            : over.upload,
      },
      marketConfig: {
        findUnique: async () => ({ columnMapping: over.mapping ?? MAPPING }),
      },
      marketFact: {
        create: async () => {
          calls.factCreate++;
          return { id: "fNew" };
        },
      },
      onDemandExtractionLog: {
        create: async () => {
          calls.logCreate++;
          return {};
        },
      },
    },
    readCsv: async () => csvBuffer(over.csvRows ?? 12),
    callClaude: async (args: { system: string; user: string }) => {
      calls.claude++;
      over.onClaude?.(args);
      return (
        over.claudeResp ?? {
          text: '{"value":750000,"sampleSize":12,"unit":"USD","note":"ok"}',
          inputTokens: 4000,
          outputTokens: 150,
        }
      );
    },
    getCostCapStatus: async () =>
      (over.cap as never) ?? {
        hardBlocked: false,
        softWarning: false,
        monthSpendUsd: 0,
        capUsd: 20,
      },
    logUsage: async () => {
      calls.logUsage++;
    },
  };
  return { deps: deps as unknown as ExtractDeps, calls };
}

test("monthly hard cap -> cost_cap_hit, Claude NOT called, nothing read", async () => {
  const { deps, calls } = makeDeps({
    cap: { hardBlocked: true, softWarning: true, monthSpendUsd: 20, capUsd: 20 },
  });
  const out = await extractOnDemand({ need: need() }, deps);
  assert.deepEqual(out.result, { source: "none", reason: "cost_cap_hit" });
  assert.equal(out.softWarning, true);
  assert.equal(calls.claude, 0);
  assert.equal(calls.factCreate, 0);
  assert.equal(calls.logUsage, 0);
});

test("per-request estimate over cap -> cost_cap_hit, Claude NOT called", async () => {
  // 12 in-scope rows estimate well above a near-zero maxCostUsd.
  const { deps, calls } = makeDeps({ csvRows: 12 });
  const out = await extractOnDemand({ need: need(), maxCostUsd: 0.00001 }, deps);
  assert.equal(out.result.source, "none");
  if (out.result.source === "none") assert.equal(out.result.reason, "cost_cap_hit");
  assert.equal(calls.claude, 0);
  assert.equal(calls.factCreate, 0);
  assert.equal(calls.logUsage, 0);
  assert.equal(calls.logCreate, 1); // the attempt is logged
});

test("success -> persists MarketFact, logs spend, returns on_demand_extraction", async () => {
  const { deps, calls } = makeDeps({ csvRows: 12 });
  const out = await extractOnDemand({ need: need() }, deps);
  assert.equal(out.result.source, "on_demand_extraction");
  if (out.result.source === "on_demand_extraction") {
    assert.equal(out.result.value, 750000);
    assert.equal(out.result.factId, "fNew");
    assert.equal(out.result.unit, "USD");
    assert.ok(out.result.costUsd > 0);
  }
  assert.equal(calls.claude, 1);
  assert.equal(calls.factCreate, 1);
  assert.equal(calls.logUsage, 1);
  assert.equal(calls.logCreate, 1);
});

test("sample floor (<10 in scope) -> sample_too_small, Claude NOT called", async () => {
  const { deps, calls } = makeDeps({ csvRows: 5 });
  const out = await extractOnDemand({ need: need() }, deps);
  assert.equal(out.result.source, "none");
  if (out.result.source === "none") assert.equal(out.result.reason, "sample_too_small");
  assert.equal(calls.claude, 0);
  assert.equal(calls.factCreate, 0);
  assert.equal(calls.logUsage, 0);
});

test("Claude returns null value -> no fact persisted, spend still logged", async () => {
  const { deps, calls } = makeDeps({
    csvRows: 12,
    claudeResp: {
      text: '{"value":null,"sampleSize":12,"unit":"USD","note":"unclear"}',
      inputTokens: 3000,
      outputTokens: 90,
    },
  });
  const out = await extractOnDemand({ need: need() }, deps);
  assert.equal(out.result.source, "none");
  if (out.result.source === "none") assert.equal(out.result.reason, "no_data");
  assert.equal(calls.claude, 1);
  assert.equal(calls.factCreate, 0);
  assert.equal(calls.logUsage, 1); // spent tokens, must be on the ledger
});

test("upload outside the time window -> no_data, Claude NOT called", async () => {
  const { deps, calls } = makeDeps({
    upload: {
      id: "old",
      monthYear: "2025-01",
      csvStorageUrl: "market-data/m1/old.csv",
      rowCount: 100,
    },
  });
  const out = await extractOnDemand({ need: need() }, deps);
  assert.deepEqual(out.result, { source: "none", reason: "no_data" });
  assert.equal(calls.claude, 0);
});

test("large in-scope slice -> prompt rows capped to a representative sample (no context overflow)", async () => {
  // Market-wide slice bigger than the safe context budget. The cost estimate
  // would clear a generous cap, but the full slice would overflow Claude's 200K
  // window — the extractor must sample down before sending.
  let captured = "";
  const { deps, calls } = makeDeps({
    csvRows: 8000,
    onClaude: ({ user }) => {
      captured = user;
    },
  });
  const out = await extractOnDemand({ need: need(), maxCostUsd: 1000 }, deps);
  assert.equal(calls.claude, 1);
  assert.equal(out.result.source, "on_demand_extraction");
  // It told Claude the rows are a sample of the true population.
  assert.match(captured, /representative sample of 8000/);
  // The serialized row lines are bounded well under the full 8000.
  const rowLines = captured.split("\n").filter((l) => l.startsWith("Bridgeland\t"));
  assert.ok(rowLines.length <= 6000, `expected <=6000 row lines, got ${rowLines.length}`);
  assert.ok(rowLines.length >= 10, "still sends a usable sample above the floor");
});

test("parseExtractionJson tolerates markdown fences and bad JSON", () => {
  assert.deepEqual(parseExtractionJson('```json\n{"value":5,"sampleSize":11}\n```'), {
    value: 5,
    sampleSize: 11,
  });
  assert.deepEqual(parseExtractionJson("not json"), { value: null, sampleSize: null });
});
