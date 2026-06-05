---
name: Jarvis proposal lifecycle CAS
description: Every write to a Jarvis proposalState must be a guarded compare-and-swap or it clobbers the created/savedScriptId idempotency marker.
---

# Jarvis proposal lifecycle must be compare-and-swap

The AI Content Manager (Jarvis) proposal flow stores a `proposalState` JSON on
`ContentManagerMessage` and moves it through `proposed → confirming → created`
(or `declined`). The terminal `created` state carries `savedScriptId`, which is
the idempotency marker that prevents a second DRAFT `SavedScript` from being
created on a re-save.

**Rule:** any route/helper that writes `proposalState` (the save path in
`src/lib/jarvis/save.ts` AND the lifecycle transitions confirming/reopen/decline
in `src/app/api/jarvis/proposal/route.ts`) MUST use an atomic guarded update —
`updateMany` with `where: { id, proposalState: { path: ["status"], equals: <status-we-read> } }`
— and treat `count === 0` as a lost race (re-read + return current state / 409).
Never do a read-modify-unconditional-`update` on `proposalState`.

**Why:** a plain `update` reads the state once, computes `next`, and writes the
full object back. A stale `reopen`/`decline` arriving after a concurrent save
flipped status to `created` will overwrite it back to a non-created status,
**severing `savedScriptId`** and allowing a duplicate draft on the next save.
Architect flagged exactly this as a blocking race during task #55.

**How to apply:** mirror the save-claim pattern in both files whenever you add a
new proposal action or status. The loser of a save claim must also delete its
orphan `SavedScript`.
