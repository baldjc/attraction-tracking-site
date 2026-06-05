/**
 * Unit tests for the admin-impersonation hard-cap exemption predicate.
 *
 * Invariant: ONLY a real admin actor who is currently impersonating a member is
 * exempt from the monthly hard block. Real (non-impersonated) members — and
 * non-admin actors — must stay fully capped.
 *
 * Run: `npx tsx --test src/lib/ai-tool-cost.test.ts`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isHardCapExempt } from "./ai-tool-cost";

test("admin impersonating a member is exempt", () => {
  assert.equal(isHardCapExempt({ isAdmin: true, isImpersonating: true }), true);
});

test("real (non-impersonated) member is NOT exempt", () => {
  assert.equal(isHardCapExempt({ isAdmin: false, isImpersonating: false }), false);
});

test("admin NOT impersonating is NOT exempt (uses the normal admin path)", () => {
  assert.equal(isHardCapExempt({ isAdmin: true, isImpersonating: false }), false);
});

test("non-admin impersonating (e.g. editor) is NOT exempt", () => {
  assert.equal(isHardCapExempt({ isAdmin: false, isImpersonating: true }), false);
});

test("null / undefined actor is NOT exempt", () => {
  assert.equal(isHardCapExempt(null), false);
  assert.equal(isHardCapExempt(undefined), false);
});
