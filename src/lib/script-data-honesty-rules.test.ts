/**
 * Consolidation guard for the shared data-honesty guardrails.
 *
 * The whole point of `script-data-honesty-rules.ts` is to be the SINGLE source
 * of truth for the locked guardrails consumed by BOTH script-builder paths:
 *   - the Jarvis canonical prompt (`SCRIPT_BUILDER_MODE_PROMPT`)
 *   - the ARC wizard route (`DEFAULT_SYSTEM_PROMPT` in the ARC route)
 *
 * These tests fail loudly if either path stops composing from the shared module
 * (i.e. someone re-inlines the rules and the two prompts silently drift apart).
 *
 * Run: `npx tsx --test src/lib/script-data-honesty-rules.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCRIPT_BUILDER_MODE_PROMPT } from "@/lib/script-builder-mode-prompt";
import {
  MOI_READING_RULES,
  FAILURE_RATE_RATIO_FRAMING,
  DATA_GROUNDING_GUARDRAILS,
} from "@/lib/script-data-honesty-rules";

const ARC_ROUTE_SRC = "src/app/api/ai-tools/arc-script-builder/route.ts";

test("shared guardrail consts are non-empty", () => {
  for (const [name, v] of [
    ["MOI_READING_RULES", MOI_READING_RULES],
    ["FAILURE_RATE_RATIO_FRAMING", FAILURE_RATE_RATIO_FRAMING],
    ["DATA_GROUNDING_GUARDRAILS", DATA_GROUNDING_GUARDRAILS],
  ] as const) {
    assert.ok(v.trim().length > 0, `${name} must be non-empty`);
  }
});

test("Jarvis canonical prompt composes the shared MOI + failure-rate guardrails verbatim", () => {
  assert.ok(
    SCRIPT_BUILDER_MODE_PROMPT.includes(MOI_READING_RULES),
    "canonical prompt must embed MOI_READING_RULES verbatim (re-inlined? drift risk)",
  );
  assert.ok(
    SCRIPT_BUILDER_MODE_PROMPT.includes(FAILURE_RATE_RATIO_FRAMING),
    "canonical prompt must embed FAILURE_RATE_RATIO_FRAMING verbatim",
  );
});

test("ARC route imports and interpolates all three shared guardrails", () => {
  const src = readFileSync(ARC_ROUTE_SRC, "utf8");
  assert.match(
    src,
    /from\s+["']@\/lib\/script-data-honesty-rules["']/,
    "ARC route must import from the shared guardrails module",
  );
  for (const token of [
    "${MOI_READING_RULES}",
    "${FAILURE_RATE_RATIO_FRAMING}",
    "${DATA_GROUNDING_GUARDRAILS}",
  ]) {
    assert.ok(
      src.includes(token),
      `ARC DEFAULT_SYSTEM_PROMPT must interpolate ${token}`,
    );
  }
});

test("failure-rate framing teaches the ratio reframe, not a raw nonsense percentage", () => {
  // The live regression that motivated this: a >100% failure rate must be
  // expressed as a "for every N that sold, M didn't" ratio.
  assert.match(
    FAILURE_RATE_RATIO_FRAMING.toLowerCase(),
    /ratio|for every/,
    "failure-rate framing must instruct a ratio-style reframe",
  );
});
