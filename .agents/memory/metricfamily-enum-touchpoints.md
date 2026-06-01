---
name: MetricFamily enum touch-points & validator parser non-exhaustiveness
description: What you must update when adding a MetricFamily value, and why the validator parser does NOT track the generated enum.
---

Adding a value to the Prisma `MetricFamily` enum (schema + migration) requires updating
every exhaustive `Record<MetricFamily, …>` map or `tsc` fails:
- `SAMPLE_THRESHOLDS` (aggregated-metrics) — the per-family sample floor.
- `METRIC_INSTRUCTION` (on-demand-extractor) — the LLM extraction instruction.
- plus the local TS `MetricFamily` union + `formatValue` + resolver `unitForFamily`.

**Why:** these are typed `Record<MetricFamily, …>`, so a new arm is mandatory; missing
one only shows up as a `tsc` error, not at runtime.

**Deliberately NOT exhaustive:** `ParsedMetricFamily` / `normalizeMetricFamily` in
`fact-validator-parser.ts` is a *separate hand-maintained union*, independent of the
generated enum. Unknown families emitted by the LLM normalize to `OTHER` by design.
So a deterministic-only family (e.g. ABSORPTION, persisted by `rowsFromGroup` but never
asked of the validator) does NOT need a parser arm. Only add one if the validator prompt
actually instructs the LLM to emit that family as a MarketFact.

**How to apply:** when wiring a new family, decide first whether it is deterministic-only
(persistence + formatter + floor) or also LLM-emitted (then also extend the prompt token
list AND the parser union). Don't reflexively mirror the generated enum into the parser.
