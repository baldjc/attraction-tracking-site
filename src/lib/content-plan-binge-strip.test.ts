/**
 * Unit tests for the soft-delete leak guard on the self-referential binge
 * chain. A live plan that points at a soft-deleted `bingeVideo` target must not
 * hydrate that deleted plan into the client payload (Prisma can't filter the
 * to-one relation inside `include`, so we null it out post-query).
 *
 * Run: `npx tsx --test src/lib/content-plan-binge-strip.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { hideDeletedBingeTarget, hideDeletedBingeTargets } from "./content-plan-utils";

test("nulls a soft-deleted binge target", () => {
  const plan = { id: "a", bingeVideo: { id: "b", title: "B", deletedAt: new Date() } };
  hideDeletedBingeTarget(plan);
  assert.equal(plan.bingeVideo, null);
});

test("keeps a live binge target", () => {
  const target = { id: "b", title: "B", deletedAt: null };
  const plan = { id: "a", bingeVideo: target };
  hideDeletedBingeTarget(plan);
  assert.equal(plan.bingeVideo, target);
});

test("tolerates a missing/null binge target", () => {
  const a = { id: "a", bingeVideo: null };
  hideDeletedBingeTarget(a);
  assert.equal(a.bingeVideo, null);

  const b = { id: "b" } as { id: string; bingeVideo?: { deletedAt?: Date | null } | null };
  assert.doesNotThrow(() => hideDeletedBingeTarget(b));

  assert.equal(hideDeletedBingeTarget(null), null);
});

test("array variant strips each deleted target in place", () => {
  const plans = [
    { id: "1", bingeVideo: { id: "x", deletedAt: new Date() } },
    { id: "2", bingeVideo: { id: "y", deletedAt: null } },
    { id: "3", bingeVideo: null },
  ];
  const out = hideDeletedBingeTargets(plans);
  assert.equal(out, plans);
  assert.equal(plans[0].bingeVideo, null);
  assert.ok(plans[1].bingeVideo);
  assert.equal(plans[2].bingeVideo, null);
});
