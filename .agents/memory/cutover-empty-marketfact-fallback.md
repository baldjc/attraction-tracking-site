---
name: Cutover empty-MarketFact fallback for theme/idea generation
description: How on-demand theme/idea generation survives the instant-cutover window where an upload is validated but MarketFact/MarketStoryLead are still empty.
---

On the `market_instant_cutover` path an upload flips `status=validated` the moment the
deterministic AggregatedMetric layer is persisted — BEFORE the background Anthropic
story pass writes any MarketFact/MarketStoryLead, and permanently if that AI pass fails
in an outage. During that window MarketFact is empty even though AggregatedMetric is
fully populated, so every on-demand theme/idea surface (content-engine-v2,
idea-validation, jarvis idea-tools, jarvis get_facts, script-plan-enrichment) came up
empty. Wave 6a's "repoint reads deterministic-first" was only half done — only
`script-data-resolver.ts` got the MarketFact→AggregatedMetric fallback; the generation
consumers did not.

**The funnel:** all those consumers load facts through `loadHeadlineSafeFacts` /
`loadTextureOnlyFacts` in `content-engine-context.ts`. Patch the fallback THERE once and
every consumer is covered; do not repoint them individually.

**Parity gate (critical):** the fallback must NOT trigger on `rows.length === 0` alone —
a legacy (flag-OFF) upload with a legitimately fact-less MarketFact would then silently
gain AggregatedMetric facts, breaking byte-identical parity. Gate on `storyStatus ∈
{generating, failed}`: the legacy single-pass never sets storyStatus (stays
`not_started`), only the cutover path sets generating/ready/failed. So flag OFF ⇒ never
falls back ⇒ parity preserved. `ready` with empty MarketFact also gets no fallback.

**Mapping gotchas:**
- Use the shared `formatValue(family, value)` from `aggregated-metrics.ts` for value
  strings — never hand-roll, units are subtle (SP_LP stored as ratio, FAILURE_RATE
  ×100 and can exceed 100 for legacy residue, MOI months, etc.).
- Surface ONE preferred metricKey per family (MOI=`moiStrict` per `CANONICAL_METRIC_KEY`)
  and SKIP AVG/BENCHMARK/ABSORPTION — emitting variants double-counts/contradicts.
- Scope to `priceTier: null` overall rollups (the scope these surfaces cite).
- AggregatedMetric has ~an order of magnitude more rows than MarketFact (~4000 vs
  hundreds for one upload), so a plain `take: limit` ordered metricFamily-first lets the
  earliest enum families (MOI, PSF) fill the whole window and starve the rest. Fetch a
  neighbourhood-first superset and `balanceFactsByFamily` down to the cap.

**Known remaining lineage gap (follow-up):** the fallback emits AggregatedMetric ids as
`CompactFact.id`. Downstream `save-idea` / `use-as-video` ownership-verify cited ids
against `prisma.marketFact` only, so saving an idea generated DURING the window can 422
(`insufficient_valid_facts`) until the story job lands real MarketFacts. Not a
regression (before this fix generation returned 0 facts, so save was never reached), and
it self-heals after the ~12-min window in the normal case. To fully close: teach the
save/use-as-video validators (and the script fact-gate) to accept AggregatedMetric
citations while the upload is in a cutover-empty state.
