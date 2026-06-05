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

# Admin reset of current-period usage

An admin-only action can wipe a member's current-period AI usage. The delete
window must match exactly the window the cost-cap status sums, or before/after
spend becomes incoherent. The reset is admin-only and member-scoped (editors
rejected). The default cost cap observed in prod is **$100** (not $20).
