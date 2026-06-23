---
name: AggregatedMetric tier-row + early-persist invariants
description: How price-tier AggregatedMetric rows, deterministic usageClass, and pre-AI persistence interact — and the parity rule every reader must follow.
---

# AggregatedMetric tier rows, usageClass, and early persistence (Wave 6a Phase 1)

`AggregatedMetric` now persists **price-tier subgroups** (`priceTier !== null`)
additively, alongside the overall `(neighbourhood, propertyType)` rollups
(`priceTier === null`). `priceTier` is part of the `@@unique` key, so tier rows
do not collide with the overall row.

**Parity rule (the one that bites):** every read that must stay byte-identical to
the pre-tier ("Wave 1") behaviour MUST filter `priceTier: null`. That includes:
Script Builder v2 / Jarvis source-of-truth (`getSourceOfTruthMetrics`), the
Script Builder fact resolver (`script-data-resolver`), methodology preview, KB
floor-clearing sample sums + per-neighbourhood counts (`merge-run`,
`knowledge-base/manage`). Deliberately UNFILTERED: the KB neighbourhood
**delete cascade** (must also remove tier rows) and the `canonicalAreaId`
`updateMany` (harmless to stamp tier rows). A read that forgets the filter will
double-count a hood's samples or surface low-confidence tier colour as headline.

**`usageClass` is deterministic, never from the LLM.** It is derived from the
in-code per-family `SAMPLE_THRESHOLDS`: at/above floor → `headline_safe`, below →
`supporting_texture_only`. Overall rollups keep the exact Wave 1 gate (drop below
floor, always `headline_safe`) so existing values stay byte-identical; only tier
subgroups are persisted down to a single sample and can be texture-only.

**Aggregates persist BEFORE the AI pass.** `persistAggregatedMetrics` is called
right after `aggregateUploadFromDb` in `runValidation`, not on the post-Anthropic
success path. **Why:** during an Anthropic outage the old late-persist meant
`runValidation` threw before any row was written, leaving the member with zero
deterministic data despite the numbers already being computed. Atomicity is still
safe because `persistAggregatedMetrics` carries its own guards (no-op on empty
re-aggregation, leave-live-rows on a catastrophic >80% drop); the fact/lead swap
and the runValidation degraded-fact guard still protect FACTS independently. The
aggregate persist is wrapped non-fatal so it can't block the AI pass or fact write.

**Still-true constraints to respect:** `validated` status is still gated by the AI
step (it was NOT moved off it). Reads still filter `priceTier: null` — tier rows
exist but no consumer reads them yet; a future cutover must deliberately opt in.
