---
name: Per-file column-format auto-detect + degraded-replacement guard
description: Why re-validating OLD market CSVs under a member's CURRENT columnMapping silently destroyed good data, and the two guards that prevent it.
---

# The trap: live columnMapping describes TODAY's exports, not old ones

A member's `MarketConfig.columnMapping` maps the column NAMES in the files they
upload **today**. When the export feed changes format over time (e.g. a member
migrates to a RESO feed: `MlsStatus`/`ClosePrice`/`SubdivisionName`/`PropertySubType`),
their OLD historical files used different spelled-out headers
(`Status`/`Close Price`/`Subdivision`/`Subtype`).

Re-validating an OLD month under the CURRENT mapping leaves status/neighbourhood/
type **unmapped** → every row buckets to `unknown` → ~0 sold → a near-empty fact
set. The catch that makes it destructive: the **SUCCESS path committed that
garbage over the good data** (one month went 485→12 facts and still showed
"Validated" green). An empty-set guard alone does NOT catch this — the output is
thin, not empty.

# Fix 1 — per-file effective mapping (never mutate live config)

`resolveEffectiveMapping(liveMapping, headers)` in `csv-aggregate.ts` computes a
mapping for ONE file's headers without persisting anything:
- a SET live column that resolves in this file's headers → kept (byte-for-byte
  parity → today's exports are unchanged);
- a SET-but-ABSENT live column → substituted with a HIGH-confidence header
  detection (`suggestMappingFromHeaders`) only if that detection itself resolves;
- never-mapped fields are left alone — we never invent columns.

Wired into `buildBuckets` BEFORE the price guard, so it covers BOTH re-validation
aggregation AND the pooled-90d path. **Gotcha:** `normalizeHeader` collapses
spaces/underscores, so `"ClosePrice"` already resolves against `"Close Price"` —
those don't need an override and won't appear in the override list. Only genuinely
different tokens (MlsStatus≠Status, SubdivisionName≠Subdivision) get substituted.

# Fix 2 — degraded-replacement guard (partial collapse, not just empty)

`isSuspiciouslyDegradedReplacement(prev, next, {dropRatio, minPrev})` in
`aggregated-metrics.ts`: true when `prev >= minPrev` (default 20) AND
`next < prev * dropRatio`. Applied on two surfaces with DIFFERENT ratios — this
asymmetry is intentional:
- **Facts (0.5)** in `runValidation` before persistResults: a >50% drop on
  re-validating the SAME CSV is almost always a regression. On trip: keep prior
  facts/leads/aggregates, leave the upload `validated` (its live data is intact),
  write a `NEEDS_REVIEW_PREFIX` note, still bill if cost>0, return.
- **Aggregates (0.2, catastrophic only)** extending the empty-set guard in
  `persistAggregatedMetrics`: a member legitimately EXCLUDING neighbourhoods
  shrinks the aggregate row count, so only a near-total collapse trips it.

Both are re-validation-only by nature: a brand-new upload has 0 existing
rows/facts so `prev < minPrev` → guard never fires on a first upload.

**Why:** the empty-set build-then-swap guards only caught a TOTAL wipe; the real
failure was a PARTIAL collapse that the success path happily committed.

# Atomicity rule: aggregate persistence belongs on the SUCCESS path

`persistAggregatedMetrics` used to run EARLY (before the AI), while the fact
degraded-guard returns LATE. That meant a needs-review return could keep old
facts while the aggregates had ALREADY been swapped → "we kept your data" was only
half true. Fix: move the aggregate swap to just before `persistResults`, AFTER the
zero-output + degraded guards. Safe because nothing in `runValidation` reads
persisted aggregates/SoT back during validation — the fact chunks and SoT rows are
all built from the in-memory aggregation `table`, and `getSourceOfTruthMetrics`
(the only DB reader) is never called in the fact path. **How to apply:** any
"keep prior data on failure" path must ensure EVERY destructive write (facts AND
aggregates) sits behind the same guard, or one half swaps while the other is kept.

# Recovery

`recover-stuck-upload.ts <id> --fresh` clears `rawValidatorOutput` and re-runs the
full pipeline (now with the per-file auto-detect). A month whose prior facts fell
BELOW the 20-row `minPrev` floor is NOT blocked by the degraded guard, so it
recovers cleanly even though its current state is thin. Audit a member's months
with a per-upload facts/leads/aggs count keyed on `userId`; only months with
anomalously low facts vs their neighbours need recovery.

**Gotcha — stale log buffer:** `refresh_all_logs` snapshots can surface an OLD
degraded validation's `db.write`/`validation.complete` lines AFTER a recovery,
making it look like the recovery was clobbered. Trust the DB `validatedAt` +
fact count, not the log line ordering — if `validatedAt` matches the recovery
run, the recovery holds.
