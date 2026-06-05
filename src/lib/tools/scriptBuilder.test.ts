/**
 * Headless unit test for the extractable Script Builder core.
 *
 * Proves `buildScript()` runs as a plain function — no HTTP, no Next.js
 * Request/Response, no Anthropic API key, no Prisma — by injecting a fake
 * `ScriptLlmStreamer` that emits a deterministic, validation-clean draft
 * built from the cited facts. Asserts the returned script is non-empty and
 * contains the cited facts that were passed in.
 *
 * Run with:  npx tsx --test src/lib/tools/scriptBuilder.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScript,
  type BuildScriptParams,
  type CitedFact,
  type ScriptLlmStreamer,
} from "./scriptBuilder";
import type { MarketConfigSummary } from "../content-engine-context";

const PRICE = "$612,000";
const SALE_SHARE = "49.4%";

const CITED_FACTS: CitedFact[] = [
  {
    id: "f1",
    neighbourhood: "Saddle Ridge",
    metricName: "median_price",
    metricLabel: "Median Sale Price",
    metricValueString: PRICE,
    monthYear: "2026-04",
    marketType: "balanced",
    trajectory: "stable",
    caveat: null,
  },
  {
    id: "f2",
    neighbourhood: "Saddle Ridge",
    metricName: "sale_share",
    metricLabel: "Sale Share",
    metricValueString: SALE_SHARE,
    monthYear: "2026-04",
    marketType: "balanced",
    trajectory: "stable",
    caveat: null,
  },
];

const MARKET_CONFIG: MarketConfigSummary = {
  marketName: "Calgary",
  neighbourhoods: ["Saddle Ridge"],
  keywordKit: null,
  primaryAvatar: null,
  subPersonas: null,
  moiThresholds: null,
  voiceGuide: null,
  teamCredibility: {
    yearsInBusiness: null,
    familiesHelped: null,
    annualTransactionCount: null,
    teamSize: null,
    notes: null,
  },
};

/**
 * A validation-clean script body. Every $/% token is one of the two cited
 * facts (so the stat gates pass), it stays well above the 2200-word floor,
 * and it avoids every banned phrase (no "why", no abbreviations, no
 * avatar-pander, no announced credibility, no next-video tease).
 */
function makeCleanScript(): string {
  const paragraph =
    `In Saddle Ridge the typical detached home is trading around ${PRICE} right now, ` +
    `and the share of active listings that ultimately find a buyer is sitting close to ${SALE_SHARE}. ` +
    `That pairing of a ${PRICE} price level against a ${SALE_SHARE} absorption read is the single ` +
    `clearest signal of how balanced this corner of the market has become through the season, ` +
    `and it is the kind of grounded read that helps a household plan the next move with real confidence.`;
  const body = Array.from({ length: 40 }, () => paragraph).join("\n\n");
  return `# Title: The Saddle Ridge Market Read\n\n[VISUAL: opening drone shot]\n\n${body}\n`;
}

function baseParams(streamer: ScriptLlmStreamer): BuildScriptParams {
  return {
    planContext: {
      id: "plan1",
      title: "The Saddle Ridge Market Read",
      rotationSlot: "market_update",
      titlePromise: "What the Saddle Ridge numbers actually say this spring",
      visualPeak: null,
      thumbnailCallouts: [],
      subPersonas: null,
      tactileType: null,
      framework: null,
      clarityPremise: null,
      estimatedRuntime: null,
    },
    citedFacts: CITED_FACTS,
    marketConfig: MARKET_CONFIG,
    neighbourhoodContext: {
      "Saddle Ridge":
        "Saddle Ridge is a family-oriented community in northeast Calgary with a mix of detached homes and townhomes.",
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

test("buildScript returns a non-empty script containing the cited facts (headless, no HTTP)", async () => {
  const script = makeCleanScript();
  const fake: ScriptLlmStreamer = {
    async *stream() {
      yield { type: "message_start", inputTokens: 1500, outputTokens: 0 };
      const size = 800;
      for (let i = 0; i < script.length; i += size) {
        yield { type: "text_delta", text: script.slice(i, i + size) };
      }
      yield { type: "message_delta", outputTokens: 3200 };
    },
  };

  const phases: string[] = [];
  let streamedText = "";
  const result = await buildScript({
    ...baseParams(fake),
    callbacks: {
      onPhase: (key) => phases.push(key),
      onToken: (text) => {
        streamedText += text;
      },
    },
  });

  // The validator must be satisfied — surface remaining violations if not.
  assert.equal(
    result.ok,
    true,
    `expected ok; remaining violations: ${JSON.stringify(result.violations)}`,
  );
  assert.equal(result.aborted, false);
  assert.equal(result.error, null);
  assert.equal(result.attempt, 0);

  // Returned script is non-empty and carries the cited facts.
  assert.ok(result.script.length > 0, "script should be non-empty");
  assert.ok(
    result.script.includes(PRICE),
    `script should contain cited fact ${PRICE}`,
  );
  assert.ok(
    result.script.includes(SALE_SHARE),
    `script should contain cited fact ${SALE_SHARE}`,
  );

  // Token accounting and streaming callbacks were wired through.
  assert.equal(result.inputTokens, 1500);
  assert.equal(result.outputTokens, 3200);
  assert.ok(phases.includes("load"));
  assert.ok(phases.includes("validate"));
  assert.ok(streamedText.includes(PRICE));
});

test("buildScript surfaces a terminal error when the draft fails validation", async () => {
  // A too-short draft trips the min_dialogue_length gate on every attempt,
  // so the loop exhausts and returns a categorized validator_max_retries
  // error rather than throwing.
  const tinyDraft = "# Title: Too Short\n\nThis draft is far too short to pass.";
  const fake: ScriptLlmStreamer = {
    async *stream() {
      yield { type: "message_start", inputTokens: 100, outputTokens: 0 };
      yield { type: "text_delta", text: tinyDraft };
      yield { type: "message_delta", outputTokens: 50 };
    },
  };

  const result = await buildScript(baseParams(fake));

  assert.equal(result.ok, false);
  assert.equal(result.aborted, false);
  assert.ok(result.error, "expected a terminal ScriptError");
  assert.equal(result.error?.category, "validator_max_retries");
  assert.ok(result.violations.length > 0, "expected remaining violations");
});
