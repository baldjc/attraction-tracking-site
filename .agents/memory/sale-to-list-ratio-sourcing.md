---
name: Sale-to-list (SP/LP) ratio sourcing
description: SP/LP can come from a precomputed MLS column, not only from per-row sale/list prices, and how that column is normalized.
---

# Sale-to-list (SP/LP) ratio sourcing

The SP/LP metric is NOT only derivable from per-row salePrice/listPrice. Many
MLS exports ship a precomputed sale-to-list ratio column directly (formats vary
widely by MLS system, and some exports include the ratio but NOT a usable list
price). So SP/LP availability must be driven by "ratio data present" — either a
mapped precomputed ratio column OR list-price data — not list price alone.

**Normalization:** precomputed ratio columns appear either as a fraction
(~0.98) or as a percent (98 / "98%"). Normalize to a fraction; treat any value
above ~3 as a percent (no real SP/LP fraction exceeds ~2) and divide by 100.
The aggregator prefers a mapped precomputed ratio per Sold row and falls back to
salePrice/listPrice when absent.

**Why:** members reported "no sale-to-list ratio data" in Idea Validation even
though their exports clearly contained it — the pipeline had no way to map a
ratio column and only ever derived SP/LP from prices.

**How to apply:** the precomputed ratio is an OPTIONAL mapped field — it must
never block CSV preflight/save. When adding new ratio-style metrics, follow the
same percent-or-fraction normalization and prefer-mapped-then-derive pattern.
