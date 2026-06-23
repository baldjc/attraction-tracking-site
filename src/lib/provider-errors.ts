// Shared AI-provider error classification.
//
// WHY THIS EXISTS
// ---------------
// Two layers need the SAME notion of "is this Anthropic error transient (worth
// retrying) or permanent (the request itself is bad)":
//   1. callValidator's inner per-call backoff loop (fact-validator.ts) — a few
//      fast retries to ride out a momentary blip mid-run.
//   2. The outer failure handler (handleValidationFailure) — when a whole
//      validation pass dies, decide whether to schedule a slow background
//      auto-retry (transient) or surface an actionable "Failed" (permanent).
//
// Keeping the rule in one place stops the two layers from drifting — e.g. the
// inner loop retrying a 500 while the outer handler treats it as permanent and
// dead-ends the upload (exactly the bug this Wave fixes for Anthropic 500
// `api_error` "Internal server error").
//
// CLASSIFICATION
//   Transient (retry):
//     - HTTP status 408, 429, 500, 502, 503, 504, 529
//     - any 5xx status we don't otherwise recognise (default unknown 5xx →
//       transient — an upstream hiccup, not the member's payload)
//     - nested Anthropic error type: overloaded_error / rate_limit_error /
//       api_error / service_unavailable / timeout
//     - message text matching the transient regex (overload, rate limit,
//       connection reset/timeout, fetch failed, internal server error, stream
//       disconnect/interrupt, socket hang up, terminated/aborted, 5xx codes)
//   Permanent (don't auto-retry):
//     - 4xx other than 408/429 (invalid_request, authentication, permission,
//       not_found, 422) — the same payload will fail again, so retrying just
//       burns budget. These are surfaced as an actionable failure instead.

// Statuses we always treat as transient regardless of any other signal.
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

// Anthropic error `type` values (top-level or nested) that mean "try again".
const TRANSIENT_TYPES = new Set([
  "overloaded_error",
  "rate_limit_error",
  "api_error",
  "service_unavailable",
  "timeout",
]);

// Permissive message match. Streaming errors arrive with status=undefined and
// the real shape buried in err.message, so we also scan the string. Kept in
// sync with the catalogue regex in upload-error-messages.ts.
const TRANSIENT_MESSAGE_RE =
  /overloaded|rate.?limit|temporar|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|socket hang up|api_error|internal server error|service unavailable|stream (?:disconnect|interrupt)|\bterminated\b|\baborted\b|\b(?:500|502|503|504|529)\b/i;

interface MaybeAnthropicError {
  status?: number;
  statusCode?: number;
  error?: { type?: string; error?: { type?: string } };
  code?: string;
  message?: string;
}

/**
 * True when an error from the Anthropic SDK (or the surrounding network stack)
 * is a transient upstream condition worth retrying, rather than a permanent
 * problem with the request itself.
 *
 * Defensive: any unrecognised shape returns `false` (permanent) ONLY after the
 * 5xx default has been considered, so an unknown server error still retries.
 */
export function isTransientProviderError(err: unknown): boolean {
  const e = (err ?? {}) as MaybeAnthropicError;

  const status = e.status ?? e.statusCode;
  if (typeof status === "number") {
    if (TRANSIENT_STATUSES.has(status)) return true;
    // Default unknown 5xx → transient. A 4xx (other than 408/429 handled above)
    // is the request's fault and must NOT auto-retry.
    if (status >= 500 && status < 600) return true;
    if (status >= 400 && status < 500) return false;
  }

  if (e.error?.type && TRANSIENT_TYPES.has(e.error.type)) return true;
  if (e.error?.error?.type && TRANSIENT_TYPES.has(e.error.error.type)) return true;

  // Node network error codes (connection resets/timeouts) surface on .code.
  if (
    e.code &&
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(
      e.code,
    )
  ) {
    return true;
  }

  const msg = e.message ?? "";
  if (TRANSIENT_MESSAGE_RE.test(msg)) return true;

  return false;
}
