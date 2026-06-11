---
name: Jarvis refine-to-planner save-back
description: How "Regenerate" refine threads route an approved draft back to the SAME ContentPlan, and why the target must survive thread reopen.
---

# Jarvis refine save-back targets the same plan

Planner "↻ Regenerate" no longer does a blind one-shot rebuild. It writes a refine seed (planId + framing prompt), routes to `/member/jarvis?thread=new`, Jarvis loads the plan context and asks what to change, and on approval the refined draft UPDATES the same ContentPlan in place (ownership + `deletedAt:null` guarded) instead of creating a duplicate.

The hand-off id flows: seed → client `refinePlanId` (POST body) → route validates ownership → orchestrator stamps `targetContentPlanId` onto every proposal → `save.ts` updates that plan when set+owned, else falls back to create / reuse-by-`linkedScriptId`.

**Why the target must be recoverable, not just client-sent:** the client only sends `refinePlanId` on the seeded first turn. On thread reopen/reload/resume, client state is lost and later turns omit it. If the route only read the body, a follow-up refine would produce a proposal with no `targetContentPlanId`, and the approved save would fall back to CREATE → duplicate plan (violates the "never a duplicate" requirement).

**How to apply:** the refine target is already persisted durably as `proposalState.targetContentPlanId` on each assistant message. The route must recover it: when the POST body omits a valid `refinePlanId`, scan the thread's prior assistant `proposalState` rows (asc order, last wins) for `targetContentPlanId`, then re-validate ownership+liveness before handing to the orchestrator. This is the lightweight alternative to a dedicated thread column — no migration, survives reopen. Normal (non-refine) threads never carry the field, so there's no over-capture. Don't drop the body-path precedence (the seeded turn).
