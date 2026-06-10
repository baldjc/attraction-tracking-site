---
name: Failure-rate methodology revert + citation exclusion
description: failure_rate is BOUNDED again; how EXCLUDE_LEGACY_FAILURE_RATE filters legacy/impossible rows; the unbounded-but-≤100 residual; the framing safety net.
---

## Methodology has flip-flopped — current truth: BOUNDED
The metric's denominator changed twice, so trust the helper, not old prose:
- Earliest: `offMarket/(sold+offMarket)` (bounded). Stamped `methodologyVersion="legacy_v1"`, excluded from citation.
- Interim "v2": `offMarket/sold` (UNBOUNDED, can exceed 100%). Stamped `"v2"`, citable.
- **Current (reverted):** `offMarket/(sold+offMarket)` again — bounded 0..1, exact complement of `saleShare` (sum to 1). New facts still stamped `"v2"`.

**Why it matters:** legacy_v1's denominator == today's denominator, so "X% failed to sell" with X≤100 is HONEST framing now. The legacy_v1 exclusion is retained for off-market COUNT-definition differences, not the denominator.

## EXCLUDE_LEGACY_FAILURE_RATE (Prisma `where` fragment)
Array-`NOT` form: drops a FAILURE_RATE row if EITHER `methodologyVersion="legacy_v1"` OR `metricValue > 100`.
- **The >100 clause** deterministically catches pre-revert unbounded values that were stored under `"v2"` and are otherwise indistinguishable by tag from honest bounded v2 facts. A bounded share can never exceed 100, so no legitimate row is ever dropped; nulls are unaffected by `gt:100`.
- **Keep it array-`NOT`** (`NOT: [c1, c2]`) — preserves the single top-level `NOT` key that every spread call site relies on. Switching to top-level `AND` would collide with `...spread`.
- **Rule:** spread `...EXCLUDE_LEGACY_FAILURE_RATE` into EVERY member-facing marketFact query that surfaces a metric VALUE (citation/link/display) — the surface is much wider than the obvious resolvers. **Exempt:** name-only/`distinct select:{neighbourhood}` discovery queries (excluding could drop a hood) and the post-insert re-fetch in fact-validator.

## Unresolved residual (flagged, NOT fixed — was out of scope)
Legacy unbounded values that happen to land ≤100 are **indistinguishable by value or tag** from honest bounded facts, so they survive the filter. Durable fix = methodology re-tag (e.g. `"v3"` for bounded) + re-validation/backfill across members; deferred because it costs paid re-validation and wasn't requested.

## failure_rate_framing guards (script-content-rules.ts + content-engine-validation.ts)
Defense in depth for the residual. Both `checkFailureRateFraming` fire ONLY when a failure figure exceeds 100% — bounded ≤100% prose passes. They match failure-VERB phrasing ("47% failed to sell") AND named-metric phrasing ("the failure rate / failure-to-sell rate was 178%"). **Gotcha:** the percent-capture gap MUST be lazy (`[^.?!\n]{0,40}?`) — a greedy gap mis-captured digits (grabbed "5" out of "115"), defeating the >100 gate.

## Internal-only stale prose
`failureRateFormula` / `usageNotes` MarketFact fields can still hold old ">100% ratio" prose. They're read ONLY in `fact-validator.ts` + `fact-validator-parser.ts` (ingest bookkeeping) — no member/Jarvis/script path selects them, so stale prose there needs no paid re-validation.
