---
name: KB neighbourhood data-management & exclusion list
description: Member-facing view/delete/reset of neighbourhood data; how the persistent exclusion list keeps junk gone across re-uploads, and the matching/atomicity gotchas.
---

# Member neighbourhood data-management

A member can VIEW every store a neighbourhood name lives in, DELETE one neighbourhood from all stores, or FULL RESET (scope kb|market|both, hard type-to-confirm "RESET"). A neighbourhood name can live in FOUR member-scoped stores simultaneously: `MarketConfig.neighbourhoodVocab` (JSON array), `NeighbourhoodProfile`, `MarketFact`, `AggregatedMetric`. A complete delete must hit ALL of them.

## Normalized matching is mandatory for delete
**Rule:** match on the shared `normalizeNeighbourhoodKey` (trim + collapse internal whitespace + lowercase), NOT a Prisma `{ equals, mode: "insensitive" }` filter.
**Why:** `mode:"insensitive"` only ignores case — it leaves whitespace variants ("South  Terwillegar" vs "south terwillegar ") behind, so a "delete" silently leaves residual fact/metric rows and breaks the "removed from every store" guarantee. The exclusion key, vocab merge, and ingest filters all already normalize, so a case-only delete is inconsistent with the rest of the system.
**How to apply:** Prisma can't normalize whitespace in SQL → fetch candidate rows (`select id, neighbourhood` by userId), filter by normalized-key equality in app code, then `deleteMany({ where: { userId, id: { in: ids } } })`. Do the same vocab read-modify-write you already do.

## Atomicity
Wrap the writes (vocab update + the three deleteManys + exclusion upsert) in ONE `prisma.$transaction([...])` so a mid-flight failure can't leave rows deleted but the exclusion unrecorded. Do the READS (id gathering) outside the tx to keep it short (avoids interactive-tx P2028 budget issues). Per-member single-neighbourhood row counts are small enough that a whole-table-per-member findMany is fine.

## Persistent exclusion list (`ExcludedNeighbourhood`)
`@@unique([userId, normName])`. On delete, the name is added; ingest (`fact-validator` persist + vocab auto-populate, `aggregated-metrics` persist) and READ surfaces (`computeCut` availability dims + cut rows) all filter against `getExcludedNeighbourhoodKeys(userId)` (returns a **Set**) so junk stays gone across re-uploads until the member un-excludes it.
**Helper arg order gotcha:** `isExcluded(set, name)` and `filterExcludedNames(set, names)` take the Set FIRST. Real call sites use `isExcluded(excludedKeys, n)` — easy to flip and the type error is a runtime `set.has is not a function`.

## Hard guarantees the routes must never violate
- Never delete the `MarketConfig` row (holds voice/avatar) — only blank its `neighbourhoodVocab` field on a kb/both reset.
- Refuse protected rollup labels (all neighbourhoods / all other neighbourhoods / all areas / overall) — downstream aggregate cuts depend on them (`isProtectedRollup`).
- Never touch `ContentPlan` (saved Planner scripts), `ContentProfile`, or another member's data.
- Reset does NOT clear the exclusion list (member's hygiene choices persist).
