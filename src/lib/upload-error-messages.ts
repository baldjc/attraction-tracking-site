// Wave 1 Phase 2A — friendly error classifier for market-data uploads.
//
// Raw Anthropic / parser errors are useless to members ("input length 234567
// exceeds context limit"). This module maps them to a small catalogue of
// member-facing messages with explicit next-actions. Used by:
//   - UploadHistoryTable (modal + retry button)
//   - Admin failed-uploads view (categorisation + filtering)
//   - Backfill-completion email (per-month failure lines)
//
// Order matters: the big-file context-overflow case is checked BEFORE the
// generic context-overflow case so we route a 12K+ row member to "filter
// your territory" instead of telling them to click Retry forever.

export type UploadErrorCategory =
  | "file_too_large"
  | "context_overflow"
  | "cost_cap"
  | "save_timeout"
  | "stream_interrupted"
  | "provider_overloaded"
  | "parse_error"
  | "needs_review"
  | "unknown";

// DEFECT 2 — sentinel prefix written to MarketDataUpload.validationError when a
// re-validation degraded badly and we KEPT the member's prior data instead of
// swapping. The upload stays VALIDATED (its live data is intact); this note is
// purely informational. classifyUploadError() and UploadHistoryTable both detect
// this prefix to surface a "kept your existing data" message rather than an error.
export const NEEDS_REVIEW_PREFIX = "[needs-review]";

export interface FriendlyError {
  category: UploadErrorCategory;
  title: string;
  body: string;
  canRetry: boolean;
  nextAction: "retry" | "replace" | "contact_support" | "wait";
}

interface ClassifyContext {
  rowCount?: number;
  retryCount?: number;
}

