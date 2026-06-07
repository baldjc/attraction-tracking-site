---
name: Jarvis 90-day pooled SoT + access gating
description: Two recurring "please add X" requests that are already done — diagnose before re-implementing.
---

# 90-day pooled SoT metrics (incl. MOI) are already wired in the Jarvis path

The trailing-90-day pooled read injects MEDIAN, SP_LP, DOM, **MOI**, and FAILURE_RATE
as period-scoped SoT rows (`90-day pooled (YYYY-MM–YYYY-MM)`) into the SAME
`sourceOfTruthMetrics` array used for the current month — in BOTH the script-builder-v2
route AND the Jarvis tools path (the path members actually use). The 90-day MOI is
**variant-pinned** to the member's monthly MOI variant (resolved via the board-canonical
`canonicalVariantKeys`, so "Default" → e.g. NTREIS strict), so the two periods are
comparable. It already renders in `## Sources` and is a validator anchor.

**Why this matters:** a task may arrive claiming "the 90-day read surfaces median/SP-LP/DOM/
failure-rate but NOT months-of-inventory — add it." That premise is **stale** — it was true
before the trailing-quarter work landed, but MOI is now present and variant-matched. Always
run the diagnose step (compute pooled for a full-3-month member and print the MOI rows +
current-month variant) before changing anything; the answer has been "already done, variants
match."

**How to apply:** if asked to add/relabel a 90-day metric, first replicate the Jarvis
injection (aggregatePooled90dFromDb → pooled90dToSourceOfTruth with the member's
moiMetricKey) and print the resulting rows. Only change code if a family is genuinely absent.

# Jarvis (AI Content Manager) access is an allowlist feature flag, not a role

Access is the `tool_jarvis` flag in the `feature_visibility` AppSetting, stored in the object
form `{ enabled, allowedUserIds }`. `/member/jarvis` redirects to the dashboard and the sidebar
hides the link when `getFeatureFlags().tool_jarvis` is false. Members (non-admin/editor roles)
are gated purely by `allowedUserIds`; admin/editor bypass all flags via role (except while
impersonating). To add a pilot member, add them to the `PILOTS` array in
`scripts/seed-jarvis-flag.ts` (it dual-verifies each account by id AND full name, then rewrites
the allowlist) and run it — flags are read per-request from the DB, so no restart/redeploy is
needed for the change to take effect.
