/**
 * Golden-case eval runner for the extractable Script Builder core.
 *
 * Loads every JSON case under evals/golden/, runs `buildScript()` headlessly
 * (no HTTP / Next.js / Anthropic key / Prisma) with a deterministic fake
 * `ScriptLlmStreamer` synthesized from the case, checks the case's
 * expectations, and prints a PASS/FAIL line per case plus a summary. Exits
 * non-zero if any case fails so it can gate CI.
 *
 * Run with:  npx tsx evals/run.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildScript,
  type BuildScriptParams,
  type CitedFact,
  type ScriptLlmStreamer,
} from "../src/lib/tools/scriptBuilder";
import type { MarketConfigSummary } from "../src/lib/content-engine-context";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, "golden");

interface GoldenCase {
  name: string;
  description?: string;
  neighbourhood: string;
  citedFacts: CitedFact[];
  scriptTitle: string;
  scriptParagraph: string;
  scriptRepeat: number;
  expect: {
    ok: boolean;
    contains?: string[];
    errorCategory?: string;
  };
}

/** Build the canned draft a case's fake LLM will emit. */
function makeDraft(c: GoldenCase): string {
  const body = Array.from({ length: Math.max(1, c.scriptRepeat) }, () => c.scriptParagraph).join(
    "\n\n",
  );
  return `# Title: ${c.scriptTitle}\n\n[VISUAL: opening drone shot]\n\n${body}\n`;
}

function makeStreamer(draft: string): ScriptLlmStreamer {
  return {
    async *stream() {
      yield { type: "message_start", inputTokens: 1500, outputTokens: 0 };
      const size = 800;
      for (let i = 0; i < draft.length; i += size) {
        yield { type: "text_delta", text: draft.slice(i, i + size) };
      }
      yield { type: "message_delta", outputTokens: 3200 };
    },
  };
}

function makeMarketConfig(c: GoldenCase): MarketConfigSummary {
  return {
    marketName: "Calgary",
    neighbourhoods: [c.neighbourhood],
    keywordKit: null,
    primaryAvatar: null,
    subPersonas: null,
    moiThresholds: null,
    voiceGuide: null,
    voiceMode: null,
    voiceGuideSourceFile: null,
    teamCredibility: {
      yearsInBusiness: null,
      familiesHelped: null,
      annualTransactionCount: null,
      teamSize: null,
      notes: null,
    },
  };
}

function makeParams(c: GoldenCase, streamer: ScriptLlmStreamer): BuildScriptParams {
  return {
    planContext: {
      id: "plan-eval",
      title: c.scriptTitle,
      rotationSlot: "market_update",
      titlePromise: `What the ${c.neighbourhood} numbers actually say this spring`,
      visualPeak: null,
      thumbnailCallouts: [],
      subPersonas: null,
      tactileType: null,
      framework: null,
      clarityPremise: null,
      estimatedRuntime: null,
    },
    citedFacts: c.citedFacts,
    marketConfig: makeMarketConfig(c),
    neighbourhoodContext: {
      [c.neighbourhood]: `${c.neighbourhood} is a family-oriented community in northeast Calgary with a mix of detached homes and townhomes.`,
    },
    sourceOfTruthMetrics: [],
    propertyTypeByHood: {},
    shootType: "talking_head",
    assignedCampaign: null,
    assignedBingeVideo: null,
    regenerationBrief: null,
    memberFullName: "Jamie Rivers",
    forbiddenIdentities: [],
    bingeTargetConfigured: false,
    bingeTargetTitle: null,
    llm: streamer,
  };
}

function loadCases(): GoldenCase[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8")) as GoldenCase);
}

async function runCase(c: GoldenCase): Promise<{ pass: boolean; reason: string }> {
  const draft = makeDraft(c);
  const result = await buildScript(makeParams(c, makeStreamer(draft)));

  if (result.ok !== c.expect.ok) {
    return {
      pass: false,
      reason: `expected ok=${c.expect.ok}, got ok=${result.ok}` +
        (result.error ? ` (error: ${result.error.category})` : "") +
        (result.violations?.length ? ` violations=${JSON.stringify(result.violations)}` : ""),
    };
  }

  if (c.expect.ok) {
    if (result.script.length === 0) return { pass: false, reason: "script was empty" };
    for (const needle of c.expect.contains ?? []) {
      if (!result.script.includes(needle)) {
        return { pass: false, reason: `script missing required substring: ${needle}` };
      }
    }
  } else if (c.expect.errorCategory) {
    if (result.error?.category !== c.expect.errorCategory) {
      return {
        pass: false,
        reason: `expected error category ${c.expect.errorCategory}, got ${result.error?.category ?? "none"}`,
      };
    }
  }

  return { pass: true, reason: "ok" };
}

async function main(): Promise<void> {
  const cases = loadCases();
  if (cases.length === 0) {
    console.error("No golden cases found in", GOLDEN_DIR);
    process.exit(1);
  }

  let passed = 0;
  for (const c of cases) {
    let outcome: { pass: boolean; reason: string };
    try {
      outcome = await runCase(c);
    } catch (err) {
      outcome = { pass: false, reason: `threw: ${(err as Error).message}` };
    }
    if (outcome.pass) passed += 1;
    const tag = outcome.pass ? "PASS" : "FAIL";
    console.log(`[${tag}] ${c.name}${outcome.pass ? "" : ` — ${outcome.reason}`}`);
  }

  const failed = cases.length - passed;
  console.log(`\n${passed}/${cases.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("eval runner crashed:", err);
  process.exit(1);
});
