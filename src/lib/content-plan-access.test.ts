import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePlanAccess } from "./content-plan-access";

const DELETED_AT = new Date("2026-05-30T12:00:00.000Z");

test("live plan owned by viewer → ok / 200", () => {
  const r = resolvePlanAccess({
    scopedPlan: { deletedAt: null },
    unscopedPlan: null,
    resolvedUserId: "u1",
    isAdmin: false,
  });
  assert.equal(r.reason, "ok");
  assert.equal(r.status, 200);
});

test("deleted plan owned by a MEMBER → 410 deleted, no admin payload", () => {
  const r = resolvePlanAccess({
    scopedPlan: { deletedAt: DELETED_AT },
    unscopedPlan: null,
    resolvedUserId: "u1",
    isAdmin: false,
  });
  assert.equal(r.reason, "deleted");
  assert.equal(r.status, 410);
  assert.equal(r.admin, undefined);
  assert.equal(r.deletedAt, undefined);
  assert.equal(r.ownerUserId, undefined);
});

test("deleted plan owned by viewer, ADMIN → 410 with date + owner", () => {
  const r = resolvePlanAccess({
    scopedPlan: { deletedAt: DELETED_AT },
    unscopedPlan: null,
    resolvedUserId: "member-1",
    isAdmin: true,
  });
  assert.equal(r.reason, "deleted");
  assert.equal(r.status, 410);
  assert.equal(r.admin, true);
  assert.equal(r.deletedAt, DELETED_AT.toISOString());
  assert.equal(r.ownerUserId, "member-1");
});

test("MEMBER, plan not visible → generic not_found, no unscoped lookup leak", () => {
  const r = resolvePlanAccess({
    scopedPlan: null,
    // Even if a row exists, a member must never learn about it.
    unscopedPlan: { userId: "someone-else", deletedAt: null },
    resolvedUserId: "member-1",
    isAdmin: false,
  });
  assert.equal(r.reason, "not_found");
  assert.equal(r.status, 404);
  assert.equal(r.admin, undefined);
  assert.equal(r.ownerUserId, undefined);
});

test("ADMIN, plan exists but belongs to another member → wrong_owner", () => {
  const r = resolvePlanAccess({
    scopedPlan: null,
    unscopedPlan: { userId: "member-B", deletedAt: null },
    resolvedUserId: "member-A",
    isAdmin: true,
  });
  assert.equal(r.reason, "wrong_owner");
  assert.equal(r.status, 404);
  assert.equal(r.admin, true);
  assert.equal(r.ownerUserId, "member-B");
  assert.equal(r.deletedAt, null);
});

test("ADMIN, wrong owner AND deleted → wrong_owner carries deletedAt", () => {
  const r = resolvePlanAccess({
    scopedPlan: null,
    unscopedPlan: { userId: "member-B", deletedAt: DELETED_AT },
    resolvedUserId: "member-A",
    isAdmin: true,
  });
  assert.equal(r.reason, "wrong_owner");
  assert.equal(r.deletedAt, DELETED_AT.toISOString());
  assert.equal(r.ownerUserId, "member-B");
});

test("ADMIN, plan truly does not exist → not_found", () => {
  const r = resolvePlanAccess({
    scopedPlan: null,
    unscopedPlan: null,
    resolvedUserId: "member-1",
    isAdmin: true,
  });
  assert.equal(r.reason, "not_found");
  assert.equal(r.status, 404);
});

test("ADMIN, owned-but-scoped-miss fallback → deleted with restore path", () => {
  const r = resolvePlanAccess({
    scopedPlan: null,
    unscopedPlan: { userId: "member-1", deletedAt: DELETED_AT },
    resolvedUserId: "member-1",
    isAdmin: true,
  });
  assert.equal(r.reason, "deleted");
  assert.equal(r.status, 410);
  assert.equal(r.ownerUserId, "member-1");
});
