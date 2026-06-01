/**
 * Unit tests for the structured Drive error classification used by every Drive
 * folder write path (createVideoFolder / createMemberFolder / ensureVideoFolderForPlan)
 * and surfaced to the member UI via the content-plan routes.
 *
 * Run: `npx tsx --test src/lib/google-drive-errors.test.ts`
 *
 * Covers:
 *   - All 7 categories have copy + an HTTP status.
 *   - DriveError carries the right userMessage for its category.
 *   - classifyDriveError maps googleapis-shaped errors (numeric code, string
 *     code, `errors[].reason`, message text) onto the right category.
 *   - A DriveError passes through classifyDriveError unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DriveError,
  DRIVE_ERROR_MESSAGES,
  DRIVE_ERROR_STATUS,
  classifyDriveError,
  type DriveErrorCategory,
} from "./google-drive";

const ALL_CATEGORIES: DriveErrorCategory[] = [
  "not_configured",
  "auth_failed",
  "permission_denied",
  "quota_exceeded",
  "rate_limited",
  "not_found",
  "unknown",
];

test("there are exactly 7 categories and each has copy + a status", () => {
  assert.equal(ALL_CATEGORIES.length, 7);
  for (const cat of ALL_CATEGORIES) {
    assert.ok(DRIVE_ERROR_MESSAGES[cat] && DRIVE_ERROR_MESSAGES[cat].length > 0, `message for ${cat}`);
    assert.ok(typeof DRIVE_ERROR_STATUS[cat] === "number", `status for ${cat}`);
  }
  assert.equal(Object.keys(DRIVE_ERROR_MESSAGES).length, 7);
  assert.equal(Object.keys(DRIVE_ERROR_STATUS).length, 7);
});

test("DriveError carries the userMessage for its category", () => {
  for (const cat of ALL_CATEGORIES) {
    const e = new DriveError(cat);
    assert.equal(e.category, cat);
    assert.equal(e.userMessage, DRIVE_ERROR_MESSAGES[cat]);
    assert.equal(e.name, "DriveError");
    assert.ok(e instanceof Error);
  }
});

test("classifyDriveError passes a DriveError through unchanged", () => {
  const original = new DriveError("quota_exceeded", "boom");
  assert.equal(classifyDriveError(original), original);
});

test("numeric HTTP codes map to the right category", () => {
  assert.equal(classifyDriveError({ code: 401 }).category, "auth_failed");
  assert.equal(classifyDriveError({ code: 429 }).category, "rate_limited");
  assert.equal(classifyDriveError({ code: 404 }).category, "not_found");
  assert.equal(classifyDriveError({ code: 403 }).category, "permission_denied");
  assert.equal(classifyDriveError({ code: 507 }).category, "quota_exceeded");
  assert.equal(classifyDriveError({ code: 500 }).category, "unknown");
});

test("403 with a storage-quota reason is quota_exceeded, not permission_denied", () => {
  assert.equal(
    classifyDriveError({ code: 403, errors: [{ reason: "storageQuotaExceeded" }] }).category,
    "quota_exceeded",
  );
  assert.equal(
    classifyDriveError({ code: 403, message: "Service Accounts do not have storage quota." }).category,
    "quota_exceeded",
  );
});

test("googleapis `errors[].reason` drives classification when present", () => {
  assert.equal(classifyDriveError({ errors: [{ reason: "userRateLimitExceeded" }] }).category, "rate_limited");
  assert.equal(classifyDriveError({ errors: [{ reason: "rateLimitExceeded" }] }).category, "rate_limited");
  assert.equal(classifyDriveError({ errors: [{ reason: "notFound" }] }).category, "not_found");
  assert.equal(classifyDriveError({ errors: [{ reason: "authError" }] }).category, "auth_failed");
});

test("auth failures are detected from message text", () => {
  assert.equal(classifyDriveError({ message: "invalid_grant: account not found" }).category, "auth_failed");
  assert.equal(classifyDriveError({ message: "Invalid Credentials" }).category, "auth_failed");
});

test("status can arrive as `status` instead of `code`", () => {
  assert.equal(classifyDriveError({ status: 429 }).category, "rate_limited");
  assert.equal(classifyDriveError({ status: 404 }).category, "not_found");
});

test("unrecognised errors fall back to unknown", () => {
  assert.equal(classifyDriveError(new Error("???")).category, "unknown");
  assert.equal(classifyDriveError(null).category, "unknown");
  assert.equal(classifyDriveError(undefined).category, "unknown");
  assert.equal(classifyDriveError("a string").category, "unknown");
});

test("nested Gaxios `response.status` is classified, not degraded to unknown", () => {
  assert.equal(classifyDriveError({ response: { status: 401 } }).category, "auth_failed");
  assert.equal(classifyDriveError({ response: { status: 429 } }).category, "rate_limited");
  assert.equal(classifyDriveError({ response: { status: 404 } }).category, "not_found");
  assert.equal(classifyDriveError({ response: { status: 403 } }).category, "permission_denied");
});

test("nested Gaxios `response.data.error` (code/reason/message) is classified", () => {
  assert.equal(
    classifyDriveError({ response: { data: { error: { code: 429 } } } }).category,
    "rate_limited",
  );
  assert.equal(
    classifyDriveError({
      response: { data: { error: { code: 403, errors: [{ reason: "storageQuotaExceeded" }] } } },
    }).category,
    "quota_exceeded",
  );
  assert.equal(
    classifyDriveError({
      response: { data: { error: { message: "invalid_grant: token expired" } } },
    }).category,
    "auth_failed",
  );
});
