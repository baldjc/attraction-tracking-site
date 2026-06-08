---
name: runValidation reuse re-persist
description: How to re-persist an already-validated upload's facts through the fixed validator at $0, given the idempotency guard.
---

# Re-persisting a validated upload through the validator

`runValidation(uploadId)` short-circuits when the upload's status is already
`"validated"` (idempotency guard) — so after a validator-side fix you cannot just
call it to re-persist facts for an upload that already validated.

There are two distinct re-run modes, both keyed off `rawValidatorOutput`:
- **Full re-run (paid):** clear `rawValidatorOutput`; the AI runs again. The
  admin re-validate route does this.
- **Persistence-only reuse ($0):** KEEP `rawValidatorOutput`; the run
  reconstructs facts/leads from the stored blob and re-persists with NO Claude
  call, NO double-charge.

**To re-persist a fix (e.g. corrected labels) at $0:** flip status OFF
`"validated"` (e.g. to `"failed"`) while keeping `rawValidatorOutput`, then call
`runValidation`. It takes the reuse path, re-persists through the real fixed
persist tail, and resets status back to `"validated"` itself. This exercises the
actual production persist code, not a side script — the strongest verification.

**Why:** the persist tail is the single convergence point for both the live and
reuse paths, so re-persisting via reuse proves the fix on the exact code path
real uploads use.

**Gotcha:** the dashboard briefing is cached per (userId, monthYear) and only
checks uploadId, not fact content — after re-persisting facts you must delete the
cached briefing row or the member keeps seeing the stale generation.
