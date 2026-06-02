---
name: Script Builder v2 stream wall-budget & terminal frames
description: Why the SSE generator overran maxDuration and the two invariants that prevent silent "connection closed" errors.
---

# Script Builder v2 streaming generator — wall budget & terminal frames

The `/api/ai-tools/script-builder-v2` route streams a script over SSE inside a
function with a hard `maxDuration` wall (300s). The validator retry loop runs up
to MAX_REPROMPTS+1 full Anthropic generations. The original "closed the
connection before finishing" error was the platform killing the function
mid-stream on a late retry — no terminal SSE frame reached the client, so it fell
back to a generic error.

## Two invariants that must hold

1. **Per-attempt Anthropic timeout must be dynamically capped to the remaining
   budget**, not a static constant. A static per-attempt timeout (e.g. 180s) lets
   a retry that passed the start-guard at ~125s stream for a full 180s and overrun
   the wall mid-stream. Cap it to `min(STATIC_TIMEOUT, max(0, BUDGET - elapsed))`
   where the budget sits below the wall (e.g. 255s under a 300s wall) leaving slack
   for post-stream validation/billing/emit. The retry start-guard (skip a retry
   when `elapsed + reserve > budget`) is necessary but NOT sufficient on its own.

   **Why:** the start-guard only bounds *when* a retry begins, not *how long* the
   call runs once started. Both together hard-bound total stream wall time.

2. **Every in-stream exit path must emit a terminal categorized `error` frame.**
   The Anthropic-specific catch isn't enough — `validateScript`, the auto-fix
   passes, `logUsage`, `getCostCapStatus`, etc. throw outside it. Wrap the whole
   in-stream body in an outer `catch` (before the `finally` that closes the
   controller) that classifies via the shared classifier (unknown → internal_error
   + ticket) and emits, unless the client already aborted. The `emit()` helper
   swallows enqueue-on-closed errors, so emitting late is safe.

   **Why:** without a terminal frame the client can't distinguish a real failure
   from a dropped connection and shows the generic error.

## How to apply
Any change to the retry loop, the time budget, or the set of awaited calls inside
the stream `start()` must preserve both invariants. If you add a new awaited
operation after the Anthropic stream, confirm it's inside the outer try (covered
by the safety-net catch) and that its worst-case time fits the post-budget slack.
