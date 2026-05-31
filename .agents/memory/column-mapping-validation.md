---
name: Column mapping validation
description: Why persisted market-data CSV column mappings must be strictly validated at every write entry point.
---

# Column mapping validation

`MarketConfig.columnMapping` is JSON storing per-field → CSV-header strings. It is
written from untrusted client input through MORE THAN ONE path (the upload route
and the config PATCH route). Each write path must validate independently.

**Rule:** Validate any incoming columnMapping to `{ known field key → non-empty
string }` before persisting. Reject unknown keys and non-string values with 400.
Use the shared `validateColumnMapping()` in `src/lib/market-config.ts` (client-safe,
also reused by the mapper UI) so all entry points agree.

**Why:** preflight (`runPreflight` in `market-csv.ts`) reads mapped values and calls
`.toLowerCase().trim()` on them. A malformed persisted value (e.g. `{status:{}}`)
would throw at runtime and break every later upload for that member. A required-field
check alone is not enough — optional fields can still carry bad values.

**How to apply:** when adding any new way to set columnMapping, route it through
`validateColumnMapping()`. The preflight read path is also hardened defensively
(`typeof raw === "string"` guard) to tolerate any legacy bad JSON already in the DB.
