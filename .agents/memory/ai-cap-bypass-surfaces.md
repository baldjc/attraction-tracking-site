---
name: AI-cap bypass surface taxonomy
description: How the "unlimited" (admin / Done-With-You) AI-cap exemption must reach every member-facing warning/meter, and the two surface classes that need different handling.
---

# AI-cap exemption surfaces

`tierBypassesAiCap(serviceTier)` (currently `done_with_you`) + `role==="admin"` = "unlimited".
Defined ONCE in `service-tier.ts`. Both cap engines in `ai-tool-cost.ts` expose an
`unlimited: boolean` (true in the admin/bypass branch): `getMonthlyUsage` (v1) and
`getCostCapStatus` (v2). UIs/routes must consume `unlimited`, never re-derive cap math.

**Rule:** any member-facing limit warning/meter must render "Unlimited"/hide rather than
a near/at-limit message for unlimited actors.

**Why:** Done-With-You is high-touch — the team runs generations on the member's behalf,
so a monthly spend cap must never interrupt them, and they must never SEE a cap warning.

## Two surface classes
1. **Standard `cap.hardBlocked` / `percentUsed` gate** — auto-bypasses, because the engine
   forces `hardBlocked=false` / `percentUsed=0` / `softWarning=false` for unlimited actors.
   Examples: script-builder-v2, content-engine-v2, idea-validation, planner wizard routes,
   suggest-improvements, upload **retry**, Jarvis, ArcScriptChat/Upload `limitReached`.
2. **Routes that do their OWN remaining-budget math** — these IGNORE `hardBlocked` and compare
   `monthSpendUsd + estimate` (or `estimate > remaining`) against a FINITE `capUsd`, so an
   unlimited actor with a big estimate still gets a 402/over-budget. These MUST be guarded
   with `!cap.unlimited`. Known sites: `member/methodology-revalidate` (`overBudget`) and
   `member/market-data/upload` (estimated batch cost precheck). The upload comment used to
   wrongly claim "admins exempted via getCostCapStatus()" — capUsd is finite, so they weren't.

## Tier DISPLAY reconciliation (separate from the cap)
`Sidebar.tsx` hardcoded `roleLabel="Foundations Member"` for ALL members and impersonated-member
views, ignoring the fetched tier — that was the "admin says DWY, member sees Foundations" gap,
NOT a stale denormalised tier. There is no denormalised tier copy: NextAuth JWT stores only
id/email/role; serviceTier is read fresh via `/api/member/tier` + `resolveUserFromSession`.
Fix: derive the label from `tierLabel(memberTier)`, and fetch `/api/member/tier` ALSO when staff
impersonate a member (impersonation cookie makes that endpoint resolve to the impersonated member).

**How to apply:** when adding any new AI cost gate, prefer the `hardBlocked` gate; if you must do
manual budget math, short-circuit on `cap.unlimited`. When showing a tier anywhere, use the
canonical `tierLabel()` over hardcoded strings.
