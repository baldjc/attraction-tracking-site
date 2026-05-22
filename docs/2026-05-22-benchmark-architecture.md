# Benchmark architecture audit — multi-market readiness

**Date:** 2026-05-22
**Scope:** Read-only audit of how the Fact Validator pipeline acquires (or fails to acquire) CREB-style Benchmark / HPI data, and what would change for non-Pillar-9 markets.
**Trigger:** 2026-04 smoke test produced 454 facts with `MetricFamily.BENCHMARK = 0`. Originally diagnosed as a Calgary CSV gap. This audit reframes it as a multi-market architectural question.

---

## 1. `MarketConfig` schema — what's configurable per-market

### Prisma model (`prisma/schema.prisma` lines 1729-1747)

| Field | Type | Configurable? | Notes |
|---|---|---|---|
| `id` | String (cuid) | — | PK |
| `userId` | String (unique) | — | 1:1 with User |
| `marketName` | String | ✅ free text | e.g. "Calgary", "GTA" |
| `mlsSource` | String? | ✅ free text | e.g. "Pillar 9", "TRREB" — display-only label, NOT used to switch parsers |
| `columnMapping` | Json? | ✅ per-field | See §1.1 |
| `priceTiers` | Json? | ✅ array of `{name, maxPrice}` | Defaults to Entry/Mid/Upper/Luxury at $500K/$800K/$1.5M/∞ |
| `moiThresholds` | Json? | ✅ `{sellers, buyers}` | Defaults 2.5 / 4.0 |
| `neighbourhoodVocab` | Json? | ✅ string[] | Member's preferred names (not currently used by aggregator) |
| `highEndException` | Json? | ✅ `{enabled, priceThreshold, propertyTypes[]}` | |
| `keywordKit` | Json? | ✅ pillars + longTail templated on `{{marketName}}` | |
| `primaryAvatar` | Json? | ✅ Avatar Architect snapshot | |
| `subPersonas` | Json? | ✅ preset + custom personas | |
| `configuredAt` / `updatedAt` | DateTime | — | Audit columns |

### 1.1 ColumnMapping shape (`src/lib/market-config.ts` lines 5-27)

```ts
CANONICAL_FIELDS = ["date", "neighbourhood", "salePrice", "listPrice",
                    "daysOnMarket", "sqft", "propertyType"]
OPTIONAL_FIELDS  = ["bedrooms", "bathrooms", "yearBuilt", "mlsNumber", "status"]
type ColumnMapping = Partial<Record<AnyMappedField, string>>
```

A member can map any source CSV header → any of these **12 canonical fields**. There is **no canonical field for benchmark, HPI, composite index, or any composition-adjusted price metric**.

---

## 2. Hardcoded assumptions in `src/lib/csv-aggregate.ts`

The aggregator does **not** hardcode CSV header literals (every cell read goes through `readMappedCell(row, headerLookup, mapping.<field>)` at lines 459-489). But it **does hardcode Pillar-9-shaped semantic vocabulary**:

### 2.1 Hardcoded enum values

| What | Where | Pillar-9 specific? |
|---|---|---|
| Status codes: `Active / Pending / Sold / Expired / Terminated / Withdrawn` | type def line 31-37, normalizer lines 177-189 | ✅ — TRREB uses `Sold Conditional`, `Sold Firm`, `Suspended`, `Leased`. CREA's national feed uses different statuses again. Normalizer is loose (prefix-match) but the **6 enum values themselves are baked into the type system** and feed `RowAccumulator` counters. |
| Property-type buckets: `Detached / Semi-Detached / Row/Townhouse / Apartment` | lines 157-175 | ⚠ Partly — string aliases (`condo`, `townhouse`, `half duplex`, `full duplex`) try to be MLS-agnostic, but the four output buckets are Calgary's CREB categories. TRREB has `Condo Apt`, `Condo Townhouse`, `Att/Row/Twnhouse`, `Semi-Detached`, `Detached`, `Link`, `Co-Ownership Apt`, etc. The current normalizer would silently mis-bucket those. |
| Property-type rollup: Full Duplex → Semi-Detached | lines 164, 307-311 | ✅ Hardcoded per CREB convention. |
| `"All Neighbourhoods"` rollup key | lines 520-521, 537-538 | Neutral string but the **concept** of a city-wide rollup assumes a single city per upload. |

