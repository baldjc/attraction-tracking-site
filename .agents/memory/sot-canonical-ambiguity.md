---
name: Source-of-Truth canonical ambiguity
description: Why ledger facts can't be mapped to one SoT value, and how Jarvis reconcile + the no_sot_disagreement validator must guard against it.
---

# SoT canonical ambiguity (one family → many values)

A single metric **family** resolves to MULTIPLE source-of-truth values, so you can
never map a per-fact ledger value to "the" canonical number by family alone:

- Each family has multiple **metric-key variants** (MOI = moiStrict / moiInclusive /
  moiInclusiveRolling3; DOM = domMedian / domAverage; SP_LP variants, etc.).
- Each (neighbourhood, family) also spans multiple **property types**.
- The marketFact `metricName` vocab (MOI, dom_median, median_sale_price, SP_LP…)
  does **not** align with aggregatedMetric `metricKey` (moiStrict, domMedian,
  spLpRatio, medianPrice…), so exact key-matching across the two stores is impossible.

A ledger/cited fact only tells you its FAMILY, not which variant or property type it is.

**Why:** forcing any single SoT value onto an ambiguous family silently overrides the
fact with the WRONG canonical (e.g. apartment MOI shown for a detached fact, or strict
vs inclusive MOI). This caused a real over-override bug in Jarvis chat.

**How to apply:**
- Two resolvers now exist and they are NOT interchangeable:
  - `resolveUnambiguousSotValue` — returns non-null only when EVERY SoT value agrees
    within rounding; used as the safe fallback when a family has no canonical pin.
  - `resolveCanonicalSotValue(rows, family)` — for families with a `CANONICAL_METRIC_KEY`
    pin (currently MOI → `moiInclusive`), DELIBERATELY picks that variant and prefers its
    `propertyType=="All"` rollup, even when variants disagree. This is intentional: it is
    what makes Jarvis chat and the script/Sources cite the SAME variant (the Downtown
    6.71-strict vs 8.8-inclusive split). The old "never add an All fallback" rule applies
    ONLY to the unpinned/unambiguous path — for a pinned family, the All preference is the
    whole point. Falls back to `resolveUnambiguousSotValue` when the pinned variant is
    absent for a hood.
- Jarvis `reconcileLedgerToSourceOfTruth` (src/lib/jarvis/tools.ts) now reconciles via
  the canonical resolver so chat matches the script's canonical variant.
- The `no_sot_disagreement` validator (src/lib/script-content-rules.ts) must
  **neighbourhood-scope** its comparison: compare a spoken stat only against its own
  neighbourhood's SoT rows (+ "All Neighbourhoods" rollup), found via nearest preceding
  neighbourhood mention. A flat unit-only pool lets a wrong figure for hood A pass when
  it coincidentally equals hood B's value. Scoping is backward compatible: falls back to
  the full unit pool when no hood context or rows carry no neighbourhood tag.
- Rounding tolerance (abs ≤ 0.05 OR rel ≤ 0.5%) lives once in `sotValuesWithinRounding`
  (aggregated-metrics.ts) and is shared by chat + validator so they never disagree about
  what counts as "the same number". Keep it single-sourced.
