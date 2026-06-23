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
  mlsSource: null,
  highEndException: null,
  moiHighEndExceptionFloor: null,
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

// Empathy / connection-dosage beats. The generation-only dosage gate
// (checkConnectionDosage) requires the BODY to carry connection phrases (≥4),
// genuine values beats (≥2), and editorial/signature moments (≥6), all
// DISTRIBUTED across the script. A bare market-read trips all three and
// degrades, so the clean fixtures weave these in (none carry a $/% token, so
// the stat gates are unaffected) and distribute them so the clustering check
// never fires.
const CONNECTION_BEATS: readonly string[] = [
  "If you've been tracking Saddle Ridge, this pattern will feel familiar.",
  "You might be thinking a balanced market is hard to read.",
  "Here's what that means for you as you plan the next move.",
  "It makes sense that you'd want a grounded read before deciding.",
  "If you're relocating into the northeast, the same logic holds.",
];
const VALUES_BEATS: readonly string[] = [
  "We believe every family deserves a clear, honest read of the numbers.",
  "Our whole approach is built around making sure you understand what you're looking at.",
  "You deserve to walk in knowing exactly where the market stands.",
];
const EDITORIAL_BEATS: readonly string[] = [
  "Think about that for a moment.",
  "Hold that thought.",
  "Did you catch that?",
  "Here's where it gets interesting.",
  "Pause on that.",
  "No joke.",
  "Shockingly, the pattern held through the whole season.",
];
const ALL_BEATS: readonly string[] = [
  ...CONNECTION_BEATS,
  ...VALUES_BEATS,
  ...EDITORIAL_BEATS,
];

/**
 * Build a body of `repeats` grounded paragraphs, distributing the empathy beats
 * evenly from paragraph `start` onward so they land in many word-window regions
 * (the dosage gate's clustering check only fires when beats are confined to ≤2
 * regions). Starting at `start` keeps every beat out of the skipped opening
 * hook window so they all count toward the floors.
 */
function buildGroundedBody(paragraph: string, repeats: number): string {
  const paras = Array.from({ length: repeats }, () => paragraph);
  const start = 3;
  const span = repeats - start;
  ALL_BEATS.forEach((beat, k) => {
    const idx = start + Math.floor((span * k) / ALL_BEATS.length);
    if (idx < repeats) paras[idx] = `${beat} ${paras[idx]}`;
  });
  return paras.join("\n\n");
}

/**
 * A validation-clean script body. Every $/% token is one of the two cited
 * facts (so the stat gates pass), it stays well above the 2200-word floor,
 * it carries distributed empathy/connection beats so the dosage gate is clean,
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
  const body = buildGroundedBody(paragraph, 40);
  return (
    `# Title: The Saddle Ridge Market Read\n\n[VISUAL: opening drone shot]\n\n${body}\n\n` +
    `## Sources\n- Median Sale Price — ${PRICE} (fact f1)\n- Sale Share — ${SALE_SHARE} (fact f2)\n`
  );
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

/**
 * A lean, fully-grounded body for the NO-profile path. Reuses the clean
 * paragraph (every $/% token is a cited fact) but with far fewer repeats so the
 * dialogue lands between the lean floor (1,600) and the full floor (2,200).
 * Append an optional invented-stat paragraph to force a persistent
 * `unanchored_stat` error while keeping the draft grounded.
 */