export function classifyUploadError(
  rawError: string,
  upload: ClassifyContext = {},
): FriendlyError {
  const err = (rawError ?? "").toString();
  const rowCount = upload.rowCount ?? 0;

  // DEFECT 2 — degraded re-validation that KEPT the member's prior data. This is
  // an informational note on a still-VALIDATED upload, not a failure, so it is
  // checked first and routed to a reassuring "we kept your data" message.
  if (err.includes(NEEDS_REVIEW_PREFIX)) {
    const detail = err.split(NEEDS_REVIEW_PREFIX).join("").trim();
    return {
      category: "needs_review",
      title: "We kept your existing data",
      body:
        detail ||
        "This re-validation produced far fewer facts than you already had, so we " +
          "kept your existing data instead of replacing it. Your previous data is " +
          "unchanged and still in use.",
      canRetry: true,
      nextAction: "retry",
    };
  }

  // Internal token-overflow backstop. callValidator throws
  // "Input too large for 200K context: inputTokens=... remaining=-... < min ..."
  // when a single chunk still overruns the model context even after chunking.
  // This is NOT something the member can fix by clicking Retry (it's
  // deterministic — the same payload will overflow every time), so mark it
  // non-retryable and route to support rather than burning the retry budget.
  if (
    /input too large for \d+k context|remaining=-?\d+\s*<\s*min/i.test(err)
  ) {
    return {
      category: "file_too_large",
      title: "This month's data was too large to process",
      body:
        "This upload exceeded what we can analyze in a single pass. We've " +
        "been notified — please contact support with this upload ID and we'll " +
        "reprocess it for you. You don't need to keep retrying.",
      canRetry: false,
      nextAction: "contact_support",
    };
  }

  // Big-file branch takes priority: a context-overflow message PLUS a large
  // upload is almost always a real "this market is too big for one pass"
  // problem, not a one-off the member can retry their way out of.
  if (
    /input length.*exceeds.*context limit|context window|prompt is too long|max_tokens_to_sample/i.test(
      err,
    ) &&
    rowCount > 12_000
  ) {
    return {
      category: "file_too_large",
      title: "Your market is unusually large for our processor",
      body:
        "We process up to roughly 12,000 transactions per month. If you're " +
        "working a large metro, filter your MLS export to your specific " +
        "territory (your suburbs, zip codes, or neighbourhoods) before " +
        "uploading. Most agents only need their actual coverage area, not " +
        "the whole metro.",
      canRetry: false,
      nextAction: "replace",
    };
  }

  if (
    /input length.*exceeds.*context limit|context window|prompt is too long|max_tokens_to_sample/i.test(
      err,
    )
  ) {
    return {
      category: "context_overflow",
      title: "This month's data is unusually large",
      body:
        "We're processing files this size with a special path. This should " +
        "resolve automatically — click Retry. If it keeps failing, contact " +
        "support.",
      canRetry: true,
      nextAction: "retry",
    };
  }

  // DB save timed out. The AI step already succeeded (and was already paid for);
  // the failure is purely the database write blowing past Prisma's interactive
  // transaction budget (P2028 "expired transaction" / "Transaction ... 5000 ms
  // ... passed"). Re-validating reuses the stored AI output and re-tries only
  // the save — at no additional AI cost — so this is NOT something the member
  // should keep mashing Retry on; route to support, who can re-run persistence.
  if (
    /\bP2028\b|expired transaction|transaction.*\b\d{3,}\s*ms\b.*passed|transaction (?:was|already) (?:closed|expired)|transaction was 5000\s*ms/i.test(
      err,
    )
  ) {
    return {
      category: "save_timeout",
      title: "Your data was analyzed, but saving it timed out",
      body:
        "Your data is large enough that the save took longer than expected and " +
        "timed out. The good news: the analysis already completed, so re-trying " +
        "this upload will just re-save the results — at no additional cost. " +
        "We've been notified; please contact support with this upload ID if it " +
        "doesn't resolve shortly.",
      canRetry: false,
      nextAction: "contact_support",
    };
  }

  if (/cost cap reached|monthly AI|monthly cost cap|cost_cap/i.test(err)) {
    return {
      category: "cost_cap",
      title: "Monthly AI budget reached",
      body:
        "You've used your processing budget for this month. Your cap resets " +
        "on the 1st, or contact admin to discuss your tier.",
      canRetry: false,
      nextAction: "wait",
    };
  }

  if (/terminated|aborted|stream.?disconnect|ECONNRESET|socket hang up/i.test(err)) {
    return {
      category: "stream_interrupted",
      title: "Connection interrupted",
      body:
        "The AI provider's connection dropped mid-process. This is usually " +
        "temporary. Click Retry.",
      canRetry: true,
      nextAction: "retry",
    };
  }

  if (/overloaded|429|rate.?limit|529|503/i.test(err)) {
    return {
      category: "provider_overloaded",
      title: "AI provider is busy",
      body:
        "Anthropic is experiencing high load. Wait 1-2 minutes and click Retry.",
      canRetry: true,
      nextAction: "retry",
    };
  }

  if (/parse|CSV|column|header|invalid.*format|malformed/i.test(err)) {
    return {
      category: "parse_error",
      title: "Couldn't read this file",
      body:
        "The CSV format doesn't match what we expected. Check that the file " +
        "has the standard columns and a YYYY-MM date in the filename. Then " +
        "upload again.",
      canRetry: false,
      nextAction: "replace",
    };
  }

  return {
    category: "unknown",
    title: "Something unexpected happened",
    body:
      "Click Retry to try again. If it keeps failing, contact support and " +
      "reference this upload ID.",
    canRetry: true,
    nextAction: "contact_support",
  };
}

export const ERROR_CATEGORY_LABELS: Record<UploadErrorCategory, string> = {
  file_too_large: "File too large",
  context_overflow: "Context overflow",
  cost_cap: "Cost cap reached",
  save_timeout: "Save timed out",
  stream_interrupted: "Stream interrupted",
  provider_overloaded: "Provider overloaded",
  parse_error: "Parse error",
  needs_review: "Kept existing data",
  unknown: "Unknown",
};
