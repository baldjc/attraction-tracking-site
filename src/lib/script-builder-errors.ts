/**
 * Structured error categories for the Script Builder v2 streaming generator.
 *
 * Mirrors the `classifyDriveError` / `DriveError` pattern in google-drive.ts:
 * every failure path in the generator (HTTP pre-flight, SSE retry loop,
 * Anthropic call) classifies a raw failure into ONE of these categories so the
 * route can emit a structured `error` SSE frame (or HTTP JSON body) and the
 * Content Editor's failure UI can map it to a specific member-facing message +
 * action button instead of the generic "closed the connection" string.
 */
import type { ScriptViolation } from "./script-content-rules";

export type ScriptErrorCategory =
  /** Generator hit the regeneration cap (or ran out of time to retry). The
   *  final error-severity violations that wouldn't clear are attached. */
  | "validator_max_retries"
  /** Member's monthly Content Tools cap reached (checked BEFORE the call). */
  | "cost_cap_hit"
  /** Anthropic call exceeded our per-attempt / overall time budget. */
  | "anthropic_timeout"
  /** Anthropic returned 529 / 503 / 429 (overloaded or rate-limited). */
  | "anthropic_overloaded"
  /** The plan's mode requires facts the linked set categorically can't
   *  satisfy — classified by the pre-flight BEFORE any Anthropic call. */
  | "insufficient_facts"
  /** Uncaught exception in the pipeline — logged with a ticket id. */
  | "internal_error";

/** Default member-facing copy per category. UIs may override with richer text. */
export const SCRIPT_ERROR_MESSAGES: Record<ScriptErrorCategory, string> = {
  validator_max_retries:
    "We couldn't write a script that passes your content rules. Try linking more facts or adjusting your script mode.",
  cost_cap_hit:
    "You've used 100% of this month's Content Tools. It refreshes on the 1st.",
  anthropic_timeout:
    "The model took longer than expected. Try again — this is usually transient.",
  anthropic_overloaded:
    "The model is overloaded right now. Try again in a couple minutes.",
  insufficient_facts:
    "This plan doesn't have enough validated facts for its script mode. Link more facts or run a data search.",
  internal_error: "Something went wrong. We've logged it.",
};

/** HTTP status to use when a category is surfaced via an HTTP response body
 *  (pre-flight / cost-cap paths that bail before the SSE stream opens). */
export const SCRIPT_ERROR_STATUS: Record<ScriptErrorCategory, number> = {
  validator_max_retries: 422,
  cost_cap_hit: 402,
  anthropic_timeout: 504,
  anthropic_overloaded: 503,
  insufficient_facts: 422,
  internal_error: 500,
};

export interface ScriptErrorDetails {
  /** validator_max_retries — the final unresolved error-severity violations. */
  violations?: ScriptViolation[];
  /** insufficient_facts — human-readable mode name + coverage counts. */
  modeName?: string;
  needed?: number;
  have?: number;
  /** insufficient_facts — which dimensions are uncovered (for the UI hint). */
  uncovered?: string[];
  /** anthropic_timeout — the time budget that was exceeded, in ms. */
  timeoutMs?: number;
  /** internal_error — opaque id for support correlation (also logged server-side). */
  ticketId?: string;
}

export interface ScriptError {
  category: ScriptErrorCategory;
  /** Member-facing message (defaults to SCRIPT_ERROR_MESSAGES[category]). */
  message: string;
  details?: ScriptErrorDetails;
}

/** Build a structured error with the default message unless one is supplied. */
export function makeScriptError(
  category: ScriptErrorCategory,
  message?: string,
  details?: ScriptErrorDetails,
): ScriptError {
  return {
    category,
    message: message ?? SCRIPT_ERROR_MESSAGES[category],
    ...(details ? { details } : {}),
  };
}

/** Short opaque ticket id for `internal_error`, logged server-side and shown
 *  to the member so a support request can be correlated to the stack trace. */
export function newTicketId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `sb2-${Date.now().toString(36)}-${rand}`;
}

/**
 * Classify a raw error thrown by the Anthropic SDK (or any downstream call in
 * the generation pipeline) into a `ScriptError`.
 *
 *   - 529 / 503 / 429            → anthropic_overloaded
 *   - timeout / abort (no status) → anthropic_timeout
 *   - anything else              → internal_error (with a fresh ticket id)
 *
 * Defensive shape-parsing (like classifyDriveError) — the SDK throws several
 * error subclasses; we read `status` / `name` / `message` rather than coupling
 * to concrete classes.
 */
export function classifyAnthropicError(err: unknown): ScriptError {
  const e = err as {
    status?: number;
    statusCode?: number;
    code?: number | string;
    name?: string;
    message?: string;
  };
  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.statusCode === "number"
        ? e.statusCode
        : typeof e?.code === "number"
          ? e.code
          : undefined;
  const name = (e?.name ?? "").toLowerCase();
  const msg = (e?.message ?? "").toLowerCase();

  // Overloaded / rate-limited — transient, "try again shortly".
  if (status === 529 || status === 503 || status === 429) {
    return makeScriptError("anthropic_overloaded");
  }
  if (
    name.includes("overloaded") ||
    msg.includes("overloaded") ||
    (status === undefined && msg.includes("rate limit"))
  ) {
    return makeScriptError("anthropic_overloaded");
  }

  // Timeout / abort — connection ran past our budget.
  if (
    name.includes("timeout") ||
    name === "aborterror" ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    (status === undefined && name.includes("connection"))
  ) {
    return makeScriptError("anthropic_timeout");
  }

  // Everything else — log + ticket id for support.
  const ticketId = newTicketId();
  return makeScriptError("internal_error", undefined, { ticketId });
}