function makeLeanScript(opts: { withPersistentError?: boolean } = {}): string {
  const paragraph =
    `In Saddle Ridge the typical detached home is trading around ${PRICE} right now, ` +
    `and the share of active listings that ultimately find a buyer is sitting close to ${SALE_SHARE}. ` +
    `That pairing of a ${PRICE} price level against a ${SALE_SHARE} absorption read is the single ` +
    `clearest signal of how balanced this corner of the market has become through the season, ` +
    `and it is the kind of grounded read that helps a household plan the next move with real confidence.`;
  const body = buildGroundedBody(paragraph, 23);
  // A banned avatar-pander phrase ("leverage") trips `no_avatar_pander` (error)
  // on every attempt. Unlike an invented stat, it is NOT auto-softened by the
  // builder, so it persists through every retry — while the draft stays grounded
  // in the cited facts (anchoredDetailCount > 0), forcing the graceful-degrade
  // path instead of a hard-fail.
  const pander = opts.withPersistentError
    ? `\n\nYou can leverage this balanced read to plan your next move.`
    : "";
  // A proper Sources footnote lists the two cited facts so they don't trip
  // unlisted_market_stat.
  const sources = `\n\n## Sources\n- Median Sale Price — ${PRICE} (fact f1)\n- Sale Share — ${SALE_SHARE} (fact f2)\n`;
  return `# Title: The Saddle Ridge Market Read\n\n[VISUAL: opening drone shot]\n\n${body}${pander}${sources}`;
}

/** baseParams with the neighbourhood profile context removed (no-profile path). */
function noProfileParams(streamer: ScriptLlmStreamer): BuildScriptParams {
  return { ...baseParams(streamer), neighbourhoodContext: {} };
}

test("buildScript ships a lean grounded draft (no profile) as a clean, non-degraded success", async () => {
  const script = makeLeanScript();
  const fake: ScriptLlmStreamer = {
    async *stream() {
      yield { type: "message_start", inputTokens: 1200, outputTokens: 0 };
      const size = 800;
      for (let i = 0; i < script.length; i += size) {
        yield { type: "text_delta", text: script.slice(i, i + size) };
      }
      yield { type: "message_delta", outputTokens: 1800 };
    },
  };

  const result = await buildScript(noProfileParams(fake));

  // Lean floor (1,600) — not the 2,200 profile floor — so a grounded lean draft
  // passes cleanly on the first attempt with no graceful-degrade flagging.
  assert.equal(
    result.ok,
    true,
    `expected ok; remaining violations: ${JSON.stringify(result.violations)}`,
  );
  assert.notEqual(result.degraded, true, "clean lean draft must NOT be degraded");
  assert.equal(result.error, null);
  assert.equal(result.attempt, 0);
  assert.ok(result.script.includes(PRICE));
  assert.ok((result.flagged ?? []).length === 0);
});

test("buildScript degrades (ships flagged) instead of hard-failing when a grounded draft keeps tripping a rule", async () => {
  // Grounded (cites real facts) but always carries a banned "leverage" pander
  // phrase, so `no_avatar_pander` fires on every attempt (and unlike an invented
  // stat it is NOT auto-softened). The loop exhausts retries but the draft is
  // anchored, so it ships DEGRADED rather than hard-failing.
  const script = makeLeanScript({ withPersistentError: true });
  const fake: ScriptLlmStreamer = {
    async *stream() {
      yield { type: "message_start", inputTokens: 1200, outputTokens: 0 };
      const size = 800;
      for (let i = 0; i < script.length; i += size) {
        yield { type: "text_delta", text: script.slice(i, i + size) };
      }
      yield { type: "message_delta", outputTokens: 1800 };
    },
  };

  const result = await buildScript(noProfileParams(fake));

  assert.equal(result.ok, true, "degraded ship must report ok:true");
  assert.equal(result.degraded, true, "expected a degraded ship");
  assert.equal(result.error, null, "degraded ship must not carry a terminal error");
  assert.ok(
    (result.flagged ?? []).length > 0,
    "degraded ship must flag the residual violations",
  );
  assert.ok(
    (result.flagged ?? []).some((v) => v.rule === "no_avatar_pander"),
    "the persistent no_avatar_pander error should be among the flagged issues",
  );
  assert.ok(result.script.includes(PRICE), "shipped draft stays grounded");
  assert.equal(result.violations.length, 0, "degraded ship clears blocking violations");
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
