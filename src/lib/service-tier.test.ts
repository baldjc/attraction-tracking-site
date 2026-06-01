/**
 * Unit tests for the canonical service-tier source of truth.
 *
 * Run: `npx tsx --test src/lib/service-tier.test.ts`
 *
 * Covers:
 *   - Exactly four canonical tiers, all snake_case, all labelled.
 *   - isServiceTier guard accepts canonical, rejects legacy/garbage.
 *   - normalizeLegacyTier maps every legacy value + null for unknown.
 *   - legacyTierVideoCount extracts 2/4 and null for count-less tiers.
 *   - TIER_CONFIG caps + backfill windows match the agreed policy.
 *   - FEATURE_TIER_MATRIX: only drive_folder + client_hub exclude Foundations.
 *   - Drive/Client-Hub gate helpers + tierAllowsFeature behave per matrix.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVICE_TIERS,
  TIER_LABELS,
  TIER_CONFIG,
  TIER_FEATURES,
  FEATURE_TIER_MATRIX,
  isServiceTier,
  tierLabel,
  normalizeLegacyTier,
  legacyTierVideoCount,
  tierMonthlyCapUsd,
  tierSoftWarningUsd,
  tierBackfillMonths,
  tierAllowsFeature,
  hasDriveFolderAccess,
  hasClientHubAccess,
  type ServiceTier,
} from "./service-tier";

test("there are exactly four canonical tiers, all snake_case", () => {
  assert.deepEqual(
    [...SERVICE_TIERS],
    ["foundations", "production", "growth", "done_with_you"],
  );
  for (const t of SERVICE_TIERS) {
    assert.equal(t, t.toLowerCase());
    assert.ok(!/[A-Z\s-]/.test(t), `${t} must be snake_case`);
  }
});

test("every tier has a human label", () => {
  for (const t of SERVICE_TIERS) {
    assert.equal(typeof TIER_LABELS[t], "string");
    assert.ok(TIER_LABELS[t].length > 0);
  }
  assert.equal(TIER_LABELS.done_with_you, "Done With You");
});

test("isServiceTier accepts canonical, rejects legacy + junk", () => {
  for (const t of SERVICE_TIERS) assert.ok(isServiceTier(t));
  for (const bad of ["editing_2", "mastery_4", "", "DWY", null, undefined, 3]) {
    assert.equal(isServiceTier(bad as unknown), false);
  }
});

test("tierLabel falls back gracefully", () => {
  assert.equal(tierLabel("growth"), "Growth");
  assert.equal(tierLabel("editing_2"), "editing_2");
  assert.equal(tierLabel(null), "—");
});

test("normalizeLegacyTier maps every legacy value", () => {
  const cases: Record<string, ServiceTier | null> = {
    foundations: "foundations",
    editing_2: "production",
    editing_4: "production",
    production: "production",
    mastery_2: "growth",
    mastery_4: "growth",
    growth: "growth",
    done_with_you: "done_with_you",
    doneWithYou: "done_with_you",
    "Done With You": "done_with_you",
    dwy: "done_with_you",
    "  GROWTH  ": "growth",
    nonsense: null,
    "": null,
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeLegacyTier(input), expected, `normalize(${input})`);
  }
});

test("legacyTierVideoCount extracts embedded counts", () => {
  assert.equal(legacyTierVideoCount("editing_2"), 2);
  assert.equal(legacyTierVideoCount("mastery_2"), 2);
  assert.equal(legacyTierVideoCount("editing_4"), 4);
  assert.equal(legacyTierVideoCount("mastery_4"), 4);
  assert.equal(legacyTierVideoCount("foundations"), null);
  assert.equal(legacyTierVideoCount("done_with_you"), null);
  assert.equal(legacyTierVideoCount("production"), null);
});

test("per-tier caps match the agreed policy", () => {
  assert.equal(tierMonthlyCapUsd("foundations"), 25);
  assert.equal(tierSoftWarningUsd("foundations"), 20);
  assert.equal(tierMonthlyCapUsd("production"), 25);
  assert.equal(tierSoftWarningUsd("production"), 20);
  assert.equal(tierMonthlyCapUsd("growth"), 100);
  assert.equal(tierSoftWarningUsd("growth"), 80);
  assert.equal(tierMonthlyCapUsd("done_with_you"), 100);
  assert.equal(tierSoftWarningUsd("done_with_you"), 80);
  // soft warning must always sit below the hard cap.
  for (const t of SERVICE_TIERS) {
    assert.ok(TIER_CONFIG[t].softWarningUsd < TIER_CONFIG[t].monthlyCapUsd);
  }
});

test("backfill windows: Foundations 13mo, others 25mo", () => {
  assert.equal(tierBackfillMonths("foundations"), 13);
  assert.equal(tierBackfillMonths("production"), 25);
  assert.equal(tierBackfillMonths("growth"), 25);
  assert.equal(tierBackfillMonths("done_with_you"), 25);
});

test("feature matrix: only drive_folder + client_hub exclude Foundations", () => {
  for (const feature of TIER_FEATURES) {
    const allowed = FEATURE_TIER_MATRIX[feature];
    if (feature === "drive_folder" || feature === "client_hub") {
      assert.deepEqual(
        [...allowed].sort(),
        ["done_with_you", "growth", "production"].sort(),
        `${feature} must exclude Foundations`,
      );
    } else {
      assert.deepEqual(
        [...allowed].sort(),
        [...SERVICE_TIERS].sort(),
        `${feature} must allow every tier`,
      );
    }
  }
});

test("drive + client hub gates follow the matrix", () => {
  assert.equal(hasDriveFolderAccess("foundations"), false);
  assert.equal(hasClientHubAccess("foundations"), false);
  for (const t of ["production", "growth", "done_with_you"] as ServiceTier[]) {
    assert.ok(hasDriveFolderAccess(t));
    assert.ok(hasClientHubAccess(t));
  }
  // legacy / null inputs are not canonical => no access (callers normalize first).
  assert.equal(hasDriveFolderAccess("editing_2"), false);
  assert.equal(hasClientHubAccess(null), false);
});

test("tierAllowsFeature rejects non-canonical tiers", () => {
  assert.equal(tierAllowsFeature("foundations", "academy"), true);
  assert.equal(tierAllowsFeature("editing_2", "academy"), false);
  assert.equal(tierAllowsFeature(null, "content_planner"), false);
});
