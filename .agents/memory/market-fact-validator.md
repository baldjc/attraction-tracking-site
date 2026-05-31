---
name: Market-data fact validator (cost control + market-agnostic prompt)
description: Why validator cost is driven by detail-group count not neighbourhood count, and how the parameterized prompt + coverage cap are designed.
---

# Market-data fact validator

## The real cost driver is detail-group count, not neighbourhood count
The validator cost on a market scales with the number of granular
(propertyType × priceTier) groups fed to it, NOT the raw neighbourhood count.
- DENSE markets (e.g. CREB/Calgary): few neighbourhoods, but each packs many
  detail groups → capping neighbourhood count alone does NOT bound cost.
- SPARSE markets (e.g. NTREIS/Dallas, "Phil"): thousands of micro-neighbourhoods,
  each with ~1 detail group → bounded by neighbourhood count, ~380–410 detail
  groups total.

**Why:** Calgary at full head fed ~1,170 detail groups → $5.33 / 987 facts,
blowing the ≤$3 / 400–600-fact target, while a pure neighbourhood cap left it
unbounded. The fix in `applyCoverageCap` adds `MAX_HEAD_DETAIL_GROUPS` (≈550) on
top of the neighbourhood-count clamp. At 550, Calgary → 51 kept / 496 facts /
$2.93; sparse Phil markets sit below the ceiling and are untouched.

**How to apply:** If you re-tune the cap, use a free no-LLM dry-run that reports
`kept / coverage% / detailGroupsFed` per candidate budget BEFORE spending a real
LLM run. Detail groups fed ≈ cost predictor (Calgary ~$0.0045/detail-group).

## Parameterized prompt (market-agnostic) — leakage rules
The prompt was Calgary/CREB-specific; it's now generated from MarketConfig
(status codes, property-type vocab, MOI thresholds, high-end floors, superlative
tiers) via `MARKET_SOURCE_DEFAULTS` + `resolveMarketDefaults(mlsSource)`.
- Replacement order matters: replace `creb.com` BEFORE `CREB` to avoid partial
  leakage.
- Lowercase `creb_*` JSON keys are intentionally NOT replaced (only uppercase
  `CREB` / literal `creb.com` prose) — they are stable config keys.
- `resolveMarketDefaults` normalizes aliases (e.g. "Pillar 9" → CREB) and falls
  back to GENERIC; `toShape()` fills null new fields so legacy configSnapshots
  stay safe.

## Verification harness gotchas
- `executeSql` code-execution callback FAILS (channel_binding) — use `tsx`
  scripts against the dev DB instead.
- Long validations must run as a WORKFLOW; a detached bash process gets reaped
  (max bash timeout 120s). `tsx` needs `NODE_OPTIONS=--max-old-space-size`.
- `runValidation` skips uploads already `status="validated"` — reset status
  before re-benchmarking.
- `FactUsageClass` enum values use UNDERSCORES: `headline_safe`,
  `supporting_texture_only`, `rejected` (not hyphens).
- Full `tsc` OOMs; run with `NODE_OPTIONS=--max-old-space-size=6144` and filter
  to `^src/(lib|app/api)/` (ignore pre-existing `.next/` dev-type errors).

## Known non-blocking edge case
In `applyCoverageCap` rollups branch, tail groups with non-null propertyType
(rare safety-net types) are dropped rather than re-bucketed into the synthetic
"All other neighbourhoods" bucket. Does not affect verified counts (Calgary
derivedSold matches full total). Re-bucketing them is a possible follow-up.
