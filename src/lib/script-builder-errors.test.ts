import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAnthropicError,
  makeScriptError,
  newTicketId,
  SCRIPT_ERROR_MESSAGES,
  SCRIPT_ERROR_STATUS,
  type ScriptErrorCategory,
} from "./script-builder-errors";

test("makeScriptError uses the default message when none supplied", () => {
  const e = makeScriptError("cost_cap_hit");
  assert.equal(e.category, "cost_cap_hit");
  assert.equal(e.message, SCRIPT_ERROR_MESSAGES.cost_cap_hit);
  assert.equal(e.details, undefined);
});

test("makeScriptError honours an override message + details", () => {
  const e = makeScriptError("validator_max_retries", "custom", {
    violations: [],
  });
  assert.equal(e.message, "custom");
  assert.deepEqual(e.details, { violations: [] });
});

test("every category has a default message and an HTTP status", () => {
  const categories: ScriptErrorCategory[] = [
    "validator_max_retries",
    "cost_cap_hit",
    "anthropic_timeout",
    "anthropic_overloaded",
    "insufficient_facts",
    "internal_error",
  ];
  for (const c of categories) {
    assert.ok(SCRIPT_ERROR_MESSAGES[c].length > 0, `${c} message`);
    assert.ok(SCRIPT_ERROR_STATUS[c] >= 400, `${c} status`);
  }
});

test("classifyAnthropicError: 529 → anthropic_overloaded", () => {
  const e = classifyAnthropicError({ status: 529, message: "Overloaded" });
  assert.equal(e.category, "anthropic_overloaded");
});

test("classifyAnthropicError: 503 → anthropic_overloaded", () => {
  assert.equal(
    classifyAnthropicError({ status: 503 }).category,
    "anthropic_overloaded",
  );
});

test("classifyAnthropicError: 429 rate limit → anthropic_overloaded", () => {
  assert.equal(
    classifyAnthropicError({ status: 429, message: "rate limit" }).category,
    "anthropic_overloaded",
  );
});

test("classifyAnthropicError: overloaded by name with no status", () => {
  assert.equal(
    classifyAnthropicError({ name: "OverloadedError" }).category,
    "anthropic_overloaded",
  );
});

test("classifyAnthropicError: timeout name → anthropic_timeout", () => {
  assert.equal(
    classifyAnthropicError({ name: "APIConnectionTimeoutError" }).category,
    "anthropic_timeout",
  );
});

test("classifyAnthropicError: AbortError → anthropic_timeout", () => {
  assert.equal(
    classifyAnthropicError({ name: "AbortError" }).category,
    "anthropic_timeout",
  );
});

test("classifyAnthropicError: 'timed out' message → anthropic_timeout", () => {
  assert.equal(
    classifyAnthropicError(new Error("Request timed out")).category,
    "anthropic_timeout",
  );
});

test("classifyAnthropicError: unknown → internal_error with ticket id", () => {
  const e = classifyAnthropicError(new Error("kaboom"));
  assert.equal(e.category, "internal_error");
  assert.ok(e.details?.ticketId, "has a ticket id");
});

test("newTicketId is non-empty and reasonably unique", () => {
  const a = newTicketId();
  const b = newTicketId();
  assert.ok(a.startsWith("sb2-"));
  assert.notEqual(a, b);
});
