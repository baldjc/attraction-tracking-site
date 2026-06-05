---
name: Jarvis proposal lifecycle CAS
description: Every write to a Jarvis proposalState must be a guarded compare-and-swap or it clobbers the created/savedScriptId idempotency marker.
---

# Jarvis proposal lifecycle must be compare-and-swap

The AI Content Manager (Jarvis) proposal flow stores a `proposalState` JSON that
moves through `proposed → confirming → created` (or `declined`). The terminal
`created` state carries `savedScriptId`, the idempotency marker that prevents a
second DRAFT being created on a re-save.

**Rule:** any code path that writes `proposalState` — both the gated save and the
lifecycle transitions (confirming/reopen/decline) — MUST use an atomic guarded
update (compare-and-swap on the current status) and treat "0 rows affected" as a
lost race (re-read + return current state / 409). Never read-modify-then-write
the whole object unconditionally.

**Why:** an unconditional write recomputes from a stale read. A late
`reopen`/`decline` arriving after a concurrent save already flipped status to
`created` will overwrite it back to a non-created status, **severing
`savedScriptId`** and allowing a duplicate draft on the next save. This was a
blocking race caught in review during the Jarvis build.

**How to apply:** mirror the existing save-claim CAS whenever you add a new
proposal action or status, and have the loser of a save claim delete its orphan
draft.
