---
name: AI hard-cap impersonation exemption
description: The durable policy/invariants for letting an admin-impersonating-a-member bypass the monthly AI cost-cap hard block.
---

# AI hard-cap impersonation exemption

A real admin impersonating a member must keep generating even when that member
is over the monthly AI cost cap (so admins can pilot-test in the member's
context). The policy lives in ONE predicate — "real admin AND impersonating" —
so the ~handful of generation routes don't drift.

**Invariants that must NOT regress:**
- The exemption is admin-only; editors are never exempt.
- Real, non-impersonated members stay fully capped.
- Tokens are STILL logged on the exempt path — the member's spend accrues;
  exemption only skips the 402 hard block.
- Every NEW AI-generation route that hard-blocks on the cap must reuse the same
  predicate, or admins silently lose the bypass. This is the same
  "enforcement points duplicated across routes" failure mode that recurs in
  this codebase (cf. the script fact-gate).

**Why:** centralizing the policy in one predicate (not inline booleans per
route) is what keeps the callsites from drifting.

# Two cap engines — tier bypass must hit BOTH

AI cap enforcement runs through TWO functions, and a new exemption (e.g. a
whole tier) must be applied in BOTH or it leaks:
- **v2 `getCostCapStatus()`** — every modern metered route gates on its
  `hardBlocked` (Jarvis, Script Builder v2, Content Engine v2, idea validation,
  market-data, knowledge-base, planner wizard, …).
- **v1 `getMonthlyUsage()`** (backs `checkCostCap()`) — legacy AI tools still
  gate here (description / theme / listing-video / ARC script builders).

**Tier-based bypass:** the set of tiers that bypass the cap entirely lives in
ONE predicate — `tierBypassesAiCap()` / `AI_CAP_BYPASS_TIERS` in
`service-tier.ts`. Both engines short-circuit on `role==="admin" ||
tierBypassesAiCap(serviceTier)`, mirroring the admin path (synthetic unlimited).
**Done-With-You** (`done_with_you`, snake_case — also aliased donewithyou/dwy in
`normalizeLegacyTier`) bypasses the cap because the team runs generations on the
member's behalf.

**Why:** centralizing the tier list in one predicate (not inline per engine or
per route) is what keeps the ~20 callsites from drifting — same failure mode as
the impersonation exemption above.

**Gotcha:** admin/DWY short-circuits return synthetic usage (monthSpendUsd:0,
remaining:ADMIN_REMAINING) — don't treat `getMonthlyUsage` as a spend-analytics
source for those actors. The bypass is unconditional (ignores
`aiToolsMonthlyCapOverride`), intentionally matching how admins ignore it.

# Admin reset of current-period usage

An admin-only action can wipe a member's current-period AI usage. The delete
window must match exactly the window the cost-cap status sums, or before/after
spend becomes incoherent. The reset is admin-only and member-scoped (editors
rejected). The default cost cap observed in prod is **$100** (not $20).
