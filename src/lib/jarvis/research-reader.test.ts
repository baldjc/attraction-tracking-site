/**
 * Research Reader acceptance tests.
 *
 * Run: `npx tsx --test src/lib/jarvis/research-reader.test.ts`
 *
 * Covers two of the three Research Reader acceptance guarantees as pure
 * runtime unit tests (the third — "approve creates a Planner item" — is a
 * DB-write integration concern verified against `saveConfirmedScript`'s
 * `ContentPlan.create` path, not unit-testable without writing rows to the
 * shared Postgres):
 *
 *   (a) A figure that came from an attached EXTERNAL research source must
 *       never be emitted as the member's OWN market number.
 *   (b) An item that can't be read is REPORTED as a failure, never silently
 *       dropped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkResearchStatAsMember } from "../script-content-rules";
import { parseExtractionJson, coerceExtractedClaims } from "./research-ingest";

/* ── (a) research stat never spoken as the member's own market number ───── */

const RESEARCH_STATS = [
  "U.S. existing-home inventory rose 22% year-over-year in April 2026.",
];

test("(a) research figure spoken as the member's OWN number is a hard fail", () => {
  const script =
    "Here's what jumped out: we pulled the numbers and our market is up 22% on inventory.";
  const violations = checkResearchStatAsMember(script, RESEARCH_STATS, [], []);
  assert.equal(violations.length, 1, "exactly one violation expected");
  assert.equal(violations[0].rule, "research_stat_as_member");
  assert.equal(violations[0].severity, "error");
});

test("(a) research figure kept clearly EXTERNAL is allowed", () => {
  const script =
    "A recent national report found inventory rose 22% year-over-year — here's why that matters for us.";
  const violations = checkResearchStatAsMember(script, RESEARCH_STATS, [], []);
  assert.equal(violations.length, 0, "external attribution must not flag");
});

test("(a) a figure that is ALSO in the member's own data is legitimately theirs", () => {
  // The same 22% appears in the member's cited facts → the member-attribution
  // is correct and must not be flagged.
  const script = "Our market is up 22% on inventory this spring.";
  const violations = checkResearchStatAsMember(
    script,
    RESEARCH_STATS,
    [],
    [{ raw: "22%" }],
  );
  assert.equal(violations.length, 0, "shared number must not flag");
});

test("(a) no research stats supplied → nothing to enforce", () => {
  const script = "Our market is up 22% on inventory this spring.";
  assert.equal(checkResearchStatAsMember(script, undefined, [], []).length, 0);
  assert.equal(checkResearchStatAsMember(script, [], [], []).length, 0);
});

/* ── (b) unreadable item is REPORTED, never silently dropped ────────────── */

test("(b) model self-report of unreadable surfaces the reason", () => {
  const parsed = parseExtractionJson(
    '{"unreadable": true, "reason": "scanned image with no extractable text"}',
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.reason, /scanned image/);
  }
});

test("(b) empty extraction (no thesis/claims/stats) is reported as a failure", () => {
  const parsed = parseExtractionJson('{"title":"x","thesis":"","claims":[],"stats":[]}');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.ok(parsed.reason.length > 0);
});

test("(b) malformed model output is reported, not thrown", () => {
  const parsed = parseExtractionJson("not json at all");
  assert.equal(parsed.ok, false);
});

test("(b) a readable item parses into title + claims + stats", () => {
  const parsed = parseExtractionJson(
    '```json\n{"title":"Inventory report","thesis":"Inventory is rising.",' +
      '"claims":["Supply outpaced demand."],"stats":["Inventory rose 22%."]}\n```',
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.title, "Inventory report");
    assert.deepEqual(parsed.extracted.claims, ["Supply outpaced demand."]);
    assert.deepEqual(parsed.extracted.stats, ["Inventory rose 22%."]);
  }
});

test("(b) coerceExtractedClaims tolerates junk persisted JSON", () => {
  const c = coerceExtractedClaims({ thesis: 1, claims: ["ok", 2, null], stats: "nope" });
  assert.equal(c.thesis, "");
  assert.deepEqual(c.claims, ["ok"]);
  assert.deepEqual(c.stats, []);
  // Fully-absent value → empty shape, never a throw.
  assert.deepEqual(coerceExtractedClaims(undefined), { thesis: "", claims: [], stats: [] });
});
