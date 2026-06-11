---
name: Planner kill-switch coverage
description: The launch-gate planner kill-switch must guard EVERY contentPlan.create path, not just the obvious one.
---

# Planner kill-switch coverage

The launch-gate **`planner_kill_switch`** (in `src/lib/feature-flags.ts`, resolver
`isPlannerKillSwitchActiveForUser(userId)`) halts Content-Plan creation per-member
or globally without a DB restore. It returns 423 `PLANNER_PAUSED` before any write.

**Rule:** the 423 guard must be on **every** `contentPlan.create` callsite or the
halt is bypassable. There are four (all gated):
- `POST /api/member/content-plans` — by session member id
- `POST /api/member/content-planner/wizard/use-as-video` — by session member id (writes inside a `tx`; gate BEFORE the transaction)
- `POST /api/member/content-planner/wizard/save-idea` — by session member id
- `POST /api/admin/members/[id]/content-plans` — by **target** member id (admin/migration create-for-member path; resolver has no staff bypass, so admins are halted for a killed member — intended)

**Why:** the member-data migration moves work in by creating plans; gating only one
create route (the first architect review FAILed for exactly this) leaves the others
open and the rollout can't truly be paused.

**How to apply:** before trusting the switch, `rg "contentPlan\.create" src/app/api`
and confirm each member/admin create path has the guard. GET/edits are intentionally
left open so members keep full read access while creation is paused.

**Resolver design notes (durable):**
- Reads the raw `feature_visibility` AppSetting directly (NOT via `getFeatureFlags`) so there is NO staff bypass — mirrors `isDurableQueueEnabledForUser`.
- Object form: `{enabled:true}` = global halt; `{enabled:false,allowedUserIds:[id]}` = per-member halt; `{enabled:false,allowedUserIds:[]}` = resume. `resolveFlag` TRUE = halted.
- Deliberately NOT in `DEFAULT_FLAGS` / the `FeatureFlags` interface (relies on the index signature) so the admin feature-visibility PUT shape-preservation contract permits first-time setting it as an object (a boolean default would lock it to boolean).
- **Fail-OPEN** on read error (returns false = not halted) + a loud `console.error` — a flaky config read must not self-DOS the planner; incident response flips the switch deliberately. Watch logs for `[planner_kill_switch] flag read failed`.
