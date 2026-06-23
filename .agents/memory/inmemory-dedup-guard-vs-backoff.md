---
name: In-memory in-flight guard vs short backoff
description: Why a TTL-only dedup guard starves short-backoff auto-retries, and the safe clear-on-settle fix.
---

An in-memory "in-flight" dedup guard (a `Map<id, timestamp>` with a TTL) that is
SET at dispatch but only CLEARED by TTL expiry will STARVE any retry whose
backoff is shorter than the TTL. Market-data validation hit this: a transient
Anthropic failure reschedules the row with a 1m/2m/5m… backoff, but the in-flight
marker (25-min TTL) made the 60s due-sweep skip the row for up to 25 minutes.

**Why:** the in-memory guard's real job is narrow — stop the stale **watchdog**
from re-dispatching a row whose run is *currently executing*. The actual
cross-tick dedupe boundary is the **DB claim** (`runDueAutoRetries` atomically
nulls `nextAttemptAt` in a guarded `updateMany`; the watchdog increments
`retryCount` guarded on the non-terminal set). The in-memory marker is only a
mid-run shield, so it must be released the moment the run ends.

**How to apply:** clear the marker in the executor's settle path
(`validateUploadAsync(...).finally()` → `clearInFlight(uploadId)`), NOT by TTL.
Clear-on-settle is safe because a settled row is either terminal (watchdog scans
non-terminal only) or carries a FUTURE `nextAttemptAt` (watchdog scans
`nextAttemptAt: null` only) — so it can't be double-dispatched, and the next due
sweep can fire it immediately. Keep the TTL only as a crash backstop (process
killed before `finally`). The guard lives in its own dependency-free module
(`validation-inflight.ts`) so the executor and the scheduler share one Map
without an import cycle.

**Out of scope / residual:** the durable_job_queue path runs the work in a
SEPARATE worker process, so the web process's in-memory marker can't be cleared
by the worker — but pg-boss singletonKey dedups redundant enqueues, and that path
is default-OFF.
