---
name: AI hard-cap impersonation exemption
description: Where/how the monthly AI cost-cap hard block is bypassed for an admin impersonating a member, and the invariants that must hold across all generation routes.
---

# AI hard-cap impersonation exemption

A real admin (role `admin`) impersonating a member must be able to keep
generating even when that member is over the monthly AI cost cap, so admins can
pilot-test in the member's context. The policy lives in ONE predicate:

`isHardCapExempt(actor) === actor.isAdmin && actor.isImpersonating` (in
`src/lib/ai-tool-cost.ts`). `ResolvedUser.isAdmin` reflects the *real* signed-in
account's role, and `isImpersonating` is true only in "Working for: …" mode — so
the predicate is exactly "real admin impersonating a member."

**Enforcement points (keep in lockstep — same family as the script fact-gate):**
every interactive generation route guards as
`if (cap.hardBlocked && !isHardCapExempt(resolved)) { …402… }`. Current callsites:
script-builder-v2, jarvis, content-engine-v2, idea-validation, and
script-builder-v2/suggest-improvements. Any NEW AI-generation route that hard-
blocks on the cap must add the same guard or admins silently lose the bypass.
(script-builder-v2's *second* getCostCapStatus call is telemetry-only — no guard.)

**Invariants that must NOT regress:**
- Editors are NOT exempt (predicate requires `isAdmin`, i.e. role === "admin").
- Real, non-impersonated members stay fully capped.
- Tokens are STILL logged on the exempt path — `logUsage()` (or the direct
  `AIToolUsage` write in suggest-improvements) runs after generation regardless,
  so the member's spend still accrues; exemption only skips the 402 block.

**Why:** centralizing the policy in one predicate (not inline booleans) is what
keeps the ~5 callsites from drifting; this mirrors the recurring "enforcement
points duplicated across routes" failure mode in this codebase.

# Admin reset of current-period usage

`resetCurrentPeriodUsage(userId)` (same file) does
`aIToolUsage.deleteMany({ userId, createdAt: { gte: startOfMonth() } })` — the
exact window `getCostCapStatus()` sums, so before/after spend stays coherent.
Exposed at admin-only POST `/api/admin/members/[id]/reset-ai-usage` (rejects
editors via `isAdmin`, member-scoped via `canStaffAccessMember`) and surfaced as
a "Reset AI usage (this period)" button on the admin member page (hidden for
editors). The default cost cap observed in prod is **$100** (not $20).
