---
name: compute_cut column availability vs honest refusal
description: Why on-demand cut availability must verify the mapped header exists in the CSV, not just that a mapping key is set.
---

# compute_cut column availability must verify the real header

The on-demand `compute_cut` tool decides whether a dimension/filter is answerable from a member's RAW upload. Mapped fields (neighbourhood, style/propertyType, yearBuilt) are configured via the member's `columnMapping`, but a mapping key being present does NOT guarantee the header it points at exists in *this* upload's CSV.

**Rule:** availability for a mapped column must resolve the mapped header against the CSV's actual headers (same normalize-and-lookup `readMappedCell` uses) before declaring the dimension/filter available. Presence of the mapping key alone is insufficient.

**Why:** if a mapping points at a header absent from the uploaded CSV, a key-presence check passes the honesty gate, then the tool silently degrades into empty/"Unknown" buckets or a misleading `no_match` instead of the correct honest `unavailable`. That quietly weakens the grounding/refusal guarantee the whole feature exists to protect.

**How to apply:** keep the two refusal classes distinct — `unavailable` = the COLUMN genuinely isn't in the upload (column missing or mapped header unresolved); `no_match` = the column exists but the requested VALUE (e.g. "townhouse") isn't in the data, and the note must list the values that DO exist. Never proxy a missing property class through the style column (or vice-versa); class = raw "Property Type" header, style = mapped propertyType run through normalizePropertyType.

Tests live alongside the lib (`computeCut.test.ts`, run via `npx tsx --test`); the `runComputeCut` integration cases stub deps (prisma/readCsv/getMarketConfig/loadSettings) so the gate is asserted without a real DB or Object Storage. Note the extraction log field is `resultClassification`, not `classification`.

## Surface per-member distinct VALUES so Jarvis routes to the right dimension

The engine honestly refuses to proxy property class through style (above). But that left a routing gap: a member with NO raw "Property Type" column who mapped their property CLASSES (Single Family / Townhouse / Condo) onto the **style** column will only ever answer "single family"/"property type" requests if the model knows those values live under `style`, not `propertyClass`. The system prompt's generic example ("style = Bungalow / 2 Storey") actively mislead it, so property-type queries silently failed even though the data was there.

**Rule:** `resolveAvailableCutDimensions` surfaces the ACTUAL distinct values per categorical dimension (`dimensionValues: DimensionValueSet[]`, dims `style`/`propertyClass`/`city`, top-12-by-frequency, `truncated` flag). Compute each value with the SAME cell reader the row reader uses — style via `normalizePropertyType(readMappedCell(...)).type`, class via `propertyClassHeader`, city via `cityHeader` — so the surfaced strings exactly match the buckets a real cut produces. The orchestrator passes them into `buildJarvisDynamicContext` (per-member DYNAMIC context, NOT the cached static prefix), rendered as "Distinct values per dimension". The static prefix only carries the generic instruction to route the member's wording to whichever dimension's surfaced values hold the term.

**Why:** TELLING the model where values live is the only fix that doesn't violate the no-proxy engine rule — the engine still never maps class→style; it just advertises that, for this member, "Single Family" is a style value. Verified live: "single family just over 3,000 sq ft" → filterStyle + sqft≥3000; "break down by property type" → dimension=style.

**How to apply:** neighbourhood is deliberately excluded from value surfacing (hundreds of values, already in market config). If you add a categorical dimension worth routing, add it to `VALUE_SURFACED_DIMENSIONS` and read its value with the matching row-reader logic — never a different normalizer, or the surfaced values won't match real buckets.
