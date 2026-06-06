---
name: Pooled trend rows via SoT injection
description: How 90-day pooled + year-ago trend numbers reach market-update scripts and become validator anchors without schema/rule changes.
---

# Pooled trailing-90-day + YoY trends in market-update scripts

The script path surfaces trend numbers by appending ordinary `SourceOfTruthMetric`
rows to the SAME `sourceOfTruthMetrics` array the route already builds.

**Why this works (the load-bearing invariant):** `buildScript` passes that one
array to BOTH `renderSourceOfTruthBlock(WithLock)` (so rows auto-render in the SoT
block) AND `validateScript({ sourceOfTruth })` (so each row auto-becomes a citable
anchor — `unanchored_stat`/`no_sot_disagreement` match on family+unit+value with NO
month filter). So injecting a period row is sufficient to both show it and let the
script cite it. No schema change, no script-content-rules.ts change.

**How to apply / gotchas:**
- True pooled 90-day = re-aggregate raw CSV Sold rows across anchor + 2 prior
  validated months into ONE accumulator per group, then compute median/SP-LP/DOM/
  failure over the COMBINED population. This is statistically different from the
  legacy weighted-mean-of-monthly-medians (`rolling90dValue`), which stays in
  csv-aggregate ONLY for the separate upload-time fact-validator prompt. The wrong
  inline "90d {rolling90dValue}" annotation was removed from `renderSourceOfTruthBlock`
  (script path only).
- 90-day MOI must follow the MEMBER'S monthly MOI variant, NOT a hardcoded one.
  Resolve it per-member via `canonicalVariantKeys(mlsSource, loadMemberMetricSettings(userId)).moiMetricKey`
  and pass it as the 3rd arg to `pooled90dToSourceOfTruth`. "Default" methodology
  (no memberMetricSettings row) DEFERS to the board-canonical variant (e.g. NTREIS
  → strict), so hardcoding `moiInclusive` silently mismatched strict members
  (current-month strict vs 90-day inclusive — e.g. Phil 1.35 vs 2.20). `pool90d`
  emits BOTH `moiStrict` (anchor active ÷ avgMonthlySold) and `moiInclusive`
  ((active+pending) ÷ same denom); the SoT fn selects by variant and labels the row
  with `metricKey = moiVariantKey` (`moiInclusiveRolling3` reuses the inclusive value
  since the pooled window is already trailing-3). `mlsSource` lives on `MarketConfig`
  (userId @unique → `findUnique`), NOT on `MarketConfigSummary`. Wire in BOTH
  generators (see below). Note: `CANONICAL_METRIC_KEY.MOI` stays static `moiInclusive`
  for the isCanonical display tag — harmless because period rows sit in their own group.
- Year-ago endpoints are just the persisted `AggregatedMetric` rows of the upload at
  `shiftMonthYear(-12)` (validated only); they render under their own YYYY-MM header
  → citable "then" endpoint. YoY must state BOTH endpoints.
- `buildBuckets()` is the shared normalize/status-bucket path; pooled MUST reuse it so
  pooled interpretation == monthly. The refactor previously had a swapped
  normalizedCount vs normalized.length between the UNKNOWN_STATUS warning and meta — keep them consistent.
- Render labels: `(month: X)` when monthYear matches `/^\d{4}-\d{2}$/`, else `(period: X)`.
- Pooled result is process-cached keyed on the SORTED 3 upload IDs (validated window
  is immutable). Object-storage reads have NO built-in timeout — bound each read and
  wrap the whole 90-day path in try/catch so failure omits the rows (graceful) rather
  than erroring the member's request.
- failure_rate sample floor: needs `sold >= 5 AND offMarket >= 3`
  (`hasSufficientFailureSample`) or the value is null — easy to trip in tests.

## TWO script generators — wire trend injection into BOTH

**There are two independent market-update script generators, each assembling its
own `sourceOfTruthMetrics`.** Wiring a SoT feature into one silently skips the
other:
1. `src/app/api/ai-tools/script-builder-v2/route.ts` — the wizard path; requires
   a persisted ContentPlan with `rotationSlot` + `titlePromise` (else 409).
2. `src/lib/jarvis/tools.ts` (the build-script tool, `runBuildScript`) — the
   **path members actually use via Jarvis chat**. Builds an EPHEMERAL
   `planContext` (`jarvis-${Date.now()}`), so it never touches a persisted plan.

**Why this matters / how it bit us:** the 90-day pooled injection landed in the
route only. Members' saved ContentPlans all had `rotationSlot=NULL`/
`titlePromise=NULL` (Jarvis doesn't persist them), so they could never reach the
route — every market-update script went through Jarvis, where the 90-day rows
were never appended. Symptom: draft `## Sources` cited only the current month
even though `aggregatePooled90dFromDb` returned complete data in isolation. This
is the canonical "computed-but-not-passed-into-context" failure: the data layer
is fine, the feature is just wired into the wrong (one of two) generators.

**How to apply:** any change to the script SoT context (trend rows, YoY,
new anchors, prompt-visible metrics) must be made in BOTH generators in lockstep,
or verified to be shared. To find the real path a member uses, check whether the
plan has `rotationSlot` set — if not, it's Jarvis.

**Year-ago scope caveat:** the route injects BOTH 90-day AND year-ago endpoints;
the Jarvis path intentionally injects ONLY 90-day. If a member has validated
`shift(-12)` uploads, mirroring the year-ago block WOULD surface YoY — only add
it when YoY is explicitly wanted.
