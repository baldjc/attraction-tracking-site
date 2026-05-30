---
name: Fact validator is Calgary/CREB/Pillar-9 locked
description: Why non-Calgary (wide NTREIS) markets extract far fewer facts than the Calgary baseline.
---

# Fact extraction underperforms on non-Calgary markets

The fact-validator system prompt (`fact-validator-prompt.ts`) hardcodes a
single market's domain: Calgary team identity, Pillar-9 CSV status codes
(Active/Pending/Sold/Expired/Terminated/Withdrawn), Pillar-9 property-type
strings, CREB reconciliation + "CREB publishes a 9-tier breakdown", Calgary
price-tier bands ($300K bands, $1.5M+ high-end MOI exception), and Calgary-
specific curation scans. The metric-calculation rules are labelled "LOCKED".

**Two compounding causes of 5-10x fewer facts on a wide non-Calgary market
(e.g. NTREIS/Texas):**
1. **Domain mismatch.** Rows whose status codes / property types / tier bands
   don't match the LOCKED Calgary schema get rejected or skipped, and the CREB
   reconciliation framing is meaningless off-Calgary.
2. **Serialization budget pruning.** The unsplittable SUMMARY+LEADS path runs
   `selectGroupsForSerialization` under `PER_CALL_GROUPS_CHAR_BUDGET` /
   `GROUPS_CHAR_BUDGET` and escalates a sample-size threshold to fit. A wide
   market split into hundreds of small-sample neighbourhoods has its long tail
   pruned before the model sees it; combined with the n>=30 headline floor,
   most small neighbourhoods never become facts. (See
   `market-validator-overflow.md` for the related hard-overflow failure.)

**Fix direction (NOT yet applied):** parameterize market identity, status-code
map, property-type normalization, tier bands, and source-authority (CREB) from
`MarketConfig` instead of hardcoding; and stop pruning the small-neighbourhood
long tail before extraction (the facts path is chunkable — keep small groups,
emit supporting-texture facts) so wide markets aren't starved.

**How to apply:** when diagnosing "this member gets too few facts," first check
whether their market matches the Calgary/Pillar-9/CREB assumptions, then check
whether the serialization budget dropped their small neighbourhoods.
