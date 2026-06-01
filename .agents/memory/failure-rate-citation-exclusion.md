---
name: Failure-rate legacy citation exclusion fan-out
description: Where EXCLUDE_LEGACY_FAILURE_RATE must be spread, and which marketFact reads are intentionally exempt.
---

The legacy failure_rate methodology bug (off/(off+sold) instead of off/sold) was fixed by stamping pre-existing rows `methodologyVersion="legacy_v1"` and gating them out of citation with `EXCLUDE_LEGACY_FAILURE_RATE` (a Prisma `{ NOT: { metricFamily:"FAILURE_RATE", methodologyVersion:"legacy_v1" } }` exported from `market-status-buckets.ts`).

**Rule:** EVERY member-facing `marketFact` query that surfaces a metric VALUE for citation/linking/display must spread `...EXCLUDE_LEGACY_FAILURE_RATE` into its `where`. The citation surface is much wider than the obvious resolvers — it spans script-builder routes, suggest-improvements (both the linked query AND the headline-safe pool), the wizard script page, save-idea, use-as-video by-id validation, content-plans facts/save-script/lineage, script-plan-enrichment, plus the core resolvers (script-data-resolver, story-lead-fact-resolver, content-engine-context, fact-validator headline query, member market-data/facts route).

**Why:** A single missed query silently re-exposes the buggy metric. The first pass only covered ~5 resolvers; code review found ~9 more leaks. Treat any new value-surfacing marketFact read as in-scope by default.

**Intentionally exempt (do NOT add it):**
- Neighbourhood-discovery queries that `select` only `neighbourhood` (distinct) — e.g. use-as-video hoodRows, knowledge-base discovered-neighbourhoods. They read names, not values; excluding could drop a hood.
- The post-insert re-fetch in fact-validator (`where: { uploadId }`) that returns just-written v2 rows.

The exclusion is intentionally narrow: it drops only legacy_v1 FAILURE_RATE, preserving v2 failure_rate and every other family/version.
