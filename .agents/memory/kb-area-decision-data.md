---
name: KB neighbourhood decision data lives only in the raw CSV
description: Per-name homes/sold/city/sample-address for the KB cleanup UX can't come from the DB; reconstruct from the latest validated upload CSV in Object Storage.
---

# KB cleanup decision data is not in the DB

For the Knowledge-Base neighbourhood-cleanup UX, members need per-raw-name
context to judge whether two names are the same place: home count, sold count,
city, and a sample street address. **None of city/address exist as DB columns** —
`AggregatedMetric` and `MarketFact` carry neither. Only `homes`/`sold` are
derivable from facts; city + address live solely in the raw uploaded CSV.

So the per-name stats are reconstructed by reading the member's **latest
validated upload CSV from Object Storage** and grouping by the RAW neighbourhood
name (`columnMapping.neighbourhood`). City uses `columnMapping.city` (optional
mapped field) or an auto-detected city/municipality/town header; address is
auto-detected (no mapping field exists for it).

**Why:** this keeps the names byte-for-byte the pre-merge raw names the member is
comparing (post-merge canonical names won't always join → graceful "no stat"),
and avoids touching the proven reconciliation/persistence engine.

**How to apply:**
- This is read-only context, NEVER a write/re-aggregation path. Degrade to
  `available:false` on any failure — never throw into the request.
- Object Storage has no built-in timeout; bound the read (Promise.race).
- The join key between discovered names (`MarketFact.neighbourhood`) and the CSV
  stat map is trim+lowercase on BOTH sides. Pre-merge they match; post-merge
  canonical names may miss → intentional graceful degradation.
- When you add a backend stat field (e.g. `sampleAddress`), surface it in EVERY
  decision surface (discovered list `describeStat`, merge-panel variant rows),
  not just the payload — an unsurfaced field is a silent miss against the spec.
