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
- 90-day MOI must pin the inclusive canonical variant (`moiInclusive`,
  `CANONICAL_METRIC_KEY.MOI`) = (anchor active+pending) / (pooledSold/months), so it
  is comparable to the monthly MOI row.
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
