---
name: NTREIS salePrice column-mapping mismatch silently kills price metrics
description: Why a market-update script fails the content-rule wall and the summary shows "–" for median price / price-per-sqft — the mapped sold-price column doesn't exist in the CSV
---

# Symptom
A member's market-update script will not generate — Jarvis `build_script` fails the
content-rule wall ("couldn't write a script that passes your content rules after 3
attempts — link more facts"), and the pre-draft summary renders **median price** and
**price-per-sqft** as "–". The 90-day section also looks impoverished (no MEDIAN / SP_LP
period rows).

# Root cause (NOT trimming, NOT the prompt)
The member's saved `MarketConfig.columnMapping.salePrice` points at a header that does
**not exist** in their CSV. NTREIS exports name the sold-price column **"Close Price"**
(and ship precomputed **"Close-List Price Ratio"** for SP/LP and **"ClosePrice/SqFt"**),
but the mapping was set to **"Sale Price"**. `readMappedCell` returns `null` for every
row → `acc.soldPrices` is empty → `median(acc.soldPrices)` is `null` → `median_sale_price`
and `spLpRatio` are **never persisted**. `SqFt`, `Original List Price`, `Status`,
`Close Date` map fine, so MOI / DOM / failure-rate / **median_sqft** all compute — which
is why the dataset looks "mostly populated" while price metrics are silently absent.

Downstream: `getSourceOfTruthMetrics` (reads AggregatedMetric) returns NO MEDIAN/SP_LP
family; `pooled90dToSourceOfTruth` emits no MEDIAN/SP_LP because `g.medianPrice`/
`g.spLpRatio` are null (the emitter code at aggregated-metrics.ts is correct — it just
has nothing to emit). With no anchorable price fact, any price the writer states trips
`unanchored_stat`, so the market-update slot can never pass.

**Why:** a mapped-but-absent column USED to fail open (silent null), not loud.

**Now guarded:** `buildBuckets` (the shared monthly+pooled-90d normalization path) THROWS
if a mapped `salePrice`/`listPrice` header doesn't resolve to a real CSV header (same
`normalizeHeader`/`headerLookup` semantics as the cell reads, so no false-positive on
case/whitespace variants); missing `saleToListRatio` is warn-only. So this defect now
fails loud at validation/aggregation time instead of producing a price-less dataset.
A bad mapping must still be corrected per-member, then the affected uploads re-validated.

**How to apply:** when a market-update script won't generate or a member's median
price / SP-LP / price-per-sqft is missing or "–", FIRST dump the member's CSV header row
and compare against `columnMapping` (esp. `salePrice`, `saleToListRatio`). For NTREIS:
`salePrice → "Close Price"`, optional `saleToListRatio → "Close-List Price Ratio"`. Fixing
the mapping requires a re-validate / re-aggregate of the affected uploads so the price
families repopulate. Suspect a systemic NTREIS mapping default if more than one NTREIS
member is affected.
