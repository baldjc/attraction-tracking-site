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
