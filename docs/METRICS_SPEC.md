# METRICS_SPEC.md — Canonical Derived-Metric Specification

**Status:** Phase 1 (cataloging pass). Documentation only — no functional code was changed to produce this file.
**Scope:** Every metric the system derives from raw market-data uploads, persists as `AggregatedMetric` / `MarketFact`, or surfaces to Script Builder, Idea Card generation, and Story Lead generation.
**Generated against code at:** repository HEAD as of this pass (post failure_rate v2 / market-agnostic status-mapping work).

This document is the single source of truth that all future metric work checks against. Where a formula here disagrees with code, the code is the bug **or** this doc is stale — reconcile, don't guess. Each entry links to the exact file + approximate line where the formula lives.

> **Phase 1 accuracy caveat:** Almost every "Accuracy status" below is `not yet verified`. Phase 2 verifies each (metric × market) pair against the authoritative published source. See the [Phase 2 prep checklist](#phase-2-prep-checklist).

---

## Table of contents

1. [Status bucket reference](#status-bucket-reference)
2. [Per-market status bucket snapshots](#per-market-status-bucket-snapshots)
3. [Published-source reference table](#published-source-reference-table)
4. [Metric catalog](#metric-catalog)
   - [Deterministic metrics (code-computed from CSV)](#a-deterministic-metrics-code-computed-from-csv)
   - [Pure ratio helpers (market-status-buckets.ts)](#b-pure-ratio-helpers-market-status-bucketsts)
   - [Validator/LLM-emitted MarketFact metrics](#c-validatorllm-emitted-marketfact-metrics)
5. [Known Issues](#known-issues)
6. [Phase 2 prep checklist](#phase-2-prep-checklist)
7. [Appendix: grep cross-check](#appendix-grep-cross-check)

---

## Status bucket reference

All derived ratio math collapses the canonical seven-way MLS status taxonomy into **four mutable buckets plus a terminal `unknown`**. This is the single source of truth for "which raw MLS status string counts as what".

| Bucket | Canonical statuses that map here | Meaning | Role in formulas |
|---|---|---|---|
| `sold` | `sold` | Closed transaction | Denominator for failure_rate, MOI, absorption; the basis for ALL price / PSF / DOM / SP-LP medians |
| `offMarket` | `expired` + `terminated` + `withdrawn` | Listing left the market unsold | Numerator for failure_rate; part of sale_share denominator |
| `active` | `active` | On-market, unsold inventory | Numerator for strict MOI; denominator for absorption |
| `pending` | `pending` | Under contract, not yet closed | Counts toward **inclusive** MOI only — never the sold denominator |
| `unknown` | `other`, blank, or any unmapped raw string | Unbucketable | Excluded from all maths; surfaced via `unknownLabels`, never silently dropped |

**Code:** `src/lib/market-status-buckets.ts`
- `StatusBucket` type — line 25
- `canonicalToBucket()` (seven-way → four-bucket projection; `other` → dropped) — lines 59–75
- `bucketStatus(rawStatus, mapping)` — case- and whitespace-insensitive O(1) lookup — lines 179–187
- `countByBucket(rawStatuses, mapping)` — tallies buckets **and** returns `unknownLabels: Map<string, number>` so unmapped strings are surfaced, not dropped — lines 204–225

### How a market's mapping is resolved

`resolveStatusMapping(config)` (lines 135–150) resolves the active four-bucket mapping with a 3-branch precedence — **the source of truth is `statusCodes`, not the override:**

1. **Branch 1 — explicit override:** `MarketConfig.statusMapping` Json, parsed by `validateStatusMapping()` (lines 91–107). Admin escape hatch only.
2. **Branch 2 — derived from `statusCodes`:** `mappingFromStatusCodes(config.statusCodes)` (lines 110–123). The canonical path.
3. **Branch 3 — per-source seed defaults:** `resolveMarketDefaults(config.mlsSource)` → `MARKET_SOURCE_DEFAULTS[...]` (or `GENERIC_MARKET_DEFAULTS`, which guarantees a non-empty mapping). See `src/lib/market-config.ts:767`.

`statusCodes` + `MARKET_SOURCE_DEFAULTS` live in `src/lib/market-config.ts` (lines 533–747). The optional `MarketConfig.statusMapping` override only fires when set; it does not replace the canonical list.

---

## Per-market status bucket snapshots

Pulled from `src/lib/market-config.ts` `MARKET_SOURCE_DEFAULTS` (the actual resolved `statusCodes` for each source). Each market's raw MLS status string → bucket assignment.

### Calgary / CREB (data system: Pillar 9) — `MARKET_SOURCE_DEFAULTS.CREB` (lines 557–591)

Aliases that resolve here: `PILLAR9`, `CALGARY` (`MARKET_SOURCE_ALIASES`, lines 750–753).

| Raw MLS status | Canonical | Bucket |
|---|---|---|
| Active | active | `active` |
| Pending | pending | `pending` |
| Sold | sold | `sold` |
| Expired | expired | `offMarket` |
| Terminated | terminated | `offMarket` |
| Withdrawn | withdrawn | `offMarket` |

### Phil's NTREIS (North Texas / Dallas–Fort Worth) — `MARKET_SOURCE_DEFAULTS.NTREIS` (lines 593–637)

Aliases that resolve here: `DALLAS` (and `NTREIS`).

| Raw MLS status | Canonical | Bucket |
|---|---|---|
| Active | active | `active` |
| Active Kick Out | active | `active` |
| Active Option Contract | pending | `pending` |
| Active Contingent | pending | `pending` |
| Pending | pending | `pending` |
| Pending Continue to Show | pending | `pending` |
| Sold | sold | `sold` |
| Closed | sold | `sold` |
| Expired | expired | `offMarket` |
| Canceled | terminated | `offMarket` |
| Cancelled | terminated | `offMarket` |
| Withdrawn | withdrawn | `offMarket` |
| Withdrawn-Unconditional | withdrawn | `offMarket` |
| Withdrawn-Conditional | withdrawn | `offMarket` |
| Temporarily Off Market | withdrawn | `offMarket` |

> Note: NTREIS exports the single-l `Canceled` spelling; both spellings are mapped for safety. `Active Kick Out` is treated as `active` (still genuinely on-market), while `Active Option Contract` / `Active Contingent` are treated as `pending` (under contract).

### Other supported markets (for completeness)

- **Bright MLS** (`BRIGHT`, alias `BRIGHTMLS`; Mid-Atlantic) — lines 639–673. Notable: `Active Under Contract` → `pending`; `Closed` → `sold`; `Canceled` → `offMarket`.
- **ARMLS** (Phoenix) — lines 675–710. Notable: `Active With Contingent` → `pending`; `Temp Off Market` → `offMarket`.
- **Stellar MLS** (`MFRMLS`, aliases `STELLAR`/`STELLARMLS`; Florida) — lines 712–746.
- **Unknown / never-seen source** → `GENERIC_MARKET_DEFAULTS` (lines 533–552): Active/Pending/Sold/Expired/Terminated/Withdrawn.

> Any raw status not present in the resolved `statusCodes` list buckets to `unknown` and is reported via `countByBucket().unknownLabels`. There are no `unknown`-marked statuses for the markets above — every listed code maps cleanly. See [Known Issues](#known-issues) for the surfacing-vs-blocking behavior of unknowns.

---

## Published-source reference table

| Market | Published authority | Methodology / report | Cadence | Metrics they publish that we should match | Canonical URL (Phase 2 to verify) |
|---|---|---|---|---|---|
| Calgary / CREB | Calgary Real Estate Board | CREB Monthly Statistics Package (data system: Pillar 9) | Monthly | Benchmark price, median/average price, **inventory = Active + Pending**, **DOM = average**, sales count, new listings, months of supply | https://www.creb.com/ (stats portal) |
| Dallas–Fort Worth / NTREIS | NTREIS (via MetroTex / Texas REALTORS — Texas Real Estate Research Center "Data Relevance Project") | Monthly area summary | Monthly | Median price, DOM, months of inventory, closed sales, active listings | _needs Phase 2 confirmation_ |
| Mid-Atlantic / Bright MLS | Bright MLS | Monthly Market Report | Monthly | Median sale price, DOM, months of supply, closed sales, new/active listings | https://www.brightmls.com/ (market stats) |
| Phoenix / ARMLS | Arizona Regional MLS | Monthly STAT report | Monthly | Median/average price, DOM, months of supply, sales, active listings | https://armls.com/ (STAT) |
| Florida / Stellar MLS | Stellar MLS | Monthly market reports | Monthly | Median price, DOM, months of supply, closed sales | https://www.stellarmls.com/ |
| **failure_rate / sale_share / absorption_rate** | **NONE — internal metrics** | n/a | n/a | n/a — no board publishes these. **Hardest to verify; most prone to drift.** | n/a |

> The prompt itself states failure_rate "has no CREB equivalent. CREB does not publish it." (`src/lib/fact-validator-prompt.ts:185–203`). Every failure-rate fact's `usage_notes` is required to carry an "internal metric, cannot be cross-referenced" disclosure (line 203).

---

## Metric catalog

### A. Deterministic metrics (code-computed from CSV)

These are computed in `metricsFromAccumulator()` (`src/lib/csv-aggregate.ts:358–408`) onto `AggregatedGroup`, then a subset is persisted to the `AggregatedMetric` table by `rowsFromGroup()` (`src/lib/aggregated-metrics.ts:79–146`). Per-family persistence floors live in `SAMPLE_THRESHOLDS` (`src/lib/aggregated-metrics.ts:47–58`).

---

#### Metric: median_sale_price

- **Formula** — `median(soldPrices)`. Code: `src/lib/csv-aggregate.ts:370`.
- **Bucket inputs** — numerator: n/a (median over `sold` rows' sale price); denominator: n/a.
- **Output unit** — dollars.
- **Output range** — market-dependent; typically $200K–$2M+. Unbounded above.
- **Sample-size floor** — persists only if `sampleSize (soldN) ≥ 5` (`SAMPLE_THRESHOLDS.MEDIAN = 5`, `aggregated-metrics.ts:48`; gate at line 99). Validator additionally treats price facts below ~30 sales as not headline-safe (`fact-validator-prompt.ts`).
- **Auto-soften rules applied** — currency-aware soften (`script-content-rules.ts:1917–1965`): unanchored dollar tokens `<$1M` round to nearest **$50K** ("the 650K range"), `≥$1M` to nearest **$0.1M** ("the 1.2-million range").
- **Narrative phrasing rules** — mix-shift guard in validator prompt (`fact-validator-prompt.ts:91–95`): a median-price YoY move cannot be called "appreciation" unless a same-window median-sqft pair moved ≤±5%; otherwise label supporting-texture-only / pivot to PSF or MOI.
- **Authoritative published source** — CREB / NTREIS / Bright / ARMLS / Stellar all publish median price (see table).
- **Methodology version** — `MEDIAN` family; no per-metric `methodologyVersion` (that field is FAILURE_RATE-only today).
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:370`; persisted at `aggregated-metrics.ts:120` (`metricKey: "medianPrice"`).
- **Used by** — Script Builder v2 source-of-truth block, Idea Card generation (content-engine-context), Story Leads, ScriptFactGate citation.

---

#### Metric: median_sqft

- **Formula** — `median(soldSqfts)`. Code: `src/lib/csv-aggregate.ts:371`.
- **Bucket inputs** — median over `sold` rows' square footage.
- **Output unit** — count (sq ft).
- **Output range** — ~500–5,000+.
- **Sample-size floor** — computed unconditionally; **not** independently persisted to `AggregatedMetric` (no `push()` for it in `rowsFromGroup`).
- **Auto-soften rules applied** — none specific.
- **Narrative phrasing rules** — drives the median-price mix-shift / `compositionShiftFlag` check (`csv-aggregate.ts` YoY block ~700–715).
- **Authoritative published source** — generally not published directly.
- **Methodology version** — n/a.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:371`.
- **Used by** — internal mix-shift detection + YoY delta; validator may emit it as a `median_sqft` MarketFact. **Not** persisted as its own AggregatedMetric row → see [Known Issues](#known-issues).

---

#### Metric: psf (price per square foot)

- **Formula** — `median(soldPsfs)`. Code: `src/lib/csv-aggregate.ts:372`.
- **Bucket inputs** — median over `sold` rows' per-sqft price.
- **Output unit** — dollars / sqft.
- **Output range** — ~$100–$1,500/sqft.
- **Sample-size floor** — `SAMPLE_THRESHOLDS.PSF = 5` (`aggregated-metrics.ts:52`); validator headline floor ~30.
- **Auto-soften rules applied** — currency soften applies to dollar tokens generally.
- **Narrative phrasing rules** — recommended headline fallback when median price is mix-shift-tainted (prompt 93/95).
- **Authoritative published source** — boards vary; PSF less consistently published.
- **Methodology version** — `PSF` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:372`; persisted at `aggregated-metrics.ts:130` (`metricKey: "psf"`).
- **Used by** — Script Builder, Content Engine.

---

#### Metric: dom_median

- **Formula** — `median(soldDoms)`. Code: `src/lib/csv-aggregate.ts:373`.
- **Bucket inputs** — median DOM over `sold` rows. Source: CSV **column 3** (current-listing DOM), not CDOM (prompt line 183).
- **Output unit** — days.
- **Output range** — ~5–120+.
- **Sample-size floor** — `SAMPLE_THRESHOLDS.DOM = 5` (`aggregated-metrics.ts:50`).
- **Auto-soften rules applied** — duration soften (`script-content-rules.ts:1938–1942`): `<14d` → "moving fast"; `14–30d` → "a two-to-four week window"; `>30d` → "sitting".
- **Narrative phrasing rules** — "typical-buyer-experience" framing (prompt 178).
- **Authoritative published source** — CREB publishes **average** DOM, not median (prompt 174). Median is the internal/typical view.
- **Methodology version** — `DOM` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:373`; persisted at `aggregated-metrics.ts:128` (`metricKey: "domMedian"`).
- **Used by** — Script Builder, Story Leads.

---

#### Metric: dom_average

- **Formula** — `average(soldDoms)`. Code: `src/lib/csv-aggregate.ts:374`.
- **Bucket inputs** — mean DOM over `sold` rows (CSV column 3).
- **Output unit** — days.
- **Output range** — ~5–130+ (runs ~10 days above median in a typical Calgary month due to long-tail outliers — prompt 174).
- **Sample-size floor** — same `DOM` family floor (5) when persisted.
- **Auto-soften rules applied** — duration soften (as dom_median).
- **Narrative phrasing rules** — declared the **default** DOM `metricValue` (CREB-aligned) in the validator prompt (line 181).
- **Authoritative published source** — CREB **average** DOM (the alignment target).
- **Methodology version** — `DOM` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:374`. **Computed on `AggregatedGroup` but NOT persisted as its own AggregatedMetric row** (`rowsFromGroup` persists `domMedian`, not `domAverage`). See [Known Issues](#known-issues).
- **Used by** — validator-emitted DOM facts; Script Builder DOM framing.

---

#### Metric: sp_lp_ratio (sale-to-list ratio)

- **Formula** — `average(soldSpLpRatios)` — mean of per-row SP/LP. Code: `src/lib/csv-aggregate.ts:375`. Per-row ratio parsed/normalized to a fraction at `csv-aggregate.ts:512` (a precomputed MLS column may supply it; percent-or-fraction normalized).
- **Bucket inputs** — mean over `sold` rows' (sale price ÷ list price).
- **Output unit** — ratio (stored as fraction, e.g. `0.994`).
- **Output range** — ~0.90–1.10; can exceed 1.0 in hot markets (over-list).
- **Sample-size floor** — `SAMPLE_THRESHOLDS.SP_LP = 5` (`aggregated-metrics.ts:51`).
- **Auto-soften rules applied** — percent soften bands (`script-content-rules.ts:1972–1977`): `<2%` → "in line with list"; `2–5%` → "slightly over list"; `5–10%` → "meaningfully over list"; `>10%` → "deep over list"; `<0` → "under list".
- **Narrative phrasing rules** — render fix in `formatMetricValue` (`content-engine-validation.ts:108–111`): stored 0–1 decimal renders as `%`; both `SP_LP` and `SP_LP_ratio` casings observed in production (`METRIC_NAME_LABELS`, lines 69–72).
- **Authoritative published source** — boards vary; often published as a close-to-list %.
- **Methodology version** — `SP_LP` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:375`; persisted at `aggregated-metrics.ts:129` (`metricKey: "spLpRatio"`). `formatValue` SP_LP rendering at `aggregated-metrics.ts:290–294`.
- **Used by** — Fact Validator, Script Builder.

---

#### Metric: moi_strict (months of inventory — strict)

- **Formula** — `active / soldPerMonth`, where `soldPerMonth = sold` (single-calendar-month upload window). Plain math: `active / sold`. Code: `src/lib/csv-aggregate.ts:387–388`.
- **Bucket inputs** — numerator: `active`; denominator: `sold`.
- **Output unit** — months.
- **Output range** — ~0.3–8+. Lower = tighter (seller) market.
- **Sample-size floor** — computed whenever `soldPerMonth > 0` (no floor at compute time). Persistence floor `SAMPLE_THRESHOLDS.MOI = 3` (intentionally permissive; `aggregated-metrics.ts:49`). NB: the standalone helper `monthsOfInventory()` uses a floor of 5 — see [Known Issues](#known-issues).
- **Auto-soften rules applied** — months soften (`script-content-rules.ts:1932–1937`): `<1.5` → "deep seller territory"; `1.5–3` → "tight seller territory"; `3–5` → "approaching balanced"; `>5` → "buyer territory".
- **Narrative phrasing rules** — locked MOI interpretation framework + market_type/trajectory labelling + high-end exception (`fact-validator-prompt.ts:115–135`); `creb_aligned` metadata required (lines 205–210).
- **Authoritative published source** — CREB "months of supply" — but CREB inventory = Active + Pending (so CREB aligns with **moi_inclusive**, not strict). See moi_inclusive.
- **Methodology version** — `MOI` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:388`; persisted at `aggregated-metrics.ts:124` (`metricKey: "moiStrict"`).
- **Used by** — Script Builder, Idea Card generation, paid-search enrichment (`script-plan-enrichment.ts` `MetricFamily.MOI`), Story Leads.

---

#### Metric: moi_inclusive (months of inventory — CREB-aligned)

- **Formula** — `(active + pending) / soldPerMonth` = `(active + pending) / sold`. Code: `src/lib/csv-aggregate.ts:389–390`.
- **Bucket inputs** — numerator: `active + pending`; denominator: `sold`.
- **Output unit** — months.
- **Output range** — ~0.3–9+ (runs ~7–14% above strict at city level — prompt 165).
- **Sample-size floor** — computed whenever `soldPerMonth > 0`. **Not persisted as its own `AggregatedMetric` row** (`rowsFromGroup` persists only `moiStrict`) — it rides as the `moiInclusive` field on `AggregatedGroup` and is emitted by the validator. See [Known Issues](#known-issues).
- **Auto-soften rules applied** — months soften (as moi_strict).
- **Narrative phrasing rules** — every MOI fact must carry BOTH strict and inclusive + `creb_aligned` / `creb_delta_estimate` (prompt 163–210).
- **Authoritative published source** — CREB inventory = Active + Pending → this is the creb.com-aligned view (prompt 165–168).
- **Methodology version** — `MOI` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:390`.
- **Used by** — Fact Validator (secondary `moiInclusive` field), Script Builder framing.

---

#### Metric: failure_rate (v2)

- **Formula** — `offMarket / sold` (a broker-honest ratio; **can exceed 1.0**). Computed via the imported helper `failureRate()` (aliased `failureRateRatio`) then stored **×100** to preserve the percentage-storage convention. Plain math: `(offMarket / sold) × 100`. Code: `src/lib/csv-aggregate.ts:380–381`; helper `src/lib/market-status-buckets.ts:251–255`.
- **Bucket inputs** — numerator: `offMarket` (= expired + terminated + withdrawn); denominator: `sold`.
- **Output unit** — percentage (stored 0–n×100; e.g. 9 off / 10 sold → `90`). Worked example: failure_rate ratio `0.9`.
- **Output range** — 0% to >100% (uncapped; >100% in cooling markets where more listings fail than close). Never cap at 100%.
- **Sample-size floor** — helper requires `sold ≥ 5` **AND** `offMarket ≥ 3` (`MIN_SOLD_SAMPLE = 5`, `MIN_OFF_MARKET_SAMPLE = 3`; `hasSufficientFailureSample`, `market-status-buckets.ts:233–243`) → returns `null` below floor. Persistence adds `SAMPLE_THRESHOLDS.FAILURE_RATE = 5` against `failN = soldCount + offMarketCount` (`aggregated-metrics.ts:142–143`). Double-gated, different bases — see [Known Issues](#known-issues).
- **Auto-soften rules applied** — percent soften bands may touch a bare failure-rate %; but framing is primarily governed by the dedicated narrative rule below.
- **Narrative phrasing rules** — **failure_rate_framing** (ERROR): forbids "X% failed to sell" phrasing because it misreads the offMarket/sold ratio as a share of listings.
  - Idea cards: `checkFailureRateFraming()` — `content-engine-validation.ts:210–214`, applied in `validateIdeaCard` at lines 378–379.
  - Scripts: `ScriptViolationRule "failure_rate_framing"` (`script-content-rules.ts:63`) + `checkFailureRateFraming()` (lines 1109–1130). Honest framings: sale_share ("X% of listings sold") or counts ("for every 10 that sold, 9 failed to sell").
- **Authoritative published source** — **NONE.** Internal metric; no board publishes it. Required `usage_notes` disclosure (prompt 203).
- **Methodology version** — `FAILURE_RATE` family **with `MarketFact.methodologyVersion`**: `v2` = offMarket/sold (current); `legacy_v1` = retired offMarket/(offMarket+sold). `EXCLUDE_LEGACY_FAILURE_RATE` (`market-status-buckets.ts:35–37`) drops legacy_v1 from every citation query.
- **Accuracy status** — not yet verified (no external source to verify against; verify internal consistency only).
- **Code location** — `csv-aggregate.ts:380–381`; helper `market-status-buckets.ts:251–255`; persisted at `aggregated-metrics.ts:143` (`metricKey: "failureRate"`); `formatValue` FAILURE_RATE at `aggregated-metrics.ts:295–297`.
- **Used by** — Fact Validator, Script Builder v2 (+ suggest-improvements), content-engine-context (idea cards), story-lead-fact-resolver, script-data-resolver, script-plan-enrichment, content-plans facts/lineage/save-script routes, member market-data/facts route, wizard save-idea / use-as-video / script page. (All spread `EXCLUDE_LEGACY_FAILURE_RATE`.)

---

#### Metric: active_count / INVENTORY

- **Formula** — count of `active` bucket rows (the measurement itself). Code: `src/lib/csv-aggregate.ts:394` (`activeCount: acc.active`).
- **Bucket inputs** — `active` count.
- **Output unit** — count.
- **Output range** — 0 to thousands.
- **Sample-size floor** — `SAMPLE_THRESHOLDS.INVENTORY = 1` (the count IS the sample; `aggregated-metrics.ts:55`, persisted with `sampleSize = activeCount` at line 137).
- **Auto-soften rules applied** — none specific.
- **Narrative phrasing rules** — none specific.
- **Authoritative published source** — boards publish active inventory (CREB publishes Active + Pending).
- **Methodology version** — `INVENTORY` family; no version field.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:394`; persisted at `aggregated-metrics.ts:137` (`metricKey: "activeCount"`).
- **Used by** — Script Builder, validator INVENTORY facts; `script-data-resolver` maps `active_listings` / `new_listing_count` metricName aliases → `MetricFamily.INVENTORY`.

---

#### Metric: sold_count / sample size

- **Formula** — count of `sold` bucket rows. Code: `src/lib/csv-aggregate.ts:393,396` (`sampleSize = acc.sold`, `soldCount = acc.sold`).
- **Bucket inputs** — `sold` count.
- **Output unit** — count.
- **Output range** — 0 to thousands.
- **Sample-size floor** — n/a (it IS the sample size that gates everything else).
- **Auto-soften rules applied** — none.
- **Narrative phrasing rules** — none.
- **Authoritative published source** — boards publish closed sales counts.
- **Methodology version** — n/a.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:393,396`.
- **Used by** — denominator/sample for every sold-driven metric; `sold_count` appears as a validator metricName alias → INVENTORY family in `script-data-resolver`.

---

#### Metric: offMarketCount / pendingCount (supporting counts)

- **Formula** — counts of the `offMarket` and `pending` buckets. Code: `src/lib/csv-aggregate.ts:395,397`.
- **Bucket inputs** — `offMarket` / `pending` counts.
- **Output unit** — count.
- **Sample-size floor** — `offMarket` feeds failure_rate's `MIN_OFF_MARKET_SAMPLE = 3` gate.
- **Auto-soften / narrative rules** — none directly; feed failure_rate / moi_inclusive.
- **Authoritative published source** — n/a (intermediate inputs).
- **Methodology version** — n/a.
- **Accuracy status** — not yet verified.
- **Code location** — `csv-aggregate.ts:395,397`.
- **Used by** — failure_rate (`offMarket`), sale_share, moi_inclusive (`pending`); `failN = soldCount + offMarketCount` (`aggregated-metrics.ts:142`).

---

### B. Pure ratio helpers (`market-status-buckets.ts`)

These return **ratios** (0..n), `null` below sample floor. `failureRate()` is wired into the aggregation pipeline (imported by csv-aggregate). The other three are **defined and unit-tested but have no runtime/production callers** (only `market-status-buckets.test.ts` exercises them) → orphan metrics (logged in [Known Issues](#known-issues)).

#### Metric: failureRate() helper — **WIRED**
- Formula `offMarket / sold`; `market-status-buckets.ts:251–255`. (See [failure_rate](#metric-failure_rate-v2) above — this is the helper it uses.)

#### Metric: saleShare() — **ORPHAN (deterministic)**
- **Formula** — `sold / (sold + offMarket)`. Code: `market-status-buckets.ts:262–267`.
- **Bucket inputs** — numerator `sold`; denominator `sold + offMarket`.
- **Output unit** — ratio (0.0–1.0, bounded). Worked example: 10 sold + 9 off → `0.526`.
- **Sample-size floor** — `hasSufficientFailureSample` (sold ≥ 5 AND offMarket ≥ 3).
- **Narrative phrasing rules** — `sale_share` is the recommended honest reframe of failure_rate (`checkFailureRateFraming`).
- **Authoritative published source** — none (internal).
- **Methodology version** — n/a.
- **Accuracy status** — not yet verified.
- **Used by** — **No deterministic/runtime caller** (only unit tests). `sale_share` only enters the system as an LLM-emitted MarketFact via the validator prompt (`fact-validator-prompt.ts:197–201`). The deterministic helper is not invoked by `csv-aggregate`. → Known Issue.

#### Metric: absorptionRate() — **ORPHAN**
- **Formula** — `sold / active`. Code: `market-status-buckets.ts:273–277`.
- **Bucket inputs** — numerator `sold`; denominator `active`.
- **Output unit** — ratio (share of standing inventory cleared in the period).
- **Output range** — 0.0 to >1.0.
- **Sample-size floor** — `active > 0` AND `sold ≥ MIN_SOLD_SAMPLE (5)`.
- **Narrative phrasing rules** — none.
- **Authoritative published source** — none (internal; inverse-related to MOI).
- **Methodology version** — n/a.
- **Accuracy status** — not yet verified.
- **Used by** — **No runtime callers** (only `market-status-buckets.test.ts`). → Known Issue (orphan; grep `absorption_rate` string count = 0).

#### Metric: monthsOfInventory() helper — **ORPHAN (duplicate of moi_strict)**
- **Formula** — `active / sold`. Code: `market-status-buckets.ts:283–287`.
- **Bucket inputs** — numerator `active`; denominator `sold`.
- **Output unit** — months.
- **Sample-size floor** — `sold > 0` AND `sold ≥ MIN_SOLD_SAMPLE (5)`.
- **Used by** — **No runtime callers** (only unit tests). `csv-aggregate` computes MOI inline (`active / soldPerMonth`) instead of calling this helper → two MOI implementations with **different floors** (helper = 5, persistence = 3, compute = none). → Known Issue.

---

### C. Validator/LLM-emitted MarketFact metrics

The Fact Validator (Claude) reads the upload + deterministic context and emits prose facts persisted as `MarketFact` with a `metricName` (free token) and `metricFamily` (enum). These are not re-derived in code — they are produced by the LLM under prompt constraints — but they ARE metrics the system produces from upload data and cites downstream.

- **Enum** — `ParsedMetricFamily` (`src/lib/fact-validator-parser.ts:32–42`) and `MetricFamily` (`src/lib/aggregated-metrics.ts:23–33`): `MOI | BENCHMARK | PSF | MEDIAN | AVG | DOM | SP_LP | INVENTORY | FAILURE_RATE | OTHER`. Schema enum at `prisma/schema.prisma:1833`.
- **metricName tokens the prompt instructs** (`fact-validator-prompt.ts:60`): `median_sale_price, median_psf, median_sqft, MOI, DOM, SP_LP, active_listings` (+ `failure_rate`, `sale_share`).
- **metricName → label** map: `METRIC_NAME_LABELS` (`content-engine-validation.ts:64–92`); **metricName alias → family** map for citation: `script-data-resolver.ts` (e.g. `active_listings` / `new_listing_count` / `sold_count` → `INVENTORY`).
- **sale_share** — emitted as the bounded companion to failure_rate (formula `sold / (sold + offMarket)`; prompt 197–201). Output: % of resolved listings that sold.
- **BENCHMARK / AVG** — enum members the validator may emit (e.g. CREB HPI benchmark, average price). `BENCHMARK` has no deterministic computation in `csv-aggregate`; `AVG` only appears as a formatter branch (`aggregated-metrics.ts:281`). → see Known Issues (enum-only families).
- **Per-fact metadata** — `market_type` (sellers/balanced/buyers/balanced_high_end), `trajectory` (tightening/stable/loosening/loosening_fast), `creb_aligned`, `creb_delta_estimate`, `usageClass` (headline_safe / supporting_texture_only / rejected). Code: `fact-validator-parser.ts:16–77`, prompt 115–210.

> **Not a derived metric — clarification:** `binge_target` (grep hit) is **not** a market metric. It is the `binge_target_match` script-validation rule (`script-content-rules.ts`, `binge-target.ts`) that prevents fabricating a "next video" reference. Documented here only to resolve the grep cross-check.

---

## Known Issues

> Logged, **not fixed** (Phase 1 is documentation-only). Severity: `blocker` | `high` | `medium` | `low`.

1. **[high] Orphan metric: `absorptionRate()` is dead code.** Defined + unit-tested at `market-status-buckets.ts:273–277` but has no runtime callers (only `market-status-buckets.test.ts`); `absorption_rate` string count across src = 0. Either wire it into the aggregation pipeline or remove it — currently it can drift untested-against-reality. (Inverse of MOI; if shipped it needs a published-source decision — no board publishes it.)

2. **[high] Orphan metric: deterministic `saleShare()` is never called.** `market-status-buckets.ts:262–267`. `sale_share` reaches members only via LLM prose (validator prompt), with no deterministic ground-truth row to validate the LLM against — exactly the failure mode that produced the failure_rate bug. The narrative rules *recommend* sale_share as the honest reframe, but there is no computed sale_share fact to cite.

3. **[high] Two MOI implementations with three different sample floors.** `csv-aggregate.ts:388` computes `moi_strict` with **no floor** (any `sold > 0`); `aggregated-metrics.ts:49` persists MOI only at `n ≥ 3`; the unused `monthsOfInventory()` helper (`market-status-buckets.ts:283–287`) gates at `n ≥ 5`. Same metric, inconsistent guards → a thin neighbourhood can surface an MOI that the helper would have suppressed.

4. **[high] `dom_average` is the declared default but `dom_median` is what gets persisted.** The validator prompt declares `dom_average` the default DOM `metricValue` for CREB alignment (`fact-validator-prompt.ts:181`), yet `rowsFromGroup` persists `domMedian` as the deterministic DOM AggregatedMetric (`aggregated-metrics.ts:128`). The deterministic "source of truth" diverges from the stated CREB-aligned default by ~10 days.

5. **[medium] `moi_inclusive` is computed but never persisted as its own AggregatedMetric row.** `csv-aggregate.ts:390` computes it (CREB-aligned view), but `rowsFromGroup` persists only `moiStrict`. The inclusive value survives only on the in-memory `AggregatedGroup` + whatever the LLM echoes — so the CREB-aligned number has no durable ground-truth row.

6. **[medium] `median_sqft` computed but not persisted as a standalone metric.** `csv-aggregate.ts:371`; used for mix-shift detection and YoY but never `push()`ed in `rowsFromGroup`. The mix-shift narrative guard depends on a value that has no persisted ground-truth row to audit.

7. **[medium] failure_rate double sample-gating on different bases.** Helper gates on `sold ≥ 5 AND offMarket ≥ 3` (`market-status-buckets.ts:238–243`); persistence re-gates on `failN = sold + offMarket ≥ 5` (`aggregated-metrics.ts:142–143`). A group with sold=5, offMarket=0 passes neither failure_rate gate (helper requires offMarket≥3) but the FAILURE_RATE persistence floor reads `failN=5` — the layered logic is hard to reason about and worth consolidating.

8. **[medium] Unit-storage convention is split for failure_rate.** Helper returns a **ratio**; `csv-aggregate` stores **×100 (percentage)**; `formatValue` FAILURE_RATE treats stored as already-percentage (correct), but the inline comment at `aggregated-metrics.ts:296` says "Stored as a percentage (offMarket/sold * 100)" while the helper docstring says ratio. Mixed mental model → easy to reintroduce a ×100 bug.

9. **[low] Enum-only families with no deterministic computation: `BENCHMARK`, `AVG`, `OTHER`.** Present in `MetricFamily` / `ParsedMetricFamily` and in `formatValue` (`aggregated-metrics.ts:281`), but `metricsFromAccumulator` never computes them. They exist solely for LLM-emitted facts → no ground-truth row ever validates them.

10. **[low] `sp_lp_ratio` casing drift handled defensively, not normalized.** `SP_LP`, `sp_lp`, `SP_LP_ratio`, `sp_lp_ratio` all observed in production rows and individually mapped (`content-engine-validation.ts:69–72`). Tolerated, not normalized at write time → fragile if a new casing appears.

11. **[low] Unknown statuses are surfaced but not blocking.** `countByBucket` returns `unknownLabels`, but whether an upload with a high unknown ratio is *rejected* vs *warned* is a downstream policy decision not encoded here. A new MLS status string silently lands in `unknown` and is excluded from all maths until someone reads the warning.

12. **[low] failure_rate / sale_share / absorption_rate have no published source by design.** Flagged per the task brief: internal metrics with no external authority are the hardest to verify and most prone to drift. Phase 2 should define an internal-consistency check (e.g. failure_rate and sale_share derived from the same two counts must reconcile) in lieu of source verification.

---

## Phase 2 prep checklist

Worklist of (metric × market) pairs to verify against the authoritative published source. ✅ = verify value matches published figure for a chosen month; ⚠ = no external source, verify internal consistency only.

### Calgary / CREB (verify against creb.com monthly package, pick one recent month)
- [ ] median_sale_price × CREB ✅
- [ ] psf × CREB ✅
- [ ] dom_average × CREB ✅ (CREB publishes average DOM — alignment target)
- [ ] dom_median × CREB ✅ (confirm internal "typical" view, ~10d below average)
- [ ] moi_inclusive × CREB ✅ (CREB inventory = Active + Pending)
- [ ] moi_strict × CREB ⚠ (internal view; confirm delta vs inclusive ~7–14%)
- [ ] sp_lp_ratio × CREB ✅
- [ ] active_count (INVENTORY) × CREB ✅
- [ ] sold_count × CREB ✅
- [ ] failure_rate × CREB ⚠ (no CREB equivalent — internal consistency only)
- [ ] sale_share × CREB ⚠ (internal; must reconcile with failure_rate counts)

### Dallas–Fort Worth / NTREIS (confirm authoritative source URL first, then verify)
- [ ] median_sale_price × NTREIS ✅
- [ ] dom_median / dom_average × NTREIS ✅ (confirm which NTREIS publishes)
- [ ] moi_strict / moi_inclusive × NTREIS ✅ (confirm NTREIS inventory composition)
- [ ] sp_lp_ratio × NTREIS ✅
- [ ] active_count / sold_count × NTREIS ✅
- [ ] failure_rate / sale_share × NTREIS ⚠ (internal only)
- [ ] **Pre-req:** confirm the NTREIS published authority + canonical URL + report name (table row currently "needs Phase 2 confirmation").

### Cross-market structural verification (any market with real data)
- [ ] Confirm `offMarket` = expired + terminated + withdrawn matches each board's definition of "off-market / failed".
- [ ] Confirm `pending` exclusions (NTREIS `Active Option Contract` / `Active Contingent` → pending; CREB has no contingent split).
- [ ] Resolve Known Issues #1–#4 (orphans + DOM default/persist mismatch) before trusting any verification — a verified-against-source value is meaningless if the persisted row uses a different formula.

### Internal-consistency checks (no external source)
- [ ] failure_rate (offMarket/sold) and sale_share (sold/(sold+offMarket)) reconcile to the same two counts.
- [ ] Sample-floor consolidation: pick ONE MOI floor; pick ONE failure_rate gating basis.
- [ ] Decide persist-or-remove for absorptionRate, saleShare, monthsOfInventory helpers, moi_inclusive, dom_average, median_sqft.

---

## Appendix: grep cross-check

Spot-check per the task brief — every known metric string accounted for.

| Grep string | src hits (non-generated) | Status |
|---|---|---|
| `median_sale_price` | yes | Documented (deterministic) |
| `failure_rate` | yes (11) | Documented (deterministic v2 + helper + narrative rules + legacy exclusion) |
| `months_of_inventory` | yes (1) | Documented (moi_strict / moi_inclusive; helper is orphan) |
| `absorption_rate` | **0** | Orphan — `absorptionRate()` helper defined+tested, no callers, string never used (Known Issue #1) |
| `days_on_market` | yes (1) | Documented (dom_median / dom_average) |
| `sp_lp_ratio` | yes (3) | Documented |
| `sold_count` | yes (2) | Documented (count + validator alias → INVENTORY) |
| `active_count` | yes (2) | Documented (INVENTORY) |
| `new_listing_count` | yes (2) | Validator metricName alias → `MetricFamily.INVENTORY` in `script-data-resolver.ts`; no separate deterministic computation |
| `sale_share` | yes (6) | Documented (LLM-emitted; deterministic helper is orphan, Known Issue #2) |
| `binge_target` | yes (4) | **Not a metric** — `binge_target_match` script-validation rule (`script-content-rules.ts` / `binge-target.ts`) |
| `moi_strict` / `moi_inclusive` | yes (4/4) | Documented |
| `dom_median` / `dom_average` | yes (5/5) | Documented (Known Issue #4: default vs persisted mismatch) |

**Metrics documented:** 18 distinct metric entries —
median_sale_price, median_sqft, psf, dom_median, dom_average, sp_lp_ratio, moi_strict, moi_inclusive, failure_rate, active_count (INVENTORY), sold_count, offMarketCount/pendingCount (supporting counts), saleShare (orphan), absorptionRate (orphan), monthsOfInventory helper (orphan), sale_share (LLM-emitted), plus enum-only families (BENCHMARK/AVG) noted.

**Known Issues:** 12 total — high: 4 (#1–#4), medium: 4 (#5–#8), low: 4 (#9–#12).
