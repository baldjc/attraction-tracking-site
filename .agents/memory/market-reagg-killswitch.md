---
name: Market re-aggregation kill-switch
description: How the dual-run break-glass freeze of destructive market re-aggregation is wired, and the two non-obvious traps (orchestrator bypass + new-upload caveat).
---

# Market re-aggregation kill-switch

Break-glass control (`market_reaggregation_kill_switch`, object-form flag,
separate key from `planner_kill_switch`) that freezes **destructive
re-aggregation of EXISTING market data** during the dual-run window. Resolver
`isMarketReaggKillSwitchActiveForUser(userId)` mirrors the planner resolver
(raw AppSetting read, NO staff bypass, fail-OPEN + console.error, NOT in
DEFAULT_FLAGS). 423 + `code:"REAGGREGATION_PAUSED"` at routes.

## The two traps (why route-level guards alone are wrong)

1. **KB merge apply has a hidden second entry point.** Both the member apply
   route AND the Jarvis `/merge/confirm` route guard cleanly, but the in-chat
   `apply_merge` LLM tool reaches the destructive apply via the **orchestrator →
   `applyConfirmedMerge` → `applyMergeRun`**, never touching either route. A
   route-only guard leaves that path (and the durable worker, which runs an
   already-enqueued apply if the flag flips on post-enqueue) wide open.
   **Rule:** guard the SHARED PRIMITIVE. KB-apply funnels through `applyMergeRun`
   (`src/lib/kb-merge/merge-run.ts`) — self-guard it with a throw placed BEFORE
   the DRY_RUN→APPLYING CAS claim (so a frozen run stays DRY_RUN, resumable once
   lifted; the worker's handler already catches and leaves it resumable). Add a
   graceful `ok:false code:"paused"` in `applyConfirmedMerge` too so the
   orchestrator surfaces a clean chat message instead of a thrown 500.

2. **The caveat = do NOT deep-guard validation.** Brand-new monthly uploads MUST
   keep working (own uploadId, no prior rows to clobber). Validation re-agg
   shares `runValidation`/`dispatchValidation` between the new-upload route AND
   the re-validate routes — so guarding must stay at the RE-VALIDATE ROUTE level
   (admin revalidate by upload.userId; member methodology-revalidate by session
   user), NEVER inside `runValidation`, or you freeze new uploads too. KB-apply
   is the opposite case: `applyMergeRun` is ONLY ever existing-data re-agg, so
   deep-guarding it is safe and correct.

**Why:** the 6→0 Story Leads incident — a re-run delete-before-replaces the
shared `market_facts`/`aggregated_metrics`/`market_story_leads` the legacy AI
tools cite. The freeze protects that shared store; new uploads don't touch it.

## Scope nuance

KB **reset** must gate ONLY when `scope` includes market (`doMarket`); a
`kb`-only reset clears vocab/profiles/merge tables, not the shared market store,
so gating the whole route over-blocks. Gate after `doMarket` is computed.

`POST /api/debug/validate` re-runs validation on existing uploads but is
debug-only and intentionally left ungated — keep it off members during dual-run.

Operator runbook section: `docs/db-rollback-runbook.md` §3c.
