---
name: City dimension in on-demand cuts
description: How city/municipality grouping works in the compute_cut (on-demand) path and the single-city byte-for-byte invariant.
---

City is an on-demand-cut-only grouping dimension (compute_cut + compute_yoy_cut + Jarvis); the persisted AggregatedMetric/MarketFact tables still have NO city column (Option A: no DB migration). Same-named neighbourhoods across cities only get disambiguated at on-demand cut time, never in the validated ledger.

**Multi-city scoping gate:** in `computeCut`, when `dimension === "neighbourhood"` AND the scoped rows span >= 2 distinct cities, buckets become `"Neighbourhood (City)"`; otherwise the legacy plain-name path runs. The single-city / no-city-column / already-filtered-to-one-city case must stay byte-for-byte identical.

**Why distinct-city counting must normalize:** count distinct cities by a normalized key (`normalizeCityKey`: lowercase + collapse whitespace), NOT the raw string. Raw counting lets format variants of ONE city ("Plano"/"PLANO"/" plano ") read as 2+ cities and wrongly push a single-city member onto the composite-label path, violating the byte-for-byte invariant. Display labels keep the original string; only the gate uses the normalized key.

**How to apply:** any future change to multi-city detection or city bucket identity must preserve: (1) the >=2-distinct-(normalized)-cities gate, (2) plain labels for single-city, (3) honest `unavailable` when no city column (city alias list lives in market-config.ts: ["city","municipality"], default header "City").

**Read-path self-resolution (the "no city column" false-negative):** members' saved `columnMapping` often has NO `city` key even when their raw CSV literally has a "City" header (city was never in the mapping wizard's required set, unlike neighbourhood/status/prices). Keying availability/read on `mapping.city` alone => false "unavailable". Fix mirrors propertyClass/priceBracket: `resolveCityHeader(mapping.city, headerLookup)` returns the ACTUAL csv header (original case) — explicit mapping first, else `resolveRawHeader(headerLookup, ["city","municipality"])` — and ResolvedColumns carries `cityHeader: string|null` (not a bool); row build reads `raw[cityHeader]`. **Why:** the availability gate and the row reader must agree on the SAME resolved header, and unmapped-but-present columns must still be honestly available. **How to apply:** when adding any new on-demand dimension whose column the mapping wizard does not force, give it a raw-header alias fallback or it silently reports unavailable for most members.

**YoY composes for free:** runYoYCut matches groups by `bucket` and forwards `params.filters` into runComputeCut for both periods, so `dimension="city"` and `filterCity` work in YoY with zero YoY-engine changes — as long as bucket labels are stable across periods.

**Grounding:** for the neighbourhood dimension the composite bucket ("Downtown (Plano)") becomes factNeighbourhood, which is good for disambiguated grounding. dimension="city" sets factNeighbourhood = "All Neighbourhoods" and carries the city in metricName/label.

**Persisted-table collision (future migration, NOT done):** could not measure real same-named-neighbourhood-across-cities collisions in member data — city lives only in the raw CSV in object storage, not queryable from the DB. If a persisted fix is ever wanted it's a separate wave: additive city column + re-aggregation + read-path updates + tests.
