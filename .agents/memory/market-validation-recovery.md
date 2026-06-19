---
name: Market-data validation recovery
description: How orphaned "validating" market-data uploads are reclaimed, and the invariant that keeps recovery from clobbering finished rows.
---

In-process market-data validation (`validateUploadAsync`) dies on process
teardown, leaving uploads stranded in `status="validating"` forever. The reclaim
layer is `src/lib/validation-recovery.ts`, started from `instrumentation.ts`:
boot sweep re-dispatches any pending/validating row; a periodic watchdog
re-dispatches rows stuck past the stale bound and, after the attempt budget,
marks them `failed` with a member-readable `validationError`.

**Invariant (do not regress):** every watchdog mutation that can change a row's
terminal state — the mark-`failed` write AND the `retryCount` increment — must be
a **status-guarded `updateMany`** (`where status in pending|validating`), never an
unconditional `update()`.

**Why:** under the durable-queue path the separate worker can flip a row to
`validated` between the watchdog's scan and its write; an unconditional update
would clobber a finished upload back to `failed`/inflate its retry count. The
guarded increment also doubles as a claim — `count===0` means the row went
terminal, so skip the re-dispatch.

**How to apply:** topology is single-VM (`deploymentTarget=vm`), so the in-memory
`inFlight` map suffices to stop the watchdog re-kicking a still-running job; the
durable-ON path additionally dedupes via pg-boss `singletonKey`. No DB lease /
schema column is needed. Keep idempotency cheap: `runValidation` reuses stored
`rawValidatorOutput` ($0) and refuses already-`validated` rows.
