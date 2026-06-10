---
name: Style-cut single-family parity (two engines)
description: Style-segmented market cuts must restrict to single-family class, and the on-demand cut engine and the deterministic aggregator must apply the SAME activation condition or Jarvis disagrees with the persisted source-of-truth.
---

# Style cuts are single-family-only — and BOTH engines must agree

A style value ("2 Storey", "Bungalow") can belong to either a single-family home
OR a condo, so a style-segmented cut must never fold a cross-class row (a
"2 Storey" condo) into a Single-Family headline. Two engines compute market
stats and they MUST produce identical numbers:

- **On-demand cuts (Jarvis):** `src/lib/tools/computeCut.ts` (`computeCut` pure fn + `runComputeCut` wrapper).
- **Deterministic source-of-truth (script builder / dashboard / idea cards):** `src/lib/csv-aggregate.ts` (`buildBuckets`/`aggregateUpload`, persisted to `AggregatedMetric`).

Shared predicate `isSingleFamilyClass(raw)` lives in `src/lib/property-class.ts`;
both engines import it. The restriction activates only when:
1. the cut involves the **style** dimension/filter, AND
2. the member did NOT explicitly ask for a **propertyClass** cut, AND
3. there is a property-class column **DISTINCT from the mapped style header**, AND
4. the upload actually carries recognizable single-family rows.

**Why condition 3 (distinct-header guard) is the subtle one:** the class column
is auto-resolved from header candidates `["propertytype","propertyclass"]`. If a
member mapped their STYLE column to a header literally named "Property Type", the
candidate collides with the style column itself — there is no separate class
signal, so the restriction MUST stay off (no regression for those uploads).
`csv-aggregate` had this guard (`classColumnDistinct`) from the start; the
`computeCut` pure fn originally did NOT (it has no header context), so it could
restrict when the aggregator did not → Jarvis vs SoT divergence on collision
uploads. Fix: compute `classColumnDistinct` in `runComputeCut` (it has
`mapping`/`headerLookup`) and thread it into `computeCut` via `opts`.

**How to apply:** any change to one engine's class/style restriction must be made
in the other in lockstep, including the activation condition — not just the
predicate. Note buckets are keyed `[neighbourhood, propertyType, priceTier]`; the
unsegmented headline figure is the `priceTier == null` (and overall `propertyType`)
row — don't mistake a price-tier sub-bucket for the headline when verifying.

# MOI canonical = STRICT, platform-wide

Months of Inventory has two variants: **strict** (Active ÷ Sold, excludes
pending) and **inclusive** (Active ÷ (Sold+pending-ish)). The platform canonical
is **strict** and every read surface must resolve to it:
- `src/lib/aggregated-metrics.ts` `CANONICAL_METRIC_KEY.MOI = "moiStrict"` (SoT read resolver).
- `src/lib/market-config.ts` CREB board `canonicalMoiVariant = "strict"` (validator / `canonicalVariantKeys` path).
- Default-methodology members DEFER to the board canonical via `canonicalVariantKeys`, so `DEFAULT_METHODOLOGY` (the sentinel in `member-metric-settings.ts`) is intentionally left UNCHANGED — flipping it would break its defer-to-board semantics.

**Why:** computeCut already hardcoded strict (Active ÷ Sold); the deterministic
SoT used to resolve inclusive, so Jarvis and the script builder reported
different MOI for the same cut (e.g. South Terwillegar 2-Storey May-2026: strict
0.5 vs inclusive 0.9).