### 2.2 Hardcoded metric calculations (algorithmic, not configurable)

- **MOI strict** = Active ÷ Sold-per-month
- **MOI inclusive** = (Active + Pending) ÷ Sold-per-month
- **Failure rate** = (Expired + Terminated + Withdrawn) ÷ (Sold + Expired + Terminated + Withdrawn)
- **PSF** = sale price ÷ sqft (per row, then median)
- **DOM median/average** computed from CSV's `daysOnMarket` (CREB convention: current-listing DOM, NOT CDOM)

These formulas implicitly require: (a) status column with the 6 Pillar 9 values, (b) numeric sqft, (c) DOM that means "days on current listing" — none of which are guaranteed for other MLS feeds.

### 2.3 Hardcoded metric names emitted to facts

`metricName` values used by YoY/rolling lookup at line 568: `"median_sale_price", "median_sqft", "psf", "MOI"`. No `creb_benchmark`, no `hpi`, no `composition_index`.

### 2.4 Bucket dimensions (lines 533-539)

Five rollup dimensions are baked in: (n,pt,tier), (n,pt,—), (n,—,—), (All,pt,—), (All,—,—). No price-tier-only rollup, no zone rollup (zone tracking is wired but currently always null — line 475 `mapping.zone` doesn't exist in `AnyMappedField`).

---

## 3. Is `benchmarkSource` / HPI column mapping configurable?

**No.**

- `ColumnMapping` has 12 canonical/optional fields. None of them are benchmark, HPI, composite, or composition-adjusted price.
- The aggregator never emits a `BENCHMARK` family fact — there is **no code path that constructs one**. As of the Wave 1 Phase 2A close-out, the validator prompt (`src/lib/fact-validator-prompt.ts:63`) carries a single PIPELINE GAP line acknowledging that BENCHMARK/HPI is not plumbed in and instructing the model not to emit BENCHMARK facts or scan for benchmark-anchored patterns. All other BENCHMARK rules, examples, and enum slots have been removed; PSF is the price-direction signal.
- `mlsSource` (e.g. "Pillar 9") is a free-text label only. Nothing in the code branches on it.
- `MarketConfig` has no field for: benchmark feed URL, benchmark CSV path, benchmark API key, benchmark column mapping, benchmark refresh cadence, benchmark cutoff date.

### 3.1 Rough cost to make it configurable

A pure column-mapping fix is **not sufficient** — benchmark data does not live in the sales CSV (see §4). So the change is genuinely architectural:

| Change | Files | LOC | Notes |
|---|---|---|---|
| Add `benchmarkSource` + `benchmarkFeedConfig` JSON fields to `MarketConfig` | `prisma/schema.prisma`, `src/lib/market-config.ts`, `src/lib/market-config-server.ts` | ~30 | DB migration required (Prisma migrate) |
| New ingest module for benchmark feed (CSV upload or API pull) | `src/lib/benchmark-ingest.ts` (new), object-storage wiring | ~150 | Has to handle at least 2 feed shapes: CREB's per-neighbourhood HPI CSV, and a "manual numbers" form for markets with no public feed |
| New `MarketBenchmarkSnapshot` table OR extend `MarketDataUpload` | `prisma/schema.prisma`, migration | ~20 | Decision point: is benchmark tied to a sales upload (per-month sync) or independent? |
| Aggregator: emit `BENCHMARK` group rows that get fed to the validator | `src/lib/csv-aggregate.ts` | ~50-80 | New `AggregatedGroup.benchmark` field + plumbing |
| UI: column-mapping page extension + benchmark feed picker | `src/app/member/market-data/setup/*` | ~200 | Member-facing config |
| Admin / validator: nothing to change — prompt is already written to consume BENCHMARK when present | — | 0 | ✅ |
| **Total** | | **~450-500 LOC + 1 DB migration + 1 UI page** | Realistic 2-3 day build assuming feed shape is decided up front |

---

## 4. Calgary CSV header audit (2026-04 upload)

**File:** `Calgary Monthly Market Stats - Sale Pulls - 04-26.csv` (object storage key `market-data/c3d00532-…/0452ab30-….csv`, 9,355 rows)

### 4.1 Full header list (20 columns)

```
Status | MLS# | DOM | CDOM | List Price | Close Price | Close Date |
Address | City | Subdivision | Zone | RMS Total | Subtype |
Year Built | Orig LIst Price | Current Price | Lot Size (Acres) |
$ / Sq Ft | SP/LP | SOLD $ / Sq Ft
```

### 4.2 (a) Does Pillar 9 include CREB Benchmark in this export?

**No.** This is the standard Pillar 9 "Sale Pulls" transactional export — one row per listing/transaction, no composition-adjusted aggregates. CREB Benchmark / HPI is **published separately by CREB Statistics** (monthly PDFs + a downloadable CSV at creb.com/statistics, plus a public HPI feed). It is a *statistical product* derived from the underlying MLS, not a column on the MLS itself.

This is fundamental, not fixable in the Pillar 9 export. Any market's transactional MLS feed will have the same property: benchmark/HPI is always a separate aggregate, not a column on per-listing rows.

### 4.3 (b) Benchmark-adjacent columns present

| Column | What it is | Why it's NOT benchmark |
|---|---|---|
| `$ / Sq Ft` | List PSF (current price / sqft) for active+pending | Per-listing, not composition-adjusted |
| `SOLD $ / Sq Ft` | Realised PSF on closed sales | Per-transaction, not composition-adjusted |
| `SP/LP` | Sale-to-list ratio | Per-transaction |
| `Close Price` | Realised sale price | Per-transaction |
| `Current Price` / `Orig LIst Price` | Listing prices | Per-listing |

PSF is the closest functional substitute (and the validator prompt already treats PSF as headline-safe for price-direction claims — see prompt line 75). But none of these is HPI.

### 4.4 (c) Is "Calgary detached overall" computed or pulled from a rollup row?

**Computed.** The aggregator builds five bucket dimensions in `aggregateUpload()` (csv-aggregate.ts:533-539), one of which is `("All Neighbourhoods", propertyType, null)`. The "Calgary detached overall" group row referenced in MarketStoryLead #1 ("Calgary detached overall at 2.03 MOI") was computed by `tallyRow()` summing all 663 detached rows in the CSV, not pulled from any input row. There are no rollup rows in the Pillar 9 export.

---

## 5. Architectural options

### A) Add `benchmarkSource` + columnMappings to MarketConfig now, Calgary uses it, others get null until configured

The "ship Calgary properly + don't paint into a corner" option. The DB migration is small (one Json column on `MarketConfig`, one new table for benchmark snapshots). The ingest module is ~150 LOC. The UI is one new mapping page. Calgary admins upload a CREB HPI CSV monthly (or you pull it via cron from CREB's public stats), the aggregator emits ~50 BENCHMARK group rows per upload, and the validator prompt re-introduces BENCHMARK rules and emission slots. ~3 days end-to-end. The architecture decision you'd make now ("benchmark is a separate snapshot, not a column on the sales CSV") matches how every MLS in North America actually structures this data.

### B) Ship Calgary-only validator now, defer benchmark ingest to Wave 2 (close-out trim already applied)

The current validator produces ~420 high-quality facts for Calgary per run and the chunked architecture is stable. BENCHMARK family is genuinely orthogonal to single-market correctness — every MOI/PSF/MEDIAN/DOM/SP_LP/FAILURE_RATE row is already operator-grade for Calgary, and PSF covers the price-direction claim that BENCHMARK would otherwise own. Phase 2A trims BENCHMARK rules/enum/scan-recipe references out of the prompt and replaces them with a single PIPELINE GAP line, so the model stops spending output budget on BENCHMARK reasoning. Wave 2 is the natural place to confront the "non-Pillar-9 MLS" problem holistically — at that point you'll address the hardcoded property-type buckets, the Pillar-9-shaped status enum, DOM-vs-CDOM conventions, AND benchmark all together rather than bolting benchmark in twice (once for Calgary, again differently for GTA).

### C) Punt BENCHMARK family entirely — rely on PSF + mix-shift-checked MEDIAN as the appreciation-claim path for all markets, permanently

Functionally defensible: PSF is composition-aware at the per-listing level (it implicitly controls for size), and MEDIAN with `compositionShiftFlag` already surfaces when a median move is sqft-driven rather than price-driven. You delete the BENCHMARK enum value entirely (DB migration + Prisma regen), and never solve "where does each market's HPI come from". Risk: real-estate audiences are trained on HPI talking points and operators will ask "why aren't you using the benchmark number CREB just published?" — this is a *market expectations* problem more than a *data quality* problem.

---

## 6. Recommendation: **Option B** (defer benchmark ingest to Wave 2)

Two reasons it wins over A (build now):

1. **Wave 1 is shipping Calgary, not multi-market.** Building a benchmark ingest path now bakes in Calgary-specific assumptions (CREB CSV shape, monthly cadence, neighbourhood vocabulary) that Wave 2 will then have to untangle when GTA / REBGV / REIN show up. The "BENCHMARK is a separate composition-adjusted feed" insight is universal — but the *concrete plumbing* (feed shape, ingest cron, mapping UI, MarketBenchmarkSnapshot schema) is best designed once, against the second market's real constraints, not retro-fitted from a Calgary prototype.

2. **The 2A trim has already reclaimed the prompt cost.** The validator prompt no longer references BENCHMARK except in the single PIPELINE GAP line, and the model no longer spends output tokens speculating about a benchmark column. The verified run shows the change is behavior-preserving (418→422 facts, identical leads, identical cost). There is no longer a "dead text" tax to pay for waiting.

Two reasons it wins over C (kill BENCHMARK forever):

1. **PSF is a per-listing metric.** It controls for size but not for mix (neighbourhood mix, year-built mix, lot-size mix, condition mix). HPI is a regression-based product designed to absorb all of those. They aren't substitutes — they're different tools. A real-estate professional listening to your audit content WILL notice the difference, eventually.

2. **Audience trust.** "CREB's benchmark price for Hillhurst detached is down 1.8% YoY" is the canonical Calgary market-update sentence. Your Content Engine cannot produce it from PSF + MEDIAN no matter how clever the prompt is. Option C produces correct content; Option B keeps the door open to *credible* content in Wave 2.

### What Option B does NOT solve (carried into Wave 2)

- Non-Pillar-9 status enums (TRREB's `Sold Conditional`, etc.)
- Non-CREB property-type buckets (TRREB's `Condo Apt`, REBGV's strata categories)
- Markets with no public HPI feed (the manual-entry path is in scope but the data quality story is different)
- DOM-vs-CDOM convention differences

These are real, but they're all "second market onboarding" problems, not "Calgary in production" problems. Wave 2's first cut at a non-Calgary market will surface them all at once, and they're best solved together.

---

## Appendix: cited line numbers

- `prisma/schema.prisma` lines 1729-1747 — MarketConfig model
- `prisma/schema.prisma` enum `MetricFamily` includes `BENCHMARK` (already declared)
- `src/lib/market-config.ts` lines 5-27 — CANONICAL_FIELDS, OPTIONAL_FIELDS, ColumnMapping
- `src/lib/market-config.ts` lines 236-247 — MarketConfigShape interface
- `src/lib/market-config-server.ts` line 58 — `prisma.marketConfig.findUnique`
- `src/lib/csv-aggregate.ts` lines 31-37, 177-189 — hardcoded Pillar-9 status enum
- `src/lib/csv-aggregate.ts` lines 157-175 — hardcoded property-type buckets
- `src/lib/csv-aggregate.ts` lines 459-489 — all CSV reads go through ColumnMapping (no hardcoded headers)
- `src/lib/csv-aggregate.ts` lines 533-539 — five rollup dimensions
- `src/lib/csv-aggregate.ts` line 568 — hardcoded `metricName` list excludes benchmark/hpi
- `src/lib/fact-validator-prompt.ts` line 63 — single PIPELINE GAP line is the only remaining BENCHMARK reference after the Wave 1 Phase 2A trim (all rules/enum slots/scan recipes removed)
- Calgary CSV: 20 columns, no benchmark/HPI column present
